import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/* ── Empty state (ТЗ п. 21) ───────────────────────────────────────────── */

interface EmptyStateProps {
  icon?: IconName;
  emoji?: string;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'lock',
  emoji,
  title,
  text,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="state">
      <div className="state__ico">
        {emoji ? <span style={{ fontSize: 28 }}>{emoji}</span> : <Icon name={icon} size={30} />}
      </div>
      <h2 className="state__title">{title}</h2>
      {text && <p className="state__text">{text}</p>}
      {actionLabel && onAction && (
        <Button variant="secondary" size="inline" onClick={onAction} className="state__action">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ── Error state (ТЗ п. 20) ──────────────────────────────────────────── */

interface ErrorStateProps {
  title?: string;
  /** Текст ошибки — уже безопасный, из ApiError.userMessage. */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Дополнительное действие, например «Открыть поддержку». */
  extra?: ReactNode;
}

export function ErrorState({
  title = 'Не удалось загрузить данные',
  message = 'Попробуйте ещё раз.',
  onRetry,
  retryLabel = 'Повторить',
  extra,
}: ErrorStateProps) {
  return (
    <div className="state state--error">
      <div className="state__ico">
        <Icon name="alert" size={28} />
      </div>
      <h2 className="state__title">{title}</h2>
      <p className="state__text">{message}</p>
      <div className="stack stack-2" style={{ width: '100%', maxWidth: 260, marginTop: 20 }}>
        {onRetry && (
          <Button variant="secondary" size="inline" onClick={onRetry} icon={<Icon name="refresh" size={18} />}>
            {retryLabel}
          </Button>
        )}
        {extra}
      </div>
    </div>
  );
}

/**
 * Экран для случая, когда приложение открыли вне Telegram.
 * Не показываем ничего технического — только инструкцию.
 */
export function NotInTelegramState() {
  return (
    <div className="state">
      <div className="state__ico">
        <Icon name="telegram" size={30} />
      </div>
      <h2 className="state__title">Откройте через Telegram</h2>
      <p className="state__text">
        Приложение работает только внутри Telegram: так мы знаем, кто вы, и не просим логин и пароль.
      </p>
    </div>
  );
}