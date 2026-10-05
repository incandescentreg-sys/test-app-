/**
 * Экран подтверждения заказа и оплаты (ТЗ п. 8).
 *
 * Правила безопасности:
 *  • сумма на экране — ИЗ ОТВЕТА BACKEND'А, а не из клика пользователя;
 *  • после кнопки «Оплатить» UI НЕ показывает успех — он ждёт `paid`
 *    от backend'а, который выставляет его по webhook'у провайдера;
 *  • если сеть отвалилась, статус не сбрасывается: показываем, что
 *    подтверждаем оплату, и продолжаем опрос.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { useCheckout } from '@/hooks/useCheckout';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/useToast';
import { APP_CONFIG, COPY } from '@/config/app';
import { formatDateCompact, formatMoney } from '@/lib/format';
import { haptic, openPaymentLink } from '@/lib/telegram';
import { useRouter } from '@/lib/router';

type Phase = 'idle' | 'paying' | 'verifying' | 'failed';

export default function CheckoutPage() {
  const { back, canGoBack, replace, reset } = useRouter();
  const { begin, order, plan, pollOnce, pollUntilFinal, reset: resetCheckout } = useCheckout();
  const { setSubscription, refreshSubscription } = useSession();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const pollAbort = useRef(false);

  // Намеренно НЕ очищаем чекаут при размонтировании: состояние живёт в
  // CheckoutProvider выше роутера, а `selectPlan()` на экране тарифов сам
  // сбрасывает устаревший заказ. Эффект очистки здесь ломал бы поток покупки:
  // в StrictMode он вызывается сразу после монтирования и стирал выбранный тариф.

  // Возвращаемся с этого экрана — отменяем опрос, чтобы он не крутился в фоне.
  useEffect(() => {
    return () => {
      pollAbort.current = true;
    };
  }, []);

  const handlePay = useCallback(async () => {
    if (!plan || phase === 'paying' || phase === 'verifying') return;

    setPhase('paying');
    setFailure(null);
    pollAbort.current = false;

    // 1. Создаём заказ на backend'е. Он сам знает цену и решает,
    //    новая это подписка или продление существующей.
    const created = await begin(plan);
    if (!created) {
      setPhase('failed');
      haptic.error();
      return;
    }

    // 2. Открываем страницу оплаты у провайдера.
    setPhase('verifying');

    if (!created.paymentUrl) {
      toast.error('Ссылка на оплату недоступна. Попробуйте ещё раз.');
      setPhase('failed');
      return;
    }

    openPaymentLink(created.paymentUrl);
    toast.show('Оплатите в открывшемся окне', 'info', 3200);

    // 3. Ждём, пока backend подтвердит оплату по webhook'у провайдера.
    const status = await pollUntilFinal((tick) => setAttempt(tick));

    if (pollAbort.current) return;

    if (!status) {
      // Таймаут опроса — платёж мог пройти. Не говорим «не оплачено».
      setPhase('idle');
      setAttempt(0);
      toast.show('Платёж ещё подтверждается. Проверим через минуту.', 'info', 3400);
      void refreshSubscription();
      return;
    }

    if (status.status === 'paid') {
      haptic.success();
      if (status.subscription) setSubscription(status.subscription);
      else void refreshSubscription();
      resetCheckout();
      replace('payment-success');
      return;
    }

    // Неуспешный терминальный статус.
    setPhase('failed');
    setFailure(
      status.status === 'expired'
        ? COPY.errors.paymentExpired
        : status.failureReason ?? COPY.errors.paymentFailed,
    );
    haptic.error();
  }, [
    plan,
    phase,
    begin,
    pollUntilFinal,
    toast,
    setSubscription,
    refreshSubscription,
    replace,
    resetCheckout,
  ]);

  /* ── Ещё нет заказа: просто показываем состав заказа ──────────────── */
  if (!plan) {
    return (
      <>
        <Header title="Ваш заказ" onBack={canGoBack ? back : null} />
        <div className="screen screen--plain">
          <ErrorState
            title="Заказ не найден"
            message="Выберите тариф, чтобы оформить подписку."
            retryLabel="Выбрать тариф"
            onRetry={() => reset('home')}
          />
        </div>
      </>
    );
  }

  const amount = order?.amount ?? plan.price;
  const currency = order?.currency ?? plan.currency;
  const busy = phase === 'paying' || phase === 'verifying';

  return (
    <>
      <Header
        title="Ваш заказ"
        subtitle="Проверьте данные перед оплатой"
        onBack={canGoBack && !busy ? back : null}
      />

      <div className="screen screen--plain">
        {/* ── Состав заказа ──────────────────────────────────────────── */}
        <Card appear className="card--lg">
          <div className="row-flex row-flex--between mb-4">
            <span className="t-h3">Подписка</span>
            <span className="chip">{plan.name}</span>
          </div>

          <div className="dl">
            <div className="dl__item">
              <span className="dl__k">Тариф</span>
              <span className="dl__v">{plan.name}</span>
            </div>
            <div className="dl__item">
              <span className="dl__k">Стоимость</span>
              <span className="dl__v t-price">{formatMoney(amount, currency)}</span>
            </div>
            <div className="dl__item">
              <span className="dl__k">Срок</span>
              <span className="dl__v">{plan.durationDays} дней</span>
            </div>
            {order?.expiresAt && (
              <div className="dl__item">
                <span className="dl__k">Оплатить до</span>
                <span className="dl__v">{formatDateCompact(order.expiresAt)}</span>
              </div>
            )}
          </div>

          <div className="divider mt-4 mb-4" />

          <div className="row-flex row-flex--between">
            <span className="t-h3">Итого</span>
            <span className="t-price">{formatMoney(amount, currency)}</span>
          </div>
        </Card>

        {/* ── Статус подтверждения ───────────────────────────────────── */}
        {phase === 'verifying' && (
          <div className="card mt-4" style={{ borderColor: 'var(--c-line-accent)' }}>
            <div className="row-flex">
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: '2px solid var(--c-primary-200)',
                  borderTopColor: 'var(--c-primary)',
                  animation: 'spin .7s linear infinite',
                  flex: '0 0 auto',
                }}
              />
              <span className="grow">
                <span className="t-medium" style={{ display: 'block' }}>
                  Подтверждаем оплату
                </span>
                <span className="t-sm t-muted mt-1" style={{ display: 'block', lineHeight: 1.4 }}>
                  Это занимает несколько секунд. Не закрывайте приложение.
                </span>
              </span>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="card mt-4" style={{ borderColor: 'var(--c-danger)' }}>
            <div className="row-flex" style={{ alignItems: 'flex-start' }}>
              <Icon name="alert" size={20} style={{ color: 'var(--c-danger)' }} />
              <div className="grow">
                <p className="t-medium">Оплата не завершена</p>
                <p className="t-sm t-muted mt-2" style={{ lineHeight: 1.45 }}>
                  {failure ?? COPY.errors.paymentFailed}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Предупреждение о продлении ─────────────────────────────── */}
        <p className="t-xs t-muted t-center mt-4" style={{ lineHeight: 1.5 }}>
          После оплаты подписка{order ? ' продлится' : ' активируется'} автоматически.
          Доступ к VPN включится сразу после подтверждения платежа.
        </p>

        {/* ── Кнопки ─────────────────────────────────────────────────── */}
        <div className="stack stack-3 mt-4">
          <Button
            onClick={() => void handlePay()}
            loading={busy}
            disabled={busy}
            icon={busy ? undefined : <Icon name="card" size={18} />}
          >
            {busy
              ? phase === 'paying'
                ? 'Создаём заказ…'
                : `Проверяем…${attempt > 0 ? ` (${Math.min(attempt, 20)})` : ''}`
              : `Оплатить ${formatMoney(amount, currency)}`}
          </Button>

          {phase === 'verifying' && (
            <Button
              variant="secondary"
              onClick={async () => {
                const status = await pollOnce();
                if (status?.status === 'paid') {
                  haptic.success();
                  if (status.subscription) setSubscription(status.subscription);
                  resetCheckout();
                  replace('payment-success');
                } else {
                  toast.show('Оплата ещё не подтверждена', 'info');
                }
              }}
            >
              Я оплатил, проверить
            </Button>
          )}

          <Button variant="ghost" onClick={() => setShowHelp(true)} icon={<Icon name="help" size={17} />}>
            Проблемы с оплатой?
          </Button>
        </div>

        <div className="divider mt-5 mb-4" />

        <p className="t-xs t-muted t-center" style={{ lineHeight: 1.5 }}>
          Нажимая «Оплатить», вы соглашаетесь с условиями сервиса.
          Оплата проходит через защищённый шлюз платёжного провайдера —
          данные карты приложение не получает и не хранит.
        </p>
      </div>

      <Modal open={showHelp} title="Проблемы с оплатой?" onClose={() => setShowHelp(false)}>
        <div className="stack stack-3">
          <div className="card card--tight card--flat" style={{ background: 'var(--c-primary-50)' }}>
            <div className="row-flex" style={{ alignItems: 'flex-start' }}>
              <Icon name="info" size={18} style={{ color: 'var(--c-primary-dark)', flex: '0 0 auto' }} />
              <p className="t-sm grow" style={{ lineHeight: 1.5 }}>
                Если деньги списались, но подписка не активировалась — нажмите «Я оплатил,
                проверить». Если не помогло, напишите в поддержку: мы сверим платёж по времени операции.
              </p>
            </div>
          </div>

          <div className="stack stack-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowHelp(false);
                reset('help');
              }}
              icon={<Icon name="book" size={17} />}
            >
              Открыть справку
            </Button>
            {APP_CONFIG.support.url && (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowHelp(false);
                  const url = APP_CONFIG.support.url;
                  if (url) openPaymentLink(url);
                }}
                icon={<Icon name="telegram" size={17} />}
              >
                Написать в поддержку
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}