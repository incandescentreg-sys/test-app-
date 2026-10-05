/**
 * Хук для асинхронной загрузки данных с полными loading / error / empty
 * состояниями (ТЗ п. 19, 20, 21).
 *
 * Особенности:
 *  • Гонки защищены счётчиком поколений: устаревший ответ не перезапишет новый;
 *  • AbortController отменяет запрос при размонтировании;
 *  • Ручной refetch без смены зависимостей.
 */

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError, toApiError } from '@/api/client';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Обновление данных без смены индикатора загрузки (мягкий refetch). */
  isRefreshing: boolean;
  refetch: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

interface Options {
  /** Не выполнять запрос (например, пока нет активной подписки). */
  enabled?: boolean;
  initialData?: unknown;
}

export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList = [],
  options: Options = {},
): AsyncState<T> {
  const { enabled = true, initialData = null } = options;

  const [data, setDataState] = useState<T | null>(initialData as T | null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [isRefreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  /** Поколение отсекает устаревшие ответы (Строгий режим React монтирует дважды). */
  const generation = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    const gen = ++generation.current;

    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current(ctrl.signal);
      if (!mounted.current || gen !== generation.current) return;
      setDataState(result);
    } catch (e) {
      if (!mounted.current || gen !== generation.current) return;
      // AbortError — это не ошибка, а отмена: молча игнорируем.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(toApiError(e));
    } finally {
      if (mounted.current && gen === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const refetch = useCallback(() => run('refresh'), [run]);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater,
    );
  }, []);

  return { data, error, loading, isRefreshing, refetch, setData };
}