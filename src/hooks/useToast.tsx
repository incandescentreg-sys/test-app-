/**
 * Глобальные тосты (всплывающие уведомления).
 *
 * Внутри Telegram дублирует нативный Backdrop, поэтому держим их
 * короткими и не блокирующими.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { haptic } from '@/lib/telegram';
import { Icon } from '@/components/Icon';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastValue {
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', durationMs = 2600) => {
      const id = nextId.current++;

      if (tone === 'success') haptic.success();
      else if (tone === 'error') haptic.error();
      else haptic.light();

      setItems((prev) => {
        // Не копим больше трёх тостов.
        const next = [...prev, { id, message, tone }].slice(-3);
        return next;
      });

      window.setTimeout(() => remove(id), durationMs);
    },
    [remove],
  );

  const value = useMemo<ToastValue>(
    () => ({
      show,
      success: (m: string) => show(m, 'success'),
      error: (m: string) => show(m, 'error'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items }: { items: ToastItem[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast__ico">
            <Icon
              name={t.tone === 'success' ? 'check-circle' : t.tone === 'error' ? 'alert' : 'info'}
              size={18}
            />
          </span>
          <span className="toast__txt">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast должен вызываться внутри ToastProvider');
  return ctx;
}

/** Гасит тосты при смене экрана, чтобы они не висели поверх нового. */
export function useResetToastsOnScreenChange(screenKey: string, clear: () => void): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);
}