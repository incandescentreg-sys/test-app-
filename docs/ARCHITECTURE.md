# Архитектура Telegram Mini App для VPN-сервиса

Документ описывает: общую архитектуру, структуру страниц, структуру компонентов
и **API contract** с backend'ом.

---

## 1. Общая архитектура

```
┌──────────────────────────────────────────────────────────────┐
│ Telegram (iOS / Android / Desktop)                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Mini App — статика (Vercel Edge Network)              │  │
│  │  React 18 + TypeScript + Vite                          │  │
│  │                                                        │  │
│  │  Ответственность ТОЛЬКО:                               │  │
│  │   • рендер и навигация                                 │  │
│  │   • вызовы API по контракту                            │  │
│  │   • локальная валидация формы (для UX)                 │  │
│  │                                                        │  │
│  │  НЕ содержит:                                          │  │
│  │   • секретов, H1VLESS-токенов                          │  │
│  │   • расчёта цен, баланса, сроков                       │  │
│  │   • подписи Telegram initData                          │  │
│  └───────────────────────┬────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────┘
                           │  fetch()
                           │  X-Telegram-Init-Data: <signed payload>
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Vercel — существующий backend                               │
│                                                              │
│  1. validateTelegramInitData()   HMAC-SHA256, проверка      │
│                                  auth_date ≤ 24h            │
│  2. deriveUserId(initData)       ТОЛЬКО из подписи          │
│  3. SessionService               HttpOnly cookie / stateless │
│  4. SubscriptionService          активная подписка          │
│  5. PaymentService               Order + платёж + webhook   │
│  6. ReferralService              бонусы                     │
│  7. WalletService                баланс и выводы            │
│  8. H1VlessService               provision / extend / revoke│
│  9. PostgreSQL + Prisma                                     │
└──────────────────────────┬───────────────────────────────────┘
                           │  server-to-server, secret token
                           ▼
                     ┌──────────────┐
                     │   H1VLESS    │  Xray core
                     └──────────────┘
```

### 1.1 Границы доверия

| Актрив | Доверяем | Почему |
|---|---|---|
| Фронтенд | **Недоверенный** | Клиент на устройстве пользователя |
| `initData` | **Достоверна только после проверки подписи** | Клиент может подделать всё, кроме HMAC |
| `initDataUnsafe` | **Только для мгновенного UI** | Не подписан, читается до ответа backend |
| Backend | **Единственный источник истины** | — |
| H1VLESS | **Только через backend** | Токен не должен покидать сервер |

### 1.2 Инварианты безопасности

| # | Инвариант | Где обеспечен |
|---|---|---|
| 1 | `userId` **никогда** не принимается от клиента | `src/api/client.ts` — единственный транспорт; ни один метод не принимает id пользователя |
| 2 | Цена определяется только сервером | `POST /payments/create` получает `{planId}`, сумма приходит в ответе `Order` |
| 3 | `paid` ставит только webhook | `Checkout.tsx` опрашивает статус и **не может** решить, что оплата прошла |
| 4 | Баланс и минимум вывода — с сервера | `GET /referrals/stats`, `GET /health` |
| 5 | VPN-конфигурация не покидает память вкладки | `src/lib/router.tsx` (параметры маршрута — только строки-id), `useCheckout` без persist |
| 6 | Секреты не попадают в бандл | `vite.config.ts` — только `VITE_*`; в коде нет `VITE_H1VLESS_*` |
| 7 | Логи маскируются | `src/lib/logger.ts` — редактирует `vless://`, `initData`, токены |
| 8 | Пользователь не видит тех. данных | `src/api/client.ts` — `userMessage()` отдаёт текст только из белого списка кодов |
| 9 | Frontend не общается с H1VLESS | Нет ни одного импорта/вызова H1VLESS во всём `src/` |

### 1.3 Поток покупки/продления

