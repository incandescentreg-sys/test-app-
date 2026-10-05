/**
 * Экран «Профиль» (ТЗ п. 15).
 *
 * Имя, username и Telegram ID берутся ИЗ ОТВЕТА BACKEND'А (`/api/me/profile`),
 * а не из `initDataUnsafe`. Фронтенд показывает то, что сервер подтвердил.
 */

import { useCallback } from 'react';
import { getProfile } from '@/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { ProfileSkeleton } from '@/components/LoadingSkeleton';
import { Section } from '@/components/Layout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/hooks/useSession';
import { APP_CONFIG } from '@/config/app';
import { useRouter } from '@/lib/router';
import {
  formatDateCompact,
  formatDays,
  formatMoney,
  formatNumber,
  isSubscriptionActive,
  subscriptionBadge,
} from '@/lib/format';
import { closeApp, openLink, openTelegramLink } from '@/lib/telegram';
import type { Profile } from '@/types';

export default function ProfilePage() {
  const { navigate, reset } = useRouter();
  const { outsideTelegram } = useSession();

  const state = useAsync<Profile>(useCallback((signal) => getProfile(signal), []), []);

  const profile = state.data;
  const user = profile?.user;
  const sub = profile?.subscription;
  const referral = profile?.referral;

  const active = isSubscriptionActive(sub);
  const badge = subscriptionBadge(sub?.status ?? 'none');

  const initials = user?.firstName?.charAt(0).toUpperCase() ?? '';

  if (!outsideTelegram && state.loading && !profile) {
    return (
      <>
        <Header title="Профиль" subtitle="Ваш аккаунт" />
        <div className="screen screen--with-nav">
          <ProfileSkeleton />
        </div>
      </>
    );
  }

  if (state.error && !profile) {
    return (
      <>
        <Header title="Профиль" subtitle="Ваш аккаунт" />
        <div className="screen screen--with-nav">
          <ErrorState message={state.error.message} onRetry={() => void state.refetch()} />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Профиль" subtitle="Ваш аккаунт" />

      <div className="screen screen--with-nav">
        {/* ── Карточка пользователя ──────────────────────────────────── */}
        <Card tone="blue" appear className="card--lg">
          <div className="row-flex" style={{ gap: 14 }}>
            <span className="avatar avatar--lg">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                initials || <Icon name="user" size={26} />
              )}
            </span>
            <div className="grow">
              <h2 className="t-h2" style={{ wordBreak: 'break-word' }}>
                {user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : 'Пользователь'}
              </h2>
              {user?.username && <p className="t-sm t-muted mt-1">@{user.username}</p>}
              {user?.createdAt && (
                <p className="t-xs t-muted mt-2">
                  С нами с {formatDateCompact(user.createdAt)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="row-flex row-flex--between">
              <span className="t-sm t-muted">Статус VPN</span>
              <StatusBadge
                label={active ? 'Активен' : badge.label}
                tone={active ? 'active' : badge.tone}
                pulse={active}
              />
            </div>
          </div>
        </Card>

        {/* ── Ключевые цифры ────────────────────────────────────────── */}
        <div className="row-flex mt-4" style={{ gap: 10 }}>
          <div className="pill-stat">
            <div className="pill-stat__v">{formatNumber(referral?.invitedCount ?? 0)}</div>
            <div className="pill-stat__k">Приглашено</div>
          </div>
          <div className="pill-stat">
            <div className="pill-stat__v" style={{ color: 'var(--c-primary-dark)' }}>
              {formatMoney(referral?.balance ?? 0, referral?.currency ?? APP_CONFIG.currency)}
            </div>
            <div className="pill-stat__k">Баланс</div>
          </div>
          <div className="pill-stat">
            <div className="pill-stat__v">
              {sub?.remainingDays !== null && sub?.remainingDays !== undefined
                ? formatNumber(sub.remainingDays)
                : '—'}
            </div>
            <div className="pill-stat__k">Дней</div>
          </div>
        </div>

        {/* ── Подписка ───────────────────────────────────────────────── */}
        <Section title="Подписка">
          <div className="rows">
            <NavRow
              icon="card"
              title="Моя подписка"
              sub={
                sub?.planName
                  ? `${sub.planName} · ${formatDays(sub.remainingDays ?? null)}`
                  : 'Подписка не активна'
              }
              onClick={() => reset('subscription')}
            />
            <NavRow
              icon="download"
              title="Конфигурация VPN"
              sub={active ? 'Скопировать или подключить' : 'Доступна после оплаты'}
              onClick={() => navigate('vpn')}
            />
            <NavRow
              icon="sparkle"
              title="Продлить подписку"
              sub="Выбрать дополнительный срок"
              onClick={() => navigate('plans')}
            />
          </div>
        </Section>

        {/* ── Данные аккаунта ───────────────────────────────────────── */}
        <Section title="Данные аккаунта">
          <div className="rows">
            <InfoRow label="Telegram ID" value={user ? String(user.id) : '—'} mono />
            <InfoRow label="Имя" value={user?.firstName ?? '—'} />
            {user?.lastName && <InfoRow label="Фамилия" value={user.lastName} />}
            {user?.username && <InfoRow label="Username" value={`@${user.username}`} mono />}
            {profile?.stats.firstPurchaseAt && (
              <InfoRow label="Первая покупка" value={formatDateCompact(profile.stats.firstPurchaseAt)} />
            )}
            {profile && profile.stats.purchaseCount > 0 && (
              <InfoRow
                label="Всего оплачено"
                value={formatMoney(profile.stats.totalPaid, APP_CONFIG.currency)}
              />
            )}
          </div>
        </Section>

        {/* ── Рефералы ───────────────────────────────────────────────── */}
        <Section title="Реферальная программа">
          <div className="rows">
            <NavRow
              icon="users"
              title="Пригласить друзей"
              sub={`Заработано ${formatMoney(referral?.totalEarnings ?? 0, referral?.currency ?? APP_CONFIG.currency)}`}
              onClick={() => reset('referrals')}
            />
            {referral && referral.balance > 0 && (
              <NavRow
                icon="wallet"
                title="Вывести средства"
                sub={`Доступно ${formatMoney(referral.balance, referral.currency)}`}
                onClick={() => reset('referrals')}
              />
            )}
          </div>
        </Section>

        {/* ── Помощь и документы ─────────────────────────────────────── */}
        <Section title="Помощь">
          <div className="rows">
            <NavRow
              icon="book"
              title="Инструкция"
              sub="Как подключить VPN"
              onClick={() => navigate('instructions')}
            />
            <NavRow
              icon="help"
              title="Помощь"
              sub="FAQ и связь с поддержкой"
              onClick={() => navigate('help')}
            />
            {APP_CONFIG.privacyUrl ? (
              <button type="button" className="row" onClick={() => openLink(APP_CONFIG.privacyUrl)}>
                <span className="row__icon">
                  <Icon name="shield" size={17} />
                </span>
                <span className="row__body">
                  <span className="row__title">Политика конфиденциальности</span>
                  <span className="row__sub">Как мы храним ваши данные</span>
                </span>
                <span className="row__chevron">
                  <Icon name="external" size={17} />
                </span>
              </button>
            ) : (
              <NavRow
                icon="shield"
                title="Политика конфиденциальности"
                sub="Как мы храним ваши данные"
                onClick={() => navigate('privacy')}
              />
            )}
            {APP_CONFIG.support.username && (
              <NavRow
                icon="telegram"
                title="Поддержка"
                sub={`@${APP_CONFIG.support.username}`}
                onClick={() => openTelegramLink(`https://t.me/${APP_CONFIG.support.username}`)}
              />
            )}
          </div>
        </Section>

        <Button
          variant="ghost"
          className="mt-5"
          onClick={closeApp}
          icon={<Icon name="logout" size={18} />}
        >
          Закрыть приложение
        </Button>

        <p className="t-xs t-muted t-center mt-4">
          {APP_CONFIG.name} · версия {APP_CONFIG.version}
        </p>
      </div>
    </>
  );
}

/* ── Локальные компоненты ─────────────────────────────────────────────── */

function NavRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row__icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="row__body">
        <span className="row__title">{title}</span>
        <span className="row__sub">{sub}</span>
      </span>
      <span className="row__chevron">
        <Icon name="chevron-right" size={18} />
      </span>
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row">
      <span className="row__body">
        <span className="t-sm t-muted">{label}</span>
      </span>
      <span className={`row__value${mono ? ' kv-inline' : ''}`}>{value}</span>
    </div>
  );
}