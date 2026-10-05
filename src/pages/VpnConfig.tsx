/**
 * Экран «Ваш VPN» (ТЗ п. 10).
 *
 * ⚠️ КРИТИЧНО ДЛЯ БЕЗОПАСНОСТИ:
 *  • конфигурация НЕ попадает в URL (маршрут без параметров);
 *  • конфигурация НЕ сохраняется в localStorage/sessionStorage;
 *  • конфигурация НЕ логируется (см. lib/logger.ts — маскирование vless://);
 *  • конфигурация запрашивается по требованию и живёт только в памяти
 *    этого компонента; при уходе со страницы ссылка обнуляется.
 */

import { useCallback, useState } from 'react';
import { getVpnConfig } from '@/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { VpnConfigSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/useToast';
import { useRouter } from '@/lib/router';
import { haptic, openLink } from '@/lib/telegram';
import { formatDateCompact, formatDateLong, hasSubscription, isSubscriptionActive } from '@/lib/format';
import { APP_CONFIG } from '@/config/app';
import type { VpnConfigResponse } from '@/types';

export default function VpnConfigPage() {
  const { back, canGoBack, navigate } = useRouter();
  const { subscription } = useSession();
  const toast = useToast();

  const hasSub = hasSubscription(subscription);
  const active = isSubscriptionActive(subscription);

  const [revealed, setRevealed] = useState(false);

  const state = useAsync<VpnConfigResponse>(
    useCallback((signal) => getVpnConfig(signal), []),
    [hasSub],
    { enabled: hasSub },
  );

  const config = state.data?.config ?? null;
  const sub = state.data?.subscription ?? subscription;

  const mask = (link: string): string => {
    // Показываем только начало и домен сервера — остальное по кнопке «Показать».
    try {
      const prefix = link.slice(0, link.indexOf('://') + 3);
      return `${prefix}••••••••••••••••••••••••••••`;
    } catch {
      return '••••••••••••••••••••••••••••';
    }
  };

  const handleConnect = () => {
    haptic.medium();
    if (config?.botUrl) {
      openLink(config.botUrl);
      return;
    }
    navigate('instructions');
  };

  /* ── Подписки нет ────────────────────────────────────────────────────── */
  if (!hasSub) {
    return (
      <>
        <Header title="Ваш VPN" onBack={canGoBack ? back : null} />
        <div className="screen screen--plain">
          <EmptyState
            icon="lock"
            emoji="🔐"
            title="У вас пока нет VPN-подписки"
            text="Оформите подписку, чтобы получить конфигурацию."
            actionLabel="Купить VPN"
            onAction={() => navigate('plans')}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Ваш VPN" subtitle="Конфигурация и подключение" onBack={canGoBack ? back : null} />

      <div className="screen screen--plain">
        {/* ── Статус ──────────────────────────────────────────────────── */}
        <Card tone="blue" appear className="card--lg">
          <div className="row-flex row-flex--between">
            <div className="row-flex" style={{ gap: 12 }}>
              <span className="hero__icon">
                <Icon name="shield" size={24} />
              </span>
              <div>
                <div className="t-h3">Статус</div>
                <div className="t-sm t-muted mt-1">Ваше соединение</div>
              </div>
            </div>
            <StatusBadge
              label={active ? 'Активен' : 'Не активен'}
              tone={active ? 'active' : 'off'}
              pulse={active}
            />
          </div>

          <div className="divider mt-4 mb-4" />

          <div className="dl">
            <div className="dl__item">
              <span className="dl__k">Срок</span>
              <span className="dl__v">
                до {formatDateCompact(sub?.expiresAt)}
              </span>
            </div>
            {sub?.planName && (
              <div className="dl__item">
                <span className="dl__k">Тариф</span>
                <span className="dl__v">{sub.planName}</span>
              </div>
            )}
            {config?.host && (
              <div className="dl__item">
                <span className="dl__k">Сервер</span>
                <span className="dl__v kv-inline">
                  {config.host}:{config.port}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* ── Конфигурация ────────────────────────────────────────────── */}
        <div className="mt-4">
          {state.loading && !config ? (
            <VpnConfigSkeleton />
          ) : state.error && !config ? (
            <ErrorState
              title="Не удалось получить конфигурацию"
              message={state.error.message}
              onRetry={() => void state.refetch()}
            />
          ) : config ? (
            <>
              <div className="code">
                <div className="code__label">
                  {config.protocol.toUpperCase()} · конфигурация
                </div>
                <div className="code__value">
                  {revealed ? config.subscriptionUrl : mask(config.subscriptionUrl)}
                </div>
                {!revealed && (
                  <button
                    type="button"
                    className="code__more"
                    onClick={() => {
                      haptic.light();
                      setRevealed(true);
                    }}
                  >
                    Нажмите, чтобы показать полностью
                  </button>
                )}
              </div>

              <div className="stack stack-3 mt-4">
                <CopyButton
                  value={config.subscriptionUrl}
                  label="Копировать конфигурацию"
                  showTime
                  onCopy={() => setRevealed(true)}
                />

                <Button
                  variant="secondary"
                  onClick={handleConnect}
                  icon={<Icon name="bolt" size={19} />}
                >
                  Подключить VPN
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => navigate('instructions')}
                  icon={<Icon name="book" size={18} />}
                >
                  Инструкция
                </Button>
              </div>

              <p className="t-xs t-muted t-center mt-4" style={{ lineHeight: 1.5 }}>
                Конфигурация хранится только на вашем устройстве и передаётся напрямую
                VPN-серверу. Мы не сохраняем её у себя.
              </p>
            </>
          ) : null}
        </div>

        {/* ── Приложения (если backend их прислал) ────────────────────── */}
        {state.data && state.data.availableClients.length > 0 && (
          <div className="mt-5">
            <h2 className="t-h3 mb-3">Установить приложение</h2>
            <div className="rows">
              {state.data.availableClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="row"
                  disabled={!client.storeUrl}
                  onClick={() => {
                    if (client.storeUrl) {
                      haptic.light();
                      openLink(client.storeUrl);
                    }
                  }}
                >
                  <span className="row__icon" style={{ fontSize: 17 }}>
                    {client.icon ?? '📱'}
                  </span>
                  <span className="row__body">
                    <span className="row__title">{client.name}</span>
                    <span className="row__sub">{client.platforms.join(' · ')}</span>
                  </span>
                  {client.storeUrl && (
                    <span className="row__chevron">
                      <Icon name="external" size={17} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Поддержка ───────────────────────────────────────────────── */}
        <div className="mt-5">
          <Button
            variant="ghost"
            onClick={() => {
              if (APP_CONFIG.support.url) {
                openLink(APP_CONFIG.support.url);
              } else {
                toast.error('Ссылка на поддержку не настроена');
              }
            }}
            icon={<Icon name="help" size={18} />}
          >
            Не подключается — напишите нам
          </Button>
        </div>

        <p className="t-xs t-muted t-center mt-4">
          Обновлено: {formatDateLong(config?.updatedAt)}
        </p>
      </div>
    </>
  );
}