```
Пользователь                Mini App                       Backend                H1VLESS
    │                          │                             │                      │
    │ «Купить VPN»             │                             │                      │
    ├─────────────────────────►│ GET /plans                  │                      │
    │                          ├────────────────────────────►│                      │
    │                          │◄──── Plan[] (цены отсюда) ───┤                      │
    │                          │                             │                      │
    │ выбрал 3 месяца          │                             │                      │
    ├─────────────────────────►│ POST /payments/create       │                      │
    │                          │ { planId }                  │                      │
    │                          ├────────────────────────────►│ Order(CREATED)        │
    │                          │                             │ PaymentService.create │
    │                          │◄──── Order + paymentUrl ────┤                      │
    │                          │                             │                      │
    │ оплачивает               │ openPaymentLink(url)        │                      │
    ├─────────────────────────►├──────────────┐              │                      │
    │                          │              ▼              │                      │
    │                          │       Платёжный провайдер    │                      │
    │                          │              │              │                      │
    │                          │              └── webhook ───►│ verify + set PAID   │
    │                          │                             ├─►Subscription.upsert │
    │                          │                             ├─►H1Vless.provision()│
    │                          │                             │   (или .extend()    │
    │                          │                             │    если активна)    │
    │                          │◄──── PAID, vpnActivated ────┤◄─────────────────────┘
    │                          │                             │
    │ «Оплата успешна»         │                             │
    │◄─────────────────────────┤ GET /vpn/config            │
    │                          ├────────────────────────────►│ subscriptionUrl
```

**Продление** идёт тем же путём: backend видит активную подписку и вызывает
`extend`, а не создаёт нового клиента H1VLESS.

---

## 2. Структура страниц

| Маршрут | Файл | Bottom nav | Назначение |
|---|---|:---:|---|
| `home` | `pages/Home.tsx` | ✅ | Статус VPN, CTA, быстрые действия (п. 3, 4) |
| `subscription` | `pages/Subscription.tsx` | ✅ | Детали подписки, продление, инструкция (п. 6) |
| `plans` | `pages/Plans.tsx` | ❌ | Выбор тарифа из `GET /api/plans` (п. 7) |
| `checkout` | `pages/Checkout.tsx` | ❌ | Состав заказа, создание платежа, поллинг (п. 8) |
| `payment-success` | `pages/PaymentSuccess.tsx` | ❌ | Успех после `paid` от сервера (п. 9) |
| `vpn` | `pages/VpnConfig.tsx` | ❌ | Конфигурация, копирование, подключение (п. 10) |
| `instructions` | `pages/Instructions.tsx` | ❌ | 4 шага + список клиентов + FAQ (п. 11) |
| `referrals` | `pages/Referrals.tsx` | ✅ | Рефералы, баланс, вывод средств (п. 13, 14) |
| `profile` | `pages/Profile.tsx` | ✅ | Данные, статистика, навигация по документам (п. 15) |
| `help` | `pages/Help.tsx` | ❌ | FAQ, диагностика, связь (п. 15) |
| `privacy` | `pages/Privacy.tsx` | ❌ | Политика конфиденциальности |

### Навигация

```
Вкладки (bottom nav)   Home ⇄ Subscription ⇄ Referrals ⇄ Profile
        │                    сбрасывают стек → всегда «корневой» экран
        │
        └─► Полноэкранные: Plans → Checkout → PaymentSuccess
                                 └─► Vpn / Instructions / Help / Privacy
```

Роутер — **стековый** (`src/lib/router.tsx`):
* `navigate()` — вперёд (push);
* `back()` — назад (pop);
* `reset()` — сброс стека (переход между вкладками);
* `replace()` — замена текущего (после оплаты, чтобы «Назад» не вёл на оплату);
* синхронизирован с нативной кнопкой «Назад» Telegram и аппаратной кнопкой Android.

---

## 3. Структура компонентов

```
components/
├─ Button              Варианты primary/secondary/ghost/danger, размеры, loading
├─ Card                Базовая карточка + tone blue/flat, каскадная анимация
├─ StatusBadge         Точка-статус: active / warn / off, пульсация
├─ PlanCard            Тариф с чекмарком, ценой и «за месяц» (п. 7)
├─ SubscriptionCard    Главная карточка статуса + empty state (п. 3, 4)
├─ StatPill            Плитка «число / подпись»
├─ BottomNavigation    4 вкладки, safe-area, active-state (п. 5)
├─ Header              Sticky-шапка, safe-area, слот back и action
├─ Modal               Bottom sheet, блокировка скролла, Esc
├─ Toast + Toasts      Всплывающие уведомления, тактильный отклик
├─ CopyButton          Копирование с фолбэком, «18:00 ✓ Скопировано» (п. 10)
├─ Icon                34 инлайновых SVG, без библиотеки
├─ LoadingSkeleton     Skeleton-варианты под каждый экран (п. 19)
├─ EmptyState          Пустое состояние + действие (п. 21)
├─ ErrorState          Ошибка + «Повторить», без тех. данных (п. 20)
├─ Layout              Steps, FeatureGrid, AppLinks, FaqList, Section,
│                      DefinitionList — переиспользуемые секции
└─ ErrorBoundary       Граница ошибок: понятное сообщение, без стектрейса

layouts/
└─ AppShell            safe-area, Telegram BackButton, bottom nav, анимации
```

