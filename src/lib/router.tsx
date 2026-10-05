/**
 * Минимальный стековый роутер.
 *
 * Почему не react-router:
 *  • нужен СТЕК навигации, а не URL-роутинг — чтобы кнопка «Назад» в Telegram
 *    и на экране вели себя как в нативном приложении;
 *  • критично НЕ класть чувствительные данные (VPN-конфигурацию) в URL —
 *    здесь параметры маршрута строго типизированы и не содержат секретов
 *    (ТЗ п. 10);
 *  • ноль килобайт в бандле вместо ~10 КБ роутера.
 *
 * Работает поверх history.pushState, поэтому аппаратная кнопка «Назад»
 * на Android и жест на iOS тоже корректны.
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

export type RouteName =
  | 'home'
  | 'subscription'
  | 'plans'
  | 'checkout'
  | 'payment-success'
  | 'vpn'
  | 'instructions'
  | 'referrals'
  | 'profile'
  | 'help'
  | 'privacy';

export interface Route {
  name: RouteName;
  /** Параметры маршрута. Сюда НЕЛЬЗЯ класть конфигурацию или токены. */
  params: Readonly<Record<string, string>>;
  /** Ключ для React — заставляет перемонтировать экран при смене маршрута. */
  key: string;
}

type Direction = 'push' | 'pop' | 'none';

interface RouterValue {
  route: Route;
  stack: readonly Route[];
  canGoBack: boolean;
  direction: Direction;
  navigate: (name: RouteName, params?: Record<string, string>) => void;
  replace: (name: RouteName, params?: Record<string, string>) => void;
  back: () => void;
  /** Сброс стека на корневой экран (используется bottom navigation). */
  reset: (name: RouteName) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Маршруты, на которых показывается нижняя навигация. */
export const TAB_ROUTES: readonly RouteName[] = ['home', 'subscription', 'referrals', 'profile'];

/** Маршруты без нижней навигации (полноэкранные). */
export const FULLSCREEN_ROUTES: readonly RouteName[] = [
  'plans',
  'checkout',
  'payment-success',
  'vpn',
  'instructions',
  'help',
  'privacy',
];

let keyCounter = 0;

function makeRoute(name: RouteName, params: Record<string, string> = {}): Route {
  keyCounter += 1;
  return { name, params: Object.freeze({ ...params }), key: `${name}-${keyCounter}` };
}

const ROOT = makeRoute('home');

export function RouterProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<readonly Route[]>([ROOT]);
  const [direction, setDirection] = useState<Direction>('none');

  // Стек нужен и в колбэках — держим актуальную копию в ref.
  const stackRef = useRef<readonly Route[]>(stack);
  stackRef.current = stack;

  const directionRef = useRef<Direction>('none');

  /** Кладёт новый экран в стек. */
  const navigate = useCallback((name: RouteName, params: Record<string, string> = {}) => {
    const next = makeRoute(name, params);
    try {
      window.history.pushState({ idx: stackRef.current.length }, '');
    } catch {
      /* history недоступен (например, в песочнице) — работаем без него */
    }
    directionRef.current = 'push';
    setDirection('push');
    setStack((prev) => [...prev, next]);
  }, []);

  /** Заменяет текущий экран (после успешной оплаты, чтобы «Назад» не вернул на оплату). */
  const replace = useCallback((name: RouteName, params: Record<string, string> = {}) => {
    const next = makeRoute(name, params);
    try {
      window.history.replaceState({ idx: Math.max(0, stackRef.current.length - 1) }, '');
    } catch {
      /* игнорируем */
    }
    directionRef.current = 'none';
    setDirection('none');
    setStack((prev) => (prev.length > 1 ? [...prev.slice(0, -1), next] : [next]));
  }, []);

  /** Полный сброс стека — переход между вкладками. */
  const reset = useCallback((name: RouteName) => {
    try {
      window.history.replaceState({ idx: 0 }, '');
    } catch {
      /* игнорируем */
    }
    directionRef.current = 'push';
    setDirection('push');
    setStack([makeRoute(name)]);
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length <= 1) return;
    directionRef.current = 'pop';
    setDirection('pop');
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    try {
      // Отдаём историю браузеру — сработает popstate, который закроет
      // native Back и жесты. Если история недоступна, состояние уже изменено.
      if (window.history.length > 1) {
        window.history.back();
      }
    } catch {
      /* игнорируем */
    }
  }, []);

  // Аппаратная кнопка «Назад» / жест / кнопка Telegram Back.
  useEffect(() => {
    const onPopState = () => {
      // Если пользователь ушёл дальше назад, чем есть в стеке, — синхронизируем.
      if (stackRef.current.length > 1) {
        directionRef.current = 'pop';
        setDirection('pop');
        setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Нативная кнопка «Назад» в Telegram (см. AppShell).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onTelegramBack = () => back();
    window.addEventListener('vpn:back', onTelegramBack);
    return () => window.removeEventListener('vpn:back', onTelegramBack);
  }, [back]);

  const route = stack[stack.length - 1] ?? ROOT;

  const value = useMemo<RouterValue>(
    () => ({
      route,
      stack,
      canGoBack: stack.length > 1,
      direction,
      navigate,
      replace,
      back,
      reset,
    }),
    [route, stack, direction, navigate, replace, back, reset],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter должен вызываться внутри RouterProvider');
  return ctx;
}