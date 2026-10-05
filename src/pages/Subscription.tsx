/**
 * Экран «Подписка» (ТЗ п. 6).
 *
 * Показывает текущую подписку целиком и три действия:
 * продлить, получить конфигурацию, инструкцию.
 * Если подписки нет — призыв купить.
 */

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DefinitionList, Section } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { StatusBadge } from '@/components/StatusBadge';
import { SubscriptionSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { useSession } from '@/hooks/useSession';
import { useRouter } from '@/lib/router';
import {
  formatDateLong,
  formatDays,
  formatDuration,
  formatGigabytes,
  hasSubscription,
  isSubscriptionActive,
  subscriptionBadge,
  subscriptionRemainingPct,
} from '@/lib/format';
import type { IconName } from '@/components/Icon';

export default function SubscriptionPage() {
  const { subscription, loading, error, refresh } = useSession();
  const { navigate, reset } = useRouter();

  const present = hasSubscription(subscription);
  const active = isSubscriptionActive(subscription);
  const badge = subscriptionBadge(subscription?.status ?? 'none');
  const remainingPct = subscriptionRemainingPct(subscription);

  return (
    <>
      <Header
        title="Подписка"
        subtitle={present ? 'Ваша текущая подписка' : 'Оформление и продление'}
      />

      <div className="screen screen--with-nav">
        {loading && !subscription ? (
          <SubscriptionSkeleton />
        ) : error && !subscription ? (
          <ErrorState message={error.message} onRetry={() => void refresh()} />
        ) : !present ? (
          <>
            <EmptyState
              icon="lock"
              emoji="🔐"
              title="VPN ещё не подключён"
              text="Оформите подписку, чтобы получить конфигурацию и доступ в интернет."
              actionLabel="Купить подписку"
              onAction={() => navigate('plans')}
            />

            <Section title="Что входит в подписку">
              <div className="rows">
                <InfoRow icon="bolt" title="Быстрое подключение" />
                <InfoRow icon="lock" title="Защита соединения" />
                <InfoRow icon="globe" title="Доступ к заблокированным ресурсам" />
                <InfoRow icon="devices" title="Все ваши устройства" />
              </div>
            </Section>
          </>
        ) : (
          <>
            {/* ── Карточка статуса ─────────────────────────────────────── */}
            <Card tone="blue" className="hero" appear>
              <div className="row-flex row-flex--between">
                <span className="t-h3">Ваша подписка</span>
                <StatusBadge
                  label={active ? 'Активна' : badge.label}
                  tone={active ? 'active' : badge.tone}
                  pulse={active}
                />
              </div>

              {subscription?.durationDays !== null && subscription?.remainingDays !== null && (
                <div className="mt-4">
                  <div className="row-flex row-flex--between t-xs t-muted" style={{ marginBottom: 7 }}>
                    <span>Использовано срока</span>
                    <span className="t-num">{100 - remainingPct}%</span>
                  </div>
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuenow={100 - remainingPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Использование срока подписки"
                  >
                    <div
                      className={`bar__fill${remainingPct <= 15 ? ' bar__fill--low' : ''}`}
                      style={{ width: `${100 - remainingPct}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* ── Детали ────────────────────────────────────────────────── */}
            <div className="mt-4">
              <DefinitionList
                items={[
                  {
                    k: 'Тариф',
                    v: subscription?.planName ?? formatDuration(subscription?.durationDays ?? null),
                  },
                  { k: 'Начало', v: formatDateLong(subscription?.startAt) },
                  { k: 'Окончание', v: formatDateLong(subscription?.expiresAt) },
                  { k: 'Осталось', v: formatDays(subscription?.remainingDays ?? null) },
                  ...(subscription?.deviceLimit !== null && subscription?.deviceLimit !== undefined
                    ? [{ k: 'Устройств', v: String(subscription.deviceLimit) }]
                    : []),
                  ...(subscription?.trafficLimitGb !== null
                    ? [
                        {
                          k: 'Трафик',
                          v: `${formatGigabytes(subscription?.trafficUsedGb ?? null)} / ${formatGigabytes(subscription?.trafficLimitGb ?? null)}`,
                        },
                      ]
                    : []),
                  ...(subscription?.autoRenew !== undefined
                    ? [
                        {
                          k: 'Автопродление',
                          v: subscription.autoRenew ? 'Включено' : 'Выключено',
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            {/* ── Действия ──────────────────────────────────────────────── */}
            <div className="stack stack-3 mt-4">
              <Button
                onClick={() => navigate('plans')}
                icon={<Icon name="sparkle" size={18} />}
              >
                Продлить подписку
              </Button>

              {active && (
                <Button
                  variant="secondary"
                  onClick={() => navigate('vpn')}
                  icon={<Icon name="download" size={18} />}
                >
                  Получить конфигурацию
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => navigate('instructions')}
                icon={<Icon name="book" size={18} />}
              >
                Инструкция по подключению
              </Button>
            </div>

            {subscription?.autoRenew && (
              <p className="t-xs t-muted t-center mt-4" style={{ lineHeight: 1.5 }}>
                Подписка продлится автоматически. Отключить автопродление можно в боте командой{' '}
                <span className="kv-inline">/unsubscribe</span>.
              </p>
            )}

            <Section title="Нужна помощь?">
              <button
                type="button"
                className="row"
                onClick={() => reset('profile')}
                style={{ borderRadius: 16, border: '1px solid var(--c-line)' }}
              >
                <span className="row__icon">
                  <Icon name="help" size={17} />
                </span>
                <span className="row__body">
                  <span className="row__title">Помощь и поддержка</span>
                  <span className="row__sub">Разделы справки и связь с нами</span>
                </span>
                <span className="row__chevron">
                  <Icon name="chevron-right" size={18} />
                </span>
              </button>
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function InfoRow({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="row">
      <span className="row__icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="row__body">
        <span className="row__title">{title}</span>
      </span>
      <Icon name="check" size={18} style={{ color: 'var(--c-success)' }} strokeWidth={2.6} />
    </div>
  );
}