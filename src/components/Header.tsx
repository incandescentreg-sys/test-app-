import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { haptic } from '@/lib/telegram';

interface HeaderProps {
  /** ReactNode, чтобы можно было вставить градиентное название (см. AppName). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Показывать стрелку «Назад». По умолчанию — если она есть в стеке. */
  onBack?: (() => void) | null;
  /** Правый слот: аватар, кнопка помощи и т.п. */
  action?: ReactNode;
  /** Левый слот перед заголовком: логотип сервиса. */
  leading?: ReactNode;
}

/**
 * Шапка экрана. Sticky + blur, учитывает safe-area.
 */
export function Header({ title, subtitle, onBack = null, action, leading }: HeaderProps) {
  return (
    <header className="hdr">
      <div className="hdr__row">
        {onBack && (
          <button
            type="button"
            className="hdr__back"
            onClick={() => {
              haptic.light();
              onBack();
            }}
            aria-label="Назад"
          >
            <Icon name="chevron-left" size={24} strokeWidth={2.4} />
          </button>
        )}

        {leading}

        <div className="hdr__titles">
          <h1 className="hdr__title">{title}</h1>
          {subtitle && <p className="hdr__sub">{subtitle}</p>}
        </div>

        {action}
      </div>
    </header>
  );
}