### Дерево зависимостей

```
App
└─ ErrorBoundary
   └─ SessionProvider      user, subscription, health, refresh
      └─ ToastProvider
         └─ CheckoutProvider    order, plan, polling
            └─ RouterProvider    stack, navigate/back/reset/replace
               └─ AppShell      safe-area, BackButton, BottomNavigation
                  └─ Suspense
                     └─ Page → FeatureGrid / Steps / PlanCard / …
```

### Хуки

| Хук | Файл | Назначение |
|---|---|---|
| `useSession` | `hooks/useSession.tsx` | Пользователь, подписка, health, `refresh()` |
| `useCheckout` | `hooks/useCheckout.tsx` | Заказ в памяти, `begin()`, `pollUntilFinal()` |
| `useAsync` | `hooks/useAsync.ts` | Loading/error/refetch с защитой от гонок |
| `useToast` | `hooks/useToast.tsx` | Всплывающие уведомления |
| `useRouter` | `lib/router.tsx` | Стек навигации |

---

## 4. API contract

### Транспорт

```
Base URL:  VITE_API_BASE_URL  (по умолчанию /api — тот же домен)
Заголовок: X-Telegram-Init-Data: <Telegram.WebApp.initData>
Credentials: include   (на случай HttpOnly-сессии)
Content-Type: application/json
```

**Ошибки** всегда в формате:

```json
{ "code": "MIN_WITHDRAWAL_NOT_REACHED", "message": "Минимальная сумма вывода — 500 ₽.", "details": null }
```

`code` обязателен — именно по нему фронтенд выбирает текст. Если `code` неизвестен,
показывается безопасный дефолт, а `message` **не выводится**.

---

### `GET /health` — публичный

Проверка живости + публичные параметры приложения.

```jsonc
{
  "ok": true,
  "version": "1.4.2",
  "app": {
    "name": "VPN",
    "minWithdrawalAmount": 50000,   // в копейках
    "currency": "RUB",
    "supportUsername": "SupportBot",
    "paymentProviders": ["yookassa", "telegram_stars"]
  }
}
```

Используется для: минимальная сумма вывода (п. 14).

---

### `GET /me` — пользователь

```jsonc
{
  "id": 123456789,
  "firstName": "Иван",
  "lastName": "Петров",
  "username": "ivan",
  "avatarUrl": "https://t.me/i/userpic/320/...",
  "languageCode": "ru",
  "createdAt": "2026-08-14T10:22:31.000Z",
  "referralLink": "https://t.me/VPNBot?start=ref_123456789",
  "vpnActive": true
}
```

> `referralLink` собирает **backend**. Фронтенд его не конструирует и не даёт
> пользователю редактировать (п. 13).

---

### `GET /subscription` — подписка

```jsonc
{
  "status": "active",            // active | expiring | expired | none | pending | frozen
  "planId": "plan-3m",
  "planName": "3 месяца",
  "durationDays": 90,
  "startAt": "2026-09-30T00:00:00.000Z",
  "expiresAt": "2026-12-29T00:00:00.000Z",
  "remainingDays": 61,           // считает backend
  "autoRenew": false,
  "trafficUsedGb": 128.4,
  "trafficLimitGb": null,
  "deviceLimit": 5
}
```

---

### `GET /me/profile` — профиль (агрегат)

```jsonc
{
  "user": { /* как /me */ },
  "subscription": { /* как /subscription */ },
  "referral": { /* как /referrals/stats */ },
  "stats": {
    "totalPaid": 41900,
    "purchaseCount": 2,
    "firstPurchaseAt": "2026-08-14T10:22:31.000Z"
  }
}
```

Опционален: если его нет, удалите вызов из `src/api/index.ts` и соберите
профиль из `/me` + `/subscription` + `/referrals/stats`.

---

### `GET /plans` — тарифы (источник цен)

```jsonc
[
  {
    "id": "plan-1m",
    "name": "1 месяц",
    "durationDays": 30,
    "price": 14900,            // 149 ₽ — в копейках
    "currency": "RUB",
    "pricePerMonth": 14900,    // 149 ₽ / мес
    "originalPrice": null,
    "badge": null,
    "description": "Быстрый старт",
    "isPopular": false,
    "available": true
  },
  {
    "id": "plan-3m",
    "name": "3 месяца",
    "durationDays": 90,
    "price": 41900,            // 419 ₽
    "currency": "RUB",
    "pricePerMonth": 13967,    // ≈ 139,67 ₽ / мес (−6%)
    "originalPrice": 44700,    // 3 × 149 ₽ — основа для показа выгоды
    "badge": "Выгодно",
    "description": "Оптимальный выбор",
    "isPopular": true,
    "available": true
  },
  {
    "id": "plan-6m",
    "name": "6 месяцев",
    "durationDays": 180,
    "price": 71900,            // 719 ₽
    "currency": "RUB",
    "pricePerMonth": 11983,    // ≈ 119,83 ₽ / мес (−20%)
    "originalPrice": 89400,    // 6 × 149 ₽
    "badge": "−20%",
    "description": "Максимальная выгода",
    "isPopular": false,
    "available": true
  }
]
```

> **Цена в копейках, целое число.** Фронтенд не содержит ни одной
> захардкоженной цены (п. 31). Цифры выше — пример формата; боевые значения
> живут в БД backend'а.
> Если backend отдаёт рубли (`149`), а не копейки —
> `src/api/normalize.ts` приведёт значения `< 1000` как рубли автоматически.

> ✅ **Лестница цен корректная:** цена за месяц падает с ростом срока —
> 149 → 139,67 → 119,83 ₽/мес. Именно так и должно быть: иначе покупатель
> видит, что полугодовой тариф дороже в пересчёте на месяц, чем трёхмесячный.

---

### `POST /payments/create` — создать заказ

**Запрос** (только `planId`!):

```json
{ "planId": "plan-3m" }
```

**Ответ `200`**:

```jsonc
{
  "id": "ord_7f3a91",
  "planId": "plan-3m",
  "planName": "3 месяца",
  "durationDays": 90,
  "amount": 41900,
  "currency": "RUB",
  "status": "created",
  "paymentUrl": "https://yoomoney.ru/checkout/...",
  "provider": "yookassa",
  "expiresAt": "2026-10-02T19:15:00.000Z",
  "createdAt": "2026-10-02T19:00:00.000Z"
}
```

Поведение backend'а:
* находит `planId` **в своей БД** и берёт цену оттуда;
* если есть активная подписка → **продление** (`expiresAt += durationDays`);
* если нет → новая подписка;
* создаёт Order и платёж у провайдера, возвращает `paymentUrl`.

**Ошибки**: `PLAN_UNAVAILABLE` (422), `RATE_LIMITED` (429), `PAYMENT_ALREADY_PAID` (409).

---

### `GET /payments/:id/status` — статус (поллинг)

```jsonc
{
  "orderId": "ord_7f3a91",
  "status": "paid",          // created | pending | paid | failed | expired | refunded
  "amount": 41900,
  "currency": "RUB",
  "paidAt": "2026-10-02T19:03:12.000Z",
  "vpnActivated": true,
  "subscription": { /* актуальная подписка, удобно для сразу показать даты */ }
}
```

> `status: "paid"` backend выставляет **только** по webhook'у провайдера.
> Фронтенд опрашивает каждые 3 с до 40 раз (≈2 мин) и **не решает** успех сам (п. 32).

---

### `GET /vpn/config` — конфигурация

```jsonc
{
  "config": {
    "id": "cfg_1",
    "protocol": "vless",
    "subscriptionUrl": "vless://uuid@host:25201?type=tcp&security=reality&...",
    "host": "vpn.example.com",
    "port": 25201,
    "label": "Основной сервер",
    "updatedAt": "2026-10-02T19:03:12.000Z",
    "botUrl": null
  },
  "subscription": { /* ... */ },
  "availableClients": [
    { "id": "happ", "name": "Happ", "platforms": ["ios", "android", "desktop"],
      "storeUrl": "https://apps.apple.com/...", "icon": "🟢" }
  ]
}
```

> ⚠️ Ответ содержит приватную конфигурацию. Frontend держит её **только в памяти
> компонента** и маскирует в логах. Не логируйте этот ответ на backend'е в открытом виде.

**Ошибки**: `SUBSCRIPTION_NOT_FOUND` (404), `VPN_NOT_READY` (409) — оплата прошла,
но H1VLESS ещё создаётся.

---

### `GET /referrals/stats` — рефералы и кошелёк

```jsonc
{
  "invitedCount": 12,
  "activeCount": 7,
  "totalEarnings": 149000,
  "balance": 89000,
  "pendingEarnings": 12000,
  "bonusPercent": 20,
  "currency": "RUB",
  "referralLink": "https://t.me/VPNBot?start=ref_123456789",
  "recent": [
    { "userId": 555, "displayName": "Анна", "username": "anna",
      "earned": 41900, "credited": true, "registeredAt": "2026-09-20T..." }
  ],
  "withdrawals": [
    { "id": "wd_1", "amount": 50000, "status": "paid",
      "createdAt": "2026-09-01T...", "processedAt": "2026-09-02T..." }
  ]
}
```

---

### `POST /withdrawals/create` — заявка на вывод

**Запрос:**

```jsonc
{ "amount": 89000, "requisites": "2200 0000 0000 0000" }
```

**Ответ `201`:**

```jsonc
{ "withdrawal": { "id": "wd_2", "amount": 89000, "status": "pending", "...": "" },
  "balance": 0 }
```

Backend обязан проверить сам (фронт — только UX):
* `amount >= minWithdrawalAmount` (из `/health`);
* `amount <= balance`;
* нет другой `pending`-заявки;
* реквизиты заполнены.

**Ошибки**: `MIN_WITHDRAWAL_NOT_REACHED`, `BALANCE_TOO_LOW`, `WITHDRAWAL_PENDING_EXISTS`, `INVALID_REQUISITES`.

---

## 5. Таблица кодов ошибок

| `code` | HTTP | Текст пользователю |
|---|:---:|---|
| `UNAUTHORIZED` | 401 | Сессия истекла. Перезапустите приложение. |
| `FORBIDDEN` | 403 | Недостаточно прав для этого действия. |
| `NOT_FOUND` | 404 | Данные не найдены. |
| `VALIDATION_ERROR` | 400 | Проверьте заполненные поля. |
| `RATE_LIMITED` | 429 | Слишком много запросов. Подождите немного. |
| `PLAN_UNAVAILABLE` | 422 | Этот тариф сейчас недоступен. Выберите другой. |
| `BALANCE_TOO_LOW` | 400 | Недостаточно средств на балансе. |
| `MIN_WITHDRAWAL_NOT_REACHED` | 400 | Минимальная сумма вывода ещё не набрана. |
| `WITHDRAWAL_PENDING_EXISTS` | 409 | У вас уже есть заявка на вывод в обработке. |
| `PAYMENT_ALREADY_PAID` | 409 | Этот заказ уже оплачен. |
| `ORDER_EXPIRED` | 410 | Время оплаты истекло. Создайте новый заказ. |
| `VPN_NOT_READY` | 409 | Оплата прошла, но VPN пока не активировался… |
| `SUBSCRIPTION_NOT_FOUND` | 404 | У вас пока нет VPN-подписки. |

Коды из этого списка + `SAFE_BACKEND_MESSAGES` в `src/api/client.ts` пропускают
`message` от сервера. **Все остальные — подменяются безопасным дефолтом.**

---

## 6. Адаптация под существующий backend

Если пути или имена полей отличаются, правьте **только**:

1. `src/api/index.ts` — пути и payload'ы;
2. `src/api/normalize.ts` — маппинг snake_case ↔ camelCase;
3. `src/types/index.ts` — если тип ответа принципиально другой.

UI, роутер, стили и логика безопасности при этом не меняются.

Уже поддерживаются альтернативные имена полей:

| Наш | Альтернативы |
|---|---|
| `expiresAt` | `expire_at`, `validUntil`, `endDate` |
| `paymentUrl` | `confirmation_url`, `redirect_url`, `redirectUrl` |
| `remainingDays` | `daysLeft`, `days_left` |
| `status` | `state` |
| `price` | `amount`, `cost`, `value` |

---

## 7. Производительность

| Метрика | Значение |
|---|---|
| Бандл первого экрана (gzip) | ~70 КБ (React 44 + app 20 + CSS 6) |
| CSS (gzip) | ~5.6 КБ |
| Страниц в основном бандле | 1 (`Home`), остальные — lazy chunks 1–9 КБ |
| Зависимостей | `react`, `react-dom` — **и всё** |
| Иконок | 34 инлайновых SVG вместо библиотеки |
| Шрифтов | системный стек, **0 запросов** |

Роутер, тосты, скелтоны, модалка, форматирование, работа с буфером обмена,
логирование с маскированием — собственная реализация (~400 строк), без зависимостей.

---

## 8. Соответствие требованиям ТЗ

| Пункт ТЗ | Реализация | Файл |
|---|---|---|
| 1. Технологии | React 18, TS, Vite, WebApp SDK, `api/index.ts` | — |
| 2. Визуальный стиль | Палитра, rounded cards, мягкие тени, touch 44px | `styles/global.css` |
| 3. Главный экран | Шапка, статус-карточка, CTA | `pages/Home.tsx` |
| 4. Нет подписки | Карточка «Купить VPN» + 4 преимущества | `SubscriptionCard.tsx` |
| 5. Bottom navigation | 4 вкладки, safe-area | `BottomNavigation.tsx` |
| 6. Экран «Подписка» | Детали + 3 действия | `pages/Subscription.tsx` |
| 7. Покупка VPN | Тарифы, выделение, «Продолжить» | `pages/Plans.tsx`, `PlanCard.tsx` |
| 8. Подтверждение | Состав заказа, оплата по `order.amount` | `pages/Checkout.tsx` |
| 9. Экран успеха | Только после `paid` | `pages/PaymentSuccess.tsx` |
| 10. VPN Configuration | Маскирование, копирование, «18:00 ✓» | `pages/VpnConfig.tsx`, `CopyButton.tsx` |
| 11. Инструкция | 4 шага из конфига, не привязана к клиенту | `pages/Instructions.tsx`, `config/app.ts` |
| 12. Продление | Тот же endpoint, продление решает backend | `Checkout.tsx` |
| 13. Рефералы | `WebApp.share` + fallback, ID не редактируется | `pages/Referrals.tsx` |
| 14. Баланс | Минимум из `/health`, валидация на сервере | `WithdrawModal` в `Referrals.tsx` |
| 15. Профиль | Данные, 4 кнопки документов | `pages/Profile.tsx` |
| 16. Авторизация | `initData` в заголовке, без паролей | `api/client.ts` |
| 17. API client | Все методы в одном файле | `api/index.ts` |
| 18. Безопасность API | Никаких `?id=`, `userId` только из подписи | `api/client.ts` |
| 19. Loading states | 7 skeleton-вариантов | `LoadingSkeleton.tsx` |
| 20. Error states | Без stack trace / JSON / API keys | `EmptyState.tsx`, `client.ts` |
| 21. Empty states | Для каждого раздела | `EmptyState.tsx` |
| 22. Анимации | Быстрые, `prefers-reduced-motion` | `global.css` |
| 23. Mobile-first | safe-area, notch, 44px, без h-скролла | `global.css`, `AppShell.tsx` |
| 24. Telegram Theme | `--tg-theme-*` в базовых стилях | `global.css` |
| 25. Backend integration | Не дублируем бизнес-логику | `api/` |
| 26. H1VLESS | Ни одного обращения из `src/` | проверено |
| 27. Vercel | `vercel.json`, rewrites без `/api`, build | `vercel.json` |
| 28. Структура | `components/ pages/ layouts/ hooks/ api/ lib/ types/` | — |
| 29. Компоненты | Все 14 из списка + 6 дополнительных | `components/` |
| 30. UX flow | Новый и существующий пользователь | `router.tsx` |
| 31. Цена | Только с backend | `api/index.ts` |
| 32. Payment flow | create → url → webhook → poll | `Checkout.tsx`, `useCheckout.tsx` |
| 33. Производительность | Code splitting, 2 зависимости | `vite.config.ts` |
| 34. README | Инструкции | `README.md` |