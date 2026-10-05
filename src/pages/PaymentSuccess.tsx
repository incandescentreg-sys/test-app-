/**
 * Экран успешной оплаты (ТЗ п. 9).
 *
 * Показывается ТОЛЬКО когда backend подтвердил `paid` (по webhook'у).
 * Сам по себе этот экран ничего не решает — он лишь отражает решение сервера.
 */

import { useEffect } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { useSession } from '@/hooks/useSession';
import { useRouter } from '@/lib/router';
import { haptic, syncViewportVars } from '@/lib/telegram';
import { formatDateLong, formatDuration, hasSubscription, isSubscriptionActive } from '@/lib/format';

export default function PaymentSuccessPage() {
  const { subscription, refresh, refreshSubscription } = useSession();
  const { navigate, replace, reset } = useRouter();

  const active = isSubscriptionActive(subscription);

  // Подстраховка: подтягиваем актуальное состояние при заходе на экран.
  useEffect(() => {
    syncViewportVars();
    void refreshSubscription();
  }, [refreshSubscription]);

  const handleOpenVpn = () => {
    haptic.medium();
    navigate('vpn');
  };

  return (
    <>
      <div className="screen screen--plain">
        <div className="success">
          <div className="success__ico">
            <Icon name="check" size={40} strokeWidth={3} />
          </div>

          <h1 className="success__title">Оплата успешно завершена</h1>
          <p className="success__text">VPN-подписка активирована.</p>
        </div>

        <div className="mt-5">
          <Card tone="blue" className="hero" appear delay={80}>
            <div className="dl">
              <div className="dl__item">
                <span className="dl__k">Тариф</span>
                <span className="dl__v">{subscription?.planName ?? '—'}</span>
              </div>
              <div className="dl__item">
                <span className="dl__k">Длительность</span>
                <span className="dl__v">
                  {formatDuration(subscription?.durationDays ?? null)}
                </span>
              </div>
              <div className="dl__item">
                <span className="dl__k">Действует до</span>
                <span className="dl__v">{formatDateLong(subscription?.expiresAt)}</span>
              </div>
              {subscription?.remainingDays !== null && subscription?.remainingDays !== undefined && (
                <div className="dl__item">
                  <span className="dl__k">Осталось</span>
                  <span className="dl__v">{subscription.remainingDays} дн.</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="stack stack-3 mt-5">
          <Button
            onClick={handleOpenVpn}
            disabled={!active}
            icon={<Icon name="bolt" size={19} />}
          >
            Открыть VPN
          </Button>

          <Button
            variant="secondary"
            onClick={() => reset('subscription')}
            icon={<Icon name="card" size={18} />}
          >
            Моя подписка
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              void refresh();
              reset('home');
            }}
            icon={<Icon name="home" size={18} />}
          >
            Главная
          </Button>
        </div>

        {/* Если VPN ещё создаётся на стороне H1VLESS — объясняем это честно. */}
        {!hasSubscription(subscription) && (
          <div className="card mt-4" style={{ borderColor: 'var(--c-warning)' }}>
            <div className="row-flex" style={{ alignItems: 'flex-start' }}>
              <Icon name="clock" size={18} style={{ color: 'var(--c-warning)' }} />
              <p className="t-sm grow" style={{ lineHeight: 1.5 }}>
                Оплата прошла. Подписка появится в течение минуты — обновите экран подписки,
                чтобы увидеть конфигурацию.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void refresh()}
              icon={<Icon name="refresh" size={16} />}
            >
              Обновить
            </Button>
          </div>
        )}

        <p className="t-xs t-muted t-center mt-5" style={{ lineHeight: 1.5 }}>
          Следующий шаг — скопировать конфигурацию и добавить её в VPN-приложение.
        </p>

        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          fullWidth={false}
          onClick={() => replace('instructions')}
        >
          Инструкция по подключению
        </Button>
      </div>
    </>
  );
}