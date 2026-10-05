import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import { APP_CONFIG } from '@/config/app';
import {
  formatDateLong,
  formatDays,
  formatDuration,
  formatGigabytes,
  formatNumber,
  hasSubscription,
  isSubscriptionActive,
  subscriptionBadge,
  subscriptionRemainingPct,
} from '@/lib/format';
import type { Subscription } from '@/types';

interface SubscriptionCardProps {
  subscription: Subscription | null;
  /** Основное действие: «Управлять подпиской» / «Продлить подписку». */
  primaryLabel: string;
  onPrimary: () => void;
  /** Вторичное действие: «Получить конфигурацию». */
  onSecondary?: () => void;
  secondaryLabel?: string;
}

/**
 * Главная карточка состояния подписки (ТЗ п. 3 и п. 6).
 *
 * Если подписки нет — показываем призыв к покупке вместо пустого места
 * (ТЗ п. 4). Все значения приходят с backend.
 */
export function SubscriptionCard({
  subscription,
  primaryLabel,
  onPrimary,
  onSecondary,
  secondaryLabel = 'Получить конфигурацию',
}: SubscriptionCardProps) {
  const active = isSubscriptionActive(subscription);
  const present = hasSubscription(subscription);

  /* ── Подписки нет ────────────────────────────────────────────────────── */
  if (!present || !subscription) {
    return (
      <Card tone="blue" className="hero" appear>
        <div className="row-flex">
          <div className="hero__icon">
            <Icon name="lock" size={26} />
          </div>
          <StatusBadge label="VPN не подключён" tone="off" />
        </div>

        <h2 className="hero__title">У вас пока нет VPN-подписки</h2>
        <p className="state__text" style={{ textAlign: 'left', marginBottom: 4 }}>
          Выберите подходящий тариф и получите доступ к VPN.
        </p>

        <div className="mt-5">
          <Button onClick={onPrimary} icon={<Icon name="bolt" size={19} />}>
            Купить VPN
          </Button>
        </div>
      </Card>
    );
  }

  /* ── Подписка есть ───────────────────────────────────────────────────── */
  const badge = subscriptionBadge(subscription.status);
  const remainingPct = subscriptionRemainingPct(subscription);
  const expiringSoon =
    subscription.status === 'expiring' ||
    (subscription.remainingDays !== null &&
      subscription.remainingDays <= APP_CONFIG.expiringSoonDays);

  return (
    <>
      <Card tone="blue" className="hero" appear>
        <div className="row-flex row-flex--between">
          <div className="hero__icon">
            <Icon name={active ? 'shield' : 'clock'} size={26} />
          </div>
          <StatusBadge
            label={active ? 'VPN активен' : badge.label}
            tone={active ? 'active' : badge.tone}
            pulse={active}
          />
        </div>

        <h2 className="hero__title">
          {active ? 'Защищённое соединение включено' : 'Подписка истекает'}
        </h2>

        {/* Прогресс оставшегося срока — чисто визуальная метрика. */}
        {subscription.durationDays !== null && subscription.remainingDays !== null && (
          <div className="mt-4">
            <div className="row-flex row-flex--between t-xs t-muted" style={{ marginBottom: 7 }}>
              <span>Осталось {formatDays(subscription.remainingDays)}</span>
              <span className="t-num">{remainingPct}%</span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuenow={remainingPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Остаток срока подписки"
            >
              <div
                className={`bar__fill${expiringSoon ? ' bar__fill--low' : ''}`}
                style={{ width: `${remainingPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="dl">
            <div className="dl__item">
              <span className="dl__k">Тариф</span>
              <span className="dl__v">{subscription.planName ?? formatDuration(subscription.durationDays)}</span>
            </div>
            <div className="dl__item">
              <span className="dl__k">Действует до</span>
              <span className="dl__v">{formatDateLong(subscription.expiresAt)}</span>
            </div>
            <div className="dl__item">
              <span className="dl__k">Осталось</span>
              <span className="dl__v">{formatDays(subscription.remainingDays)}</span>
            </div>
            {subscription.trafficLimitGb !== null && (
              <div className="dl__item">
                <span className="dl__k">Трафик</span>
                <span className="dl__v">
                  {formatGigabytes(subscription.trafficUsedGb)} / {formatGigabytes(subscription.trafficLimitGb)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 stack stack-3">
          <Button onClick={onPrimary} icon={<Icon name="card" size={18} />}>
            {primaryLabel}
          </Button>
          {onSecondary && active && (
            <Button
              variant="secondary"
              onClick={onSecondary}
              icon={<Icon name="download" size={18} />}
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}

/**
 * Компактная плашка со сводкой (главный экран, если статус уже показан выше).
 */
export function SubscriptionSummary({ subscription }: { subscription: Subscription | null }) {
  if (!subscription || !hasSubscription(subscription)) return null;

  const days = subscription.remainingDays;

  return (
    <div className="row-flex" style={{ gap: 10 }}>
      <StatPill
        value={formatNumber(subscription.deviceLimit ?? 1)}
        label="устройств"
      />
      <StatPill value={formatDuration(subscription.durationDays)} label="тариф" />
      <StatPill value={days !== null ? formatNumber(days) : '—'} label="дней" />
    </div>
  );
}

export function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="pill-stat">
      <div className="pill-stat__v">{value}</div>
      <div className="pill-stat__k">{label}</div>
    </div>
  );
}