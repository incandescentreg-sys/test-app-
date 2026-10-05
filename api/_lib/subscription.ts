/**
 * Логика подписки: выдача доступа, продление, синхронизация с панелью.
 *
 * Панель H1VLESS — источник истины по сроку. Наша база хранит копию для
 * быстрых выборок, но перед выдачей конфигурации всегда сверяется с панелью.
 */

import type { Subscription } from '@prisma/client';
import { DEVICE_LIMIT, EXPIRING_SOON_DAYS, TRAFFIC_LIMIT_GB } from './env.ts';
import {
  clientNameFor,
  fetchClient,
  fetchNodeLabel,
  parseHostPort,
  pickLink,
  provisionClient,
  revokeClient,
  type H1VlessClient,
} from './h1vless.ts';
import { log, logError } from './http.ts';
import { prisma } from './prisma.ts';

const MS_PER_DAY = 86_400_000;

/* ── Статус ──────────────────────────────────────────────────────────────── */

export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'none' | 'pending' | 'frozen';

/**
 * Статус подписки. Считается на сервере: клиент не должен решать,
 * действует доступ или нет.
 */
export function computeStatus(
  subscription: Subscription | null,
  now: Date = new Date(),
): SubscriptionStatus {
  if (!subscription) return 'none';
  if (subscription.frozen) return 'frozen';
  if (!subscription.expiresAt) return 'pending';

  const remainingMs = subscription.expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'expired';

  const soonMs = EXPIRING_SOON_DAYS() * MS_PER_DAY;
  return remainingMs <= soonMs ? 'expiring' : 'active';
}

export function isActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'expiring';
}

export function remainingDays(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY));
}

/* ── Выдача и продление ──────────────────────────────────────────────────── */

export interface GrantResult {
  subscription: Subscription;
  /** true — создана новая подписка, false — продлена существующая. */
  isNew: boolean;
}

/**
 * Выдаёт или продлевает доступ в панели H1VLESS.
 *
 * Продление всегда идёт через `provisionClient`: панель сама разберётся,
 * есть клиент или нет, и выдаст нужное число дней. Мы дублировать эту логику
 * не должны — иначе срок разъедется.
 */
/**
 * Минимум от тарифа, который нужен для выдачи доступа.
 * Позволяет звать grantAccess и из ручной выдачи без полной строки БД.
 */
export interface PlanLike {
  id: string;
  name: string;
  durationDays: number;
}

export async function grantAccess(
  userId: string,
  telegramId: number,
  plan: PlanLike,
): Promise<GrantResult> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const wasActive = isActive(computeStatus(existing));
  const isNew = !wasActive;

  const { client } = await provisionClient(telegramId, plan.durationDays, {
    trafficLimitGb: TRAFFIC_LIMIT_GB(),
    deviceLimit: DEVICE_LIMIT(),
  });

  const expiresAt = client.expires_at ? new Date(client.expires_at * 1000) : new Date(Date.now() + plan.durationDays * MS_PER_DAY);
  const startAt = isNew
    ? new Date((client.created_at || Math.floor(Date.now() / 1000)) * 1000)
    : (existing?.startAt ?? new Date());

  const link = pickLink(client);

  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      startAt,
      expiresAt,
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      h1vlessSyncedAt: new Date(),
      renewCount: 0,
    },
    update: {
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      // Продление: срок берём ОТ ПАНЕЛИ, а не прибавляем сами.
      expiresAt,
      frozen: false,
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      h1vlessSyncedAt: new Date(),
      renewCount: { increment: isNew ? 0 : 1 },
    },
  });

  log('subscription', isNew ? 'granted' : 'renewed', { days: plan.durationDays });
  return { subscription, isNew };
}

/**
 * Синхронизация локальной копии подписки с панелью.
 *
 * Панель — источник истины: админ мог продлить или забанить клиента руками.
 * Ошибка сети не должна ломать чтение — тогда просто отдаём копию из базы.
 */
export async function syncFromPanel(
  subscription: Subscription | null,
  telegramId: number,
): Promise<Subscription | null> {
  if (!subscription) return null;

  const name = subscription.h1vlessName ?? clientNameFor(telegramId);

  let client: H1VlessClient | null;
  try {
    client = await fetchClient(name);
  } catch (error) {
    logError('subscription', 'panel sync failed', error);
    return subscription;
  }

  // Клиента нет — доступа тоже нет.
  if (!client) {
    log('subscription', 'client missing on panel');
    return subscription;
  }

  const expiresAt = client.expires_at ? new Date(client.expires_at * 1000) : null;
  const link = pickLink(client);
  const subUrl = client.sub_url || null;

  // Пишем в базу только если что-то реально разошлось с панелью,
  // иначе каждый чтение главного экрана писало бы в базу.
  const expiryDriftMs = expiresAt
    ? Math.abs((subscription.expiresAt?.getTime() ?? 0) - expiresAt.getTime())
    : 0;

  const changed =
    subscription.h1vlessUuid !== client.uuid ||
    subscription.h1vlessLink !== link ||
    subscription.h1vlessSubUrl !== subUrl ||
    expiryDriftMs > 1000;

  if (!changed) return subscription;

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      ...(expiresAt ? { expiresAt } : {}),
      h1vlessSyncedAt: new Date(),
    },
  });
}

