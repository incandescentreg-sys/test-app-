import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { haptic } from '@/lib/telegram';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'lg' | 'sm' | 'inline';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Единственная кнопка приложения.
 *
 * Требования (ТЗ п. 2, 23):
 *  • высота ≥ 44px во всех вариантах;
 *  • состояние нажатия — масштаб, а не только цвет;
 *  • тактильная отдача в Telegram;
 *  • `loading` блокирует повторные нажатия (иначе можно создать два заказа).
 */
export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = true,
  icon,
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    size === 'inline' ? 'btn--inline' : '',
    fullWidth ? '' : 'w-fit',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (isDisabled) return;
        haptic.light();
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : (
        icon && (
          <span className="btn__ico" style={{ display: 'inline-flex' }}>
            {icon}
          </span>
        )
      )}
      <span>{children}</span>
    </button>
  );
}