import { useCallback, useRef, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { useToast } from '@/hooks/useToast';
import { haptic } from '@/lib/telegram';
import { formatTime } from '@/lib/format';

interface CopyButtonProps {
  /** Текст для копирования. */
  value: string;
  label?: string;
  /** Показывать время копирования, как в ТЗ п. 10 («18:00 ✓ Скопировано»). */
  showTime?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'lg' | 'sm' | 'inline';
  fullWidth?: boolean;
  /** Показать конфигурацию перед копированием? */
  onCopy?: () => void;
}

/**
 * Копирование в буфер обмена.
 *
 * Замечание по безопасности: конфигурация VPN копируется ТОЛЬКО по явному
 * действию пользователя и не попадает ни в логи, ни в URL (ТЗ п. 10).
 */
export function CopyButton({
  value,
  label = 'Копировать конфигурацию',
  showTime = false,
  variant = 'primary',
  size = 'lg',
  fullWidth = true,
  onCopy,
}: CopyButtonProps) {
  const toast = useToast();
  const [copiedAt, setCopiedAt] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const handleCopy = useCallback(async () => {
    if (!value) {
      toast.error('Конфигурация пока не готова');
      return;
    }

    const ok = await writeToClipboard(value);

    if (!ok) {
      toast.error('Не удалось скопировать. Выделите текст вручную.');
      haptic.error();
      return;
    }

    const time = formatTime();
    setCopiedAt(time);
    haptic.success();
    toast.success('Скопировано');

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedAt(null), 4000);
  }, [value, toast]);

  const copied = copiedAt !== null;

  return (
    <Button
      variant={copied ? 'secondary' : variant}
      size={size}
      fullWidth={fullWidth}
      onClick={() => {
        onCopy?.();
        void handleCopy();
      }}
      icon={
        copied ? (
          <Icon name="check" size={19} strokeWidth={2.6} />
        ) : (
          <Icon name="copy" size={18} />
        )
      }
    >
      {copied ? (
        showTime ? (
          <>
            <span className="t-num">{copiedAt}</span> · Скопировано
          </>
        ) : (
          'Скопировано'
        )
      ) : (
        label
      )}
    </Button>
  );
}

/**
 * Копирование с fallback'ом.
 *
 * Внутри Telegram WebView на iOS `navigator.clipboard` может быть недоступен
 * вне secure context или отклонять запрос. Поэтому есть запасной путь через
 * execCommand + временный textarea.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной путь */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}