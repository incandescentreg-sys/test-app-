import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'blue' | 'flat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /** Сжимает внутренние отступы — для компактных списков. */
  tight?: boolean;
  /** Анимация появления с задержкой (для каскада на главном экране). */
  appear?: boolean;
  delay?: number;
  children: ReactNode;
}

export function Card({
  tone = 'default',
  tight = false,
  appear = false,
  delay = 0,
  className = '',
  children,
  style,
  ...rest
}: CardProps) {
  const classes = [
    'card',
    tone === 'blue' ? 'card--blue' : '',
    tone === 'flat' ? 'card--flat' : '',
    tight ? 'card--tight' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{
        animation: appear ? `card-in var(--t-slow) var(--ease) ${delay}ms both` : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="t-h2 mb-3">{children}</h2>;
}