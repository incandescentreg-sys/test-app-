/**
 * Экран «Выбор тарифа» (ТЗ п. 7).
 *
 * Критично (п. 31): цены приходят из `GET /api/plans`. Здесь нет ни одной
 * захардкоженной цифры — только форматирование того, что вернул сервер.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPlans } from '@/api';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { PlansSkeleton } from '@/components/LoadingSkeleton';
import { PlanCard } from '@/components/PlanCard';
import { useAsync } from '@/hooks/useAsync';
import { useCheckout } from '@/hooks/useCheckout';
import { useRouter } from '@/lib/router';
import { haptic } from '@/lib/telegram';
import { formatMoney } from '@/lib/format';
import type { Plan } from '@/types';

export default function PlansPage() {
  const { navigate, back, canGoBack } = useRouter();
  const { selectPlan } = useCheckout();
  const [selected, setSelected] = useState<Plan | null>(null);

  const plansState = useAsync<Plan[]>(
    useCallback((signal) => getPlans(signal), []),
    [],
  );

  const plans = plansState.data ?? [];

  // По умолчанию выбираем «популярный» тариф, иначе первый доступный.
  useEffect(() => {
    if (plans.length === 0 || selected !== null) return;
    const popular = plans.find((p) => p.isPopular) ?? plans[0];
    if (popular) setSelected(popular);
  }, [plans, selected]);

  const selectedIndex = useMemo(
    () => (selected ? plans.findIndex((p) => p.id === selected.id) : -1),
    [plans, selected],
  );

  const handleContinue = () => {
    if (!selected) return;
    haptic.medium();
    // Тариф передаём в состояние чекаута (в памяти), а не в URL.
    selectPlan(selected);
    navigate('checkout');
  };

  return (
    <>
      <Header
        title="Выберите тариф"
        subtitle="Срок подписки и стоимость"
        onBack={canGoBack ? back : null}
      />

      <div className="screen screen--plain">
        {plansState.loading && plans.length === 0 ? (
          <PlansSkeleton count={4} />
        ) : plansState.error && plans.length === 0 ? (
          <ErrorState message={plansState.error.message} onRetry={() => void plansState.refetch()} />
        ) : plans.length === 0 ? (
          <EmptyState
            icon="card"
            emoji="📋"
            title="Тарифы временно недоступны"
            text="Загляните позже — мы уже готовим новые планы."
            actionLabel="Обновить"
            onAction={() => void plansState.refetch()}
          />
        ) : (
          <>
            <div
              className="plan-stack"
              role="radiogroup"
              aria-label="Тарифы подписки"
            >
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selected?.id === plan.id}
                  onSelect={setSelected}
                />
              ))}
            </div>

            {/* Краткая выжимка по выбранному тарифу */}
            {selected && (
              <div className="card card--flat mt-5" style={{ background: 'var(--c-primary-50)' }}>
                <div className="dl">
                  <div className="dl__item">
                    <span className="dl__k">Выбрано</span>
                    <span className="dl__v">{selected.name}</span>
                  </div>
                  <div className="dl__item">
                    <span className="dl__k">Срок</span>
                    <span className="dl__v">{selected.durationDays} дней</span>
                  </div>
                  <div className="dl__item">
                    <span className="dl__k">Стоимость</span>
                    <span className="dl__v">{formatMoney(selected.price, selected.currency)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <Button
                onClick={handleContinue}
                disabled={!selected}
                icon={<IconChevron />}
              >
                Продолжить
              </Button>
            </div>

            <p className="t-xs t-muted t-center mt-4" style={{ lineHeight: 1.5 }}>
              Нажимая «Продолжить», вы перейдёте к подтверждению заказа.
              Списание произойдёт только после оплаты.
            </p>

            {selectedIndex === -1 && plans.length > 1 && (
              <p className="sr-only">Выбранный тариф недоступен, выберите другой</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function IconChevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}