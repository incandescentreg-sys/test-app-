/**
 * GET /vpn/config — конфигурация VPN.
 *
 * ⚠️ Ответ содержит приватную ссылку `vless://…`. Она:
 *   • никогда не попадает в лог (маскирование в http.log);
 *   • не кладётся в localStorage/sessionStorage на клиенте;
 *   • не кэшируется браузером (Cache-Control: no-store).
 *
 * Отдаём её только пользователю с действующей подпиской.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, prepare, sendError, sendOk } from '../lib/http.js';
import { buildVpnConfig, computeStatus, isActive, syncFromPanel } from '../lib/subscription.js';
import { requireAuth } from '../lib/telegram.js';
import { loadBundle } from '../lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'vpn/config');
    }

    const auth = requireAuth(req);
    const telegramId = auth.user.id;
    const { subscription } = await loadBundle(auth);

    // Подписки нет — честный 404, а не пустая конфигурация.
    if (!subscription) {
      throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND', 'У вас пока нет VPN-подписки.');
    }

    const fresh = await syncFromPanel(subscription, telegramId);
    if (!isActive(computeStatus(fresh))) {
      throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND', 'Подписка не активна.');
    }

    const payload = await buildVpnConfig(fresh, telegramId);

    // Оплата прошла, а панель ещё не отдала ссылку: не пустая карточка,
    // а честное «подождите минуту».
    if (!payload) {
      throw new ApiError(
        409,
        'VPN_NOT_READY',
        'Оплата прошла, но VPN пока не активировался. Мы уже создаём его — обновите экран через минуту.',
      );
    }

    sendOk(res, payload);
  } catch (error) {
    sendError(res, error, 'vpn/config');
  }
}