/**
 * Продление не выдало новый срок или срок уже истёк — снимаем доступ.
 * Ошибка панели не пробрасывается: пользователь не должен видеть 500.
 */
export async function expireIfNeeded(subscription: Subscription | null, telegramId: number): Promise<void> {
  if (!subscription) return;
  if (computeStatus(subscription) !== 'expired') return;
  await revokeClient(telegramId, 'subscription expired');
}

/* ── Сериализация ────────────────────────────────────────────────────────── */

export interface SubscriptionDto {
  status: SubscriptionStatus;
  planId: string | null;
  planName: string | null;
  durationDays: number | null;
  startAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
  autoRenew: boolean;
  trafficUsedGb: number | null;
  trafficLimitGb: number | null;
  deviceLimit: number | null;
}

export function toSubscriptionDto(subscription: Subscription | null): SubscriptionDto {
  return {
    status: computeStatus(subscription),
    planId: subscription?.planId ?? null,
    planName: subscription?.planName ?? null,
    durationDays: subscription?.durationDays ?? null,
    startAt: subscription?.startAt?.toISOString() ?? null,
    expiresAt: subscription?.expiresAt?.toISOString() ?? null,
    remainingDays: remainingDays(subscription?.expiresAt ?? null),
    autoRenew: subscription?.autoRenew ?? false,
    // Трафик и устройства считает панель; в базе их нет — отдаём лимиты.
    trafficUsedGb: null,
    trafficLimitGb: TRAFFIC_LIMIT_GB() || null,
    deviceLimit: DEVICE_LIMIT() || null,
  };
}

export interface VpnConfigDto {
  config: {
    id: string;
    protocol: 'vless';
    subscriptionUrl: string;
    host: string;
    port: number;
    label: string | null;
    updatedAt: string;
    expiresAt: string | null;
    botUrl: string | null;
  };
  subscription: SubscriptionDto;
  availableClients: Array<{
    id: string;
    name: string;
    platforms: string[];
    storeUrl: string | null;
    icon: string | null;
  }>;
}

/** Конфигурация для экрана «Ваш VPN». Ссылка — только из панели, никогда из кэша клиента. */
export async function buildVpnConfig(
  subscription: Subscription | null,
  telegramId: number,
): Promise<VpnConfigDto | null> {
  const name = subscription?.h1vlessName ?? clientNameFor(telegramId);

  let client: H1VlessClient | null = null;
  try {
    client = await fetchClient(name);
  } catch (error) {
    // Обрыв связи с панелью — отдаём последнюю известную ссылку,
    // а не 500: пользователь сможет подключиться по сохранённой конфигурации.
    logError('vpn', 'panel request failed', error);
  }

  // Имя ноды — отдельно и в фоне: /status не критичен для выдачи конфигурации.
  const nodeLabel = await fetchNodeLabel();

  const link = client ? pickLink(client) : (subscription?.h1vlessLink ?? null);
  if (!link) return null;

  const { host, port } = parseHostPort(link);
  const dto = toSubscriptionDto(subscription);

  return {
    config: {
      id: subscription?.id ?? 'vpn',
      protocol: 'vless',
      subscriptionUrl: link,
      host,
      port,
      // Человекочитаемое имя ноды с панели — если панель его отдала.
      label: nodeLabel ?? null,
      updatedAt: (subscription?.h1vlessSyncedAt ?? new Date()).toISOString(),
      expiresAt: dto.expiresAt,
      // Ссылка-подписка по UUID: её открывает клиент, а не браузер.
      botUrl: client?.sub_url ?? subscription?.h1vlessSubUrl ?? null,
    },
    subscription: dto,
    availableClients: [
      {
        id: 'happ',
        name: 'Happ',
        platforms: ['ios', 'android', 'desktop'],
        storeUrl: 'https://apps.apple.com/app/happ-client/id1437656443',
        icon: '🟢',
      },
      {
        id: 'streisand',
        name: 'Streisand',
        platforms: ['ios', 'android'],
        storeUrl: 'https://apps.ru/app/streisand/id6458534994',
        icon: '🪄',
      },
      {
        id: 'v2rayng',
        name: 'v2rayNG',
        platforms: ['android'],
        storeUrl: 'https://play.google.com/store/apps/details?id=com.2ray.ang',
        icon: '🤖',
      },
      {
        id: 'v2box',
        name: 'V2Box',
        platforms: ['ios'],
        storeUrl: 'https://apps.apple.com/app/v2box/id6447111083',
        icon: '🍎',
      },
    ],
  };
}