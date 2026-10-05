/**
 * Адаптер VercelResponse поверх node:http.
 *
 * Нужен только для локального запуска и тестов: на Vercel этот объект
 * даёт платформа. Здесь мы делаем минимальный совместимый.
 */

import type { ServerResponse } from 'node:http';

export interface DevResponse {
  status(code: number): DevResponse;
  json(payload: unknown): DevResponse;
  setHeader(key: string, value: string): DevResponse;
  getHeader(key: string): number | string | string[] | undefined;
  end(...args: unknown[]): DevResponse;
  write(chunk: string): boolean;
}

/**
 * `this` внутри стрелочных функций не сработает, поэтому держим
 * ссылку на сами себя в замыкании.
 */
export function createDevResponse(res: ServerResponse): DevResponse {
  const self: DevResponse = {
    status(code: number) {
      res.statusCode = code;
      return self;
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
      return self;
    },
    setHeader(key: string, value: string) {
      res.setHeader(key, value);
      return self;
    },
    getHeader(key: string) {
      return res.getHeader(key);
    },
    end(...args: unknown[]) {
      res.end(...(args as []));
      return self;
    },
    write(chunk: string) {
      res.write(chunk);
      return true;
    },
  };
  return self;
}