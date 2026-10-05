import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/telegram';
import { Icon } from './Icon';
import type { Plan } from '@/types';

interface PlanCardProps {
  plan: Plan;
  selected: boolean;
  onSelect: (plan: Plan) => void;
}

/**
 * Карточка тарифа (ТЗ п. 7).
 *
 * Показывает: длительность, цену, цену за месяц, выгоду.
 * ВЫБРАННЫЙ тариф выделяется зелёной рамкой и чекмарком.
 * Цена приходит с backend — здесь только форматирование.
 */
export function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  const perMonth =
    plan.pricePerMonth ?? (plan.durationDays > 0 ? Math.round(plan.price / (plan.durationDays / 30)) : null);

  const saving =
    plan.originalPrice && plan.originalPrice > plan.price
      ? Math.round((1 - plan.price / plan.originalPrice) * 100)
      : null;

  return (
    <button
      type="button"
      className="plan"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        haptic.select();
        onSelect(plan);
      }}
    >
      {selected && (
        <span className="plan__check" aria-hidden="true">
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      )}

      <div className="plan__body">
        <div className="plan__name">{plan.name}</div>
        <div className="plan__meta">
          {plan.description ?? `${plan.durationDays} дней доступа`}
        </div>
        {(plan.badge || (saving && saving > 0)) && (
          <span className="plan__tag">
            {plan.badge ?? `−${saving}%`}
          </span>
        )}
      </div>

      <div className="plan__price">
        <div className="plan__amount">{formatMoney(plan.price, plan.currency)}</div>
        {perMonth !== null && (
          <div className="plan__per">{formatMoney(perMonth, plan.currency)} / мес</div>
        )}
      </div>
    </button>
  );
}