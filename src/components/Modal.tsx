import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { haptic } from '@/lib/telegram';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Прибитая к низу кнопка/действие. */
  footer?: ReactNode;
  /** Закрывать ли по клику по фону. */
  dismissible?: boolean;
}

/**
 * Bottom sheet (ТЗ п. 29).
 *
 * На мобильных выезжает снизу — привычный паттерн iOS/Android.
 * Закрытие по Esc и по фону, блокировка прокрутки фона.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
}: ModalProps) {
  // Блокируем скролл body, пока открыт.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        haptic.light();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onClick={dismissible ? onClose : undefined}
      role="presentation"
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__grab" />

        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          {dismissible && (
            <button type="button" className="sheet__close" onClick={onClose} aria-label="Закрыть">
              <Icon name="x" size={17} strokeWidth={2.4} />
            </button>
          )}
        </div>

        <div className="sheet__body">{children}</div>

        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}