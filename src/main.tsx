import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initTelegram } from './lib/telegram';
import './styles/global.css';

/**
 * Точка входа.
 *
 * Порядок важен:
 *  1. initTelegram() поднимает WebView до первой отрисовки (ready/expand),
 *     чтобы не было «прыжка» интерфейса;
 *  2. Бут-скрин из index.html снимается сразу после первого рендера.
 */
initTelegram();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Не найден корневой элемент #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Убираем бут-скрин после первого кадра.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.style.transition = 'opacity 180ms ease';
  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 200);
});