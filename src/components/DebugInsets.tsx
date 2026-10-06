/**
 * ВРЕМЕННОЕ измерение отступов. Удалить вместе с подключением в AppShell.
 *
 * Панель Telegram не отдаёт свою высоту ни через CSS-переменную, ни через
 * API, поэтому верхний отступ приходится оценивать. Две оценки не
 * подошли — значит нужен факт, а не догадка. Плашка показывает всё, что
 * удалось измерить, чтобы перестать подбирать константу.
 */

import { useEffect, useState } from 'react';
import { getWebApp } from '@/lib/telegram';

interface Insets {
  tgVar: number;
  apiTop: number;
  apiBottom: number;
  envTop: number;
  envBottom: number;
  chosenTop: number;
  innerHeight: number;
  visualHeight: number;
  clientHeight: number;
  platform: string;
  version: string;
}

function readVar(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function readEnv(which: 'top' | 'bottom'): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const value = Number.parseFloat(which === 'top' ? computed.paddingTop : computed.paddingBottom);
  probe.remove();
  return Number.isFinite(value) ? value : 0;
}

function measure(): Insets {
  const wa = getWebApp();
  return {
    tgVar: readVar('--tg-content-safe-area-inset-top'),
    apiTop: wa?.contentSafeAreaInsetTop ?? -1,
    apiBottom: wa?.contentSafeAreaInsetBottom ?? -1,
    envTop: readEnv('top'),
    envBottom: readEnv('bottom'),
    chosenTop: readVar('--safe-top'),
    innerHeight: window.innerHeight,
    visualHeight: Math.round(window.visualViewport?.height ?? 0),
    clientHeight: document.documentElement.clientHeight,
    platform: wa?.platform ?? 'нет WebApp',
    version: wa?.version ?? '—',
  };
}

export function DebugInsets() {
  const [data, setData] = useState<Insets | null>(null);

  useEffect(() => {
    const update = () => setData(measure());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data) return null;

  return (
    <pre
      style={{
        position: 'fixed',
        left: 8,
        bottom: 90,
        zIndex: 9999,
        margin: 0,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.78)',
        color: '#7CFF9B',
        font: '11px/1.45 ui-monospace, monospace',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {Object.entries(data)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}
    </pre>
  );
}