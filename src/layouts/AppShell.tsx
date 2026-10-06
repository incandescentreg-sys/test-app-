/**
 * Каркас приложения: safe-area, Telegram BackButton, нижняя навигация,
 * анимация переходов между экранами.
 */

import { useEffect, type ReactNode } from 'react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DebugInsets } from '@/components/DebugInsets';
import { FULLSCREEN_ROUTES, useRouter } from '@/lib/router';
import { hideBackButton, setClosingGuard, showBackButton, syncViewportVars } from '@/lib/telegram';

interface AppShellProps {
  children: ReactNode;
}

/** Экраны, где не нужно подтверждать закрытие (во избежание потери денег). */
const GUARDED: readonly string[] = ['checkout'];

export function AppShell({ children }: AppShellProps) {
  const { route, canGoBack, back, direction } = useRouter();
  const showNav = !FULLSCREEN_ROUTES.includes(route.name);

  // Нативная кнопка «Назад» Telegram отражает состояние нашего стека.
  useEffect(() => {
    if (canGoBack) {
      showBackButton(back);
    } else {
      hideBackButton();
    }
    return () => hideBackButton();
  }, [canGoBack, back]);

  // Обновляем CSS-переменные viewport/safe-area при изменении размеров.
  useEffect(() => {
    syncViewportVars();
    const onResize = () => syncViewportVars();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Предупреждаем о случайном закрытии на экране оплаты.
  useEffect(() => {
    setClosingGuard(GUARDED.includes(route.name));
  }, [route.name]);

  const animClass =
    direction === 'pop' ? 'screen--pop' : direction === 'push' ? 'screen--push' : '';

  return (
    <div className="app">
      <div className="app__body">
        <div
          key={route.key}
          className={`screen ${animClass} ${showNav ? 'screen--with-nav' : 'screen--plain'}`}
        >
          {children}
        </div>
      </div>

      {showNav && <BottomNavigation />}
      <DebugInsets />
    </div>
  );
}

/**
 * Экран без нижней навигации, но с собственной шапкой и кнопкой «Назад».
 */
export function FullScreen({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}