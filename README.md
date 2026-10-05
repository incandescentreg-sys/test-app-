# Яблоко VPN — Telegram Mini App

Telegram Mini App для VPN-сервиса. Это **только фронтенд**: он показывает данные,
которые отдаёт существующий backend, и вызывает его API. Вся бизнес-логика,
работа с H1VLESS и платежами остаётся на сервере.

```
Telegram Mini App  →  Vercel Backend  →  H1VLESS
     (React)            (существующий)      (Xray)
```

**Стек:** React 18 · TypeScript · Vite 5 · Telegram WebApp SDK · Vercel
**Зависимости:** `react`, `react-dom` — и всё. Роутер, тосты, скелтоны, модалка,
форматирование, работа с буфером обмена и логирование написаны свои (~400 строк).

Подробная документация по архитектуре и API — в **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

---

## Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Переменные окружения](#переменные-окружения)
3. [Как привязать Mini App к боту (BotFather)](#как-привязать-mini-app-к-боту-botfather)
4. [Локальная разработка](#локальная-разработка)
5. [Production build](#production-build)
6. [Деплой на Vercel](#деплой-на-vercel)
7. [API endpoints](#api-endpoints)
8. [Аутентификация](#аутентификация)
9. [Настройка контента](#настройка-контента)
10. [Структура проекта](#структура-проекта)
11. [Адаптация под свой backend](#адаптация-под-свой-backend)
12. [Безопасность](#безопасность)
13. [Решение проблем](#решение-проблем)

---

## Быстрый старт

```bash
npm install
cp .env.example .env.local     # заполнить VITE_API_BASE_URL
npm run dev
```

Нужна Node.js **18.18+** (или 20+).

---

## Переменные окружения

Все переменные фронтенда имеют префикс `VITE_` и **попадают в публичный бандл**.
Это нормально — здесь нет секретов. Секреты живут только в env самого backend.

| Переменная | Обязательна | По умолчанию | Назначение |
|---|:---:|---|---|
| `VITE_API_BASE_URL` | ✅ | `/api` | База API. `/api` — если backend в той же папке Vercel-проекта; иначе полный URL |
| `VITE_BOT_USERNAME` | ❌ | — | Только fallback для реферальной ссылки, если backend не вернул готовую |
| `VITE_SUPPORT_URL` | ❌ | — | Ссылка на поддержку (кнопки «Помощь», «Написать в поддержку») |
| `VITE_SUPPORT_USERNAME` | ❌ | — | Username поддержки без `@` для кнопки в профиле |
| `VITE_PRIVACY_URL` | ❌ | — | Если задана — кнопка ведёт на полный документ; иначе показывается встроенная страница |
| `VITE_APP_VERSION` | ❌ | `1.0.0` | Показывается в профиле |
| `VITE_ENABLE_MOCK_API` | ❌ | `false` | **Только для локальной разработки.** Мок-API без backend |

> ❌ **Никогда** не добавляйте в `.env` фронтенда: `H1VLESS_API_TOKEN`,
> `BOT_TOKEN`, `DATABASE_URL`, `REALITY_PRIVATE_KEY`, ключи платёжного провайдера.
> Они не попадут в бандл, но и работать не будут — а если попадут через ошибку
> конфигурации, утекут.

### Полный пример `.env.local`

```env
VITE_API_BASE_URL=https://api.your-vpn.com
VITE_BOT_USERNAME=YourVPNBot
VITE_SUPPORT_URL=https://t.me/YourVPNSupportBot
VITE_SUPPORT_USERNAME=YourVPNSupportBot
VITE_PRIVACY_URL=
VITE_APP_VERSION=1.0.0
```

---

## Как привязать Mini App к боту (BotFather)

### 1. Создайте бота (если ещё нет)

```
/newbot  →  выберите имя  →  выберите username
```

BotFather вернёт токен вида `7123456789:AAH...`. **Это секрет** — храните только
в env backend'а, никогда не в коде Mini App.

### 2. Привяжите домен

Команда ниже нужна **один раз**. Она добавляет адрес Mini App в бота и включает
кнопку в меню. Telegram требует HTTPS с валидным сертификатом — `localhost`
для этого не подходит.

```
/newapp  →  выберите вашего бота
         →  укажите URL: https://your-app.vercel.app
         →  придумайте Short Name (до 32 симв.):  Яблоко VPN
```

BotFather выдаст:
* **App link** вида `https://t.me/YourVPNBot/app` — ссылка для открытия приложения;
* **имя кнопки** в меню бота (появится под сообщением «/start»);
* **токен инициализации** — сохраните его: он пригодится для проверки `initData`
  в разработке.

### 3. Задеплойте и проверьте

После деплоя выполните `/newapp` ещё раз с production-URL (или
`/setmenubutton`), затем:

```
Откройте бота → /start → нажмите кнопку меню
```

### 4. Открытие по прямой ссылке

```bash
# Кнопка приложения
https://t.me/YourVPNBot/app

# С реферальным кодом (например, из рекламы)
https://t.me/YourVPNBot/app?startapp=ref_123456789

# Из ссылки бота (обычный start_param)
https://t.me/YourVPNBot?start=ref_123456789
```

Реферальный код приходит в `WebApp.initDataUnsafe.start_param` **и** в
подписанной `initData`. Backend должен читать его **только из подписанной
части** — иначе пользователь подделает ref-id и начислит себе бонус.

### 5. (Опционально) проверка initData локально

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/validate" \
     -d "initData=<ВЗЯТЬ_ИЗ_КОНСОЛИ_БРАУЗЕРА>"
```

Должен вернуть `{"ok": true, "result": {...}}`. То же самое делает backend
внутри каждого запроса — Mini App доверяет только серверу.

---

## Локальная разработка

```bash
npm run dev
```

Открыть `http://localhost:5173`. В обычном браузере приложение покажет экран
«Откройте через Telegram» — так сделан осознанно: без подписанной `initData`
нельзя определить пользователя, а притворяться, что можно, — дыра в безопасности.

### Визуальная разработка без Telegram

Включите мок-API:

```env
# .env.local
VITE_ENABLE_MOCK_API=true
VITE_BOT_USERNAME=YourVPNBot
```

Мок физически **вырезается из production-бандла** (ветка под `import.meta.env.DEV`).
В нём есть консольные хелперы:

```js
__vpnMock.activate()             // включить подписку
__vpnMock.deactivate()           // выключить (empty state)
__vpnMock.setBalance(150000)     // баланс 1 500 ₽
__vpnMock.expiresAt()            // дата окончания подписки
```

Мок имитирует webhook платёжного провайдера: оплата подтверждается на третьем
опросе статуса, поэтому полный флоу покупки проходит ровно как в проде.

### Тестирование в реальном Telegram

1. Задеплойте staging на Vercel (Telegram не открывает `localhost`);
2. Выполните `/newapp` с этим URL;
3. Откройте приложение из бота на телефоне.

Чтобы отлаживать на десктопе — используйте Telegram Desktop: консоль WebView
доступна через DevTools.

---

## Production build

```bash
npm run build     # tsc --noEmit && vite build → dist/
npm run preview   # локально проверить production-сборку
npm run typecheck # только проверка типов
```

Результат — статика в `dist/`. Сборка падает при любой ошибке TypeScript.

| Метрика | Значение |
|---|---|
| Бандл первого экрана (gzip) | **~70 КБ** |
| CSS (gzip) | ~5.6 КБ |
| Зависимостей | 2 |
| Иконок | 34 инлайновых SVG (без библиотеки) |
| Шрифтов | системный стек, 0 сетевых запросов |
| Исходников | ~5 500 строк |

Страницы, кроме `Home`, загружаются лениво: на старте в бандле только главный экран,
остальные приходят отдельными чанками по 1–9 КБ.

---

## Деплой на Vercel

### Вариант A — только Mini App (рекомендуется)

1. Импортируйте репозиторий в Vercel;
2. Framework Preset: **Vite**;
3. Build Command: `npm run build`;
4. Output Directory: `dist`;
5. **Environment Variables**: `VITE_API_BASE_URL=https://api.your-vpn.com`
   и остальные `VITE_*` из таблицы выше;
6. Deploy.

`vercel.json` уже содержит SPA-rewrites, кеширование `assets` на год и
заголовки безопасности.

### Вариант B — монолит (Mini App + backend в одном проекте)

Если ваш backend уже лежит в папке `/api` этого же Vercel-проекта:

```jsonc
// vercel.json — rewrites НЕ задевают /api
{
  "rewrites": [
    { "source": "/((?!api/|assets/).*)", "destination": "/index.html" }
  ]
}
```

Оставьте `VITE_API_BASE_URL=/api`. Секреты backend'а задаются в Vercel отдельно
и в бандл Mini App не попадают.

### Важно

* `VITE_*` — **публичные**. Не помещайте туда секреты.
* После изменения `VITE_*` нужен **Rebuild**, а не просто Restart: значения
  вшиваются на этапе сборки.

---

## API endpoints

Полный контракт с примерами — в [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

| Метод | Путь | Что делает | Авторизация |
|---|---|---|---|
| `GET` | `/health` | Живость + `minWithdrawalAmount`, `currency`, `supportUsername` | нет |
| `GET` | `/me` | Текущий пользователь + `referralLink` | initData |
| `GET` | `/subscription` | Подписка, даты, `remainingDays` | initData |
| `GET` | `/me/profile` | Агрегат: user + subscription + referral + stats | initData |
| `GET` | `/plans` | Тарифы и **цены** | initData |
| `POST` | `/payments/create` | Создать заказ. Тело: `{ planId }` | initData |
| `GET` | `/payments/:id/status` | Статус оплаты (фронт только опрашивает) | initData |
| `GET` | `/vpn/config` | VPN-конфигурация ⚠️ приватные данные | initData |
| `GET` | `/referrals/stats` | Рефералы, баланс, история вывода | initData |
| `POST` | `/withdrawals/create` | Заявка на вывод `{ amount, requisites }` | initData |

Все защищённые маршруты принимают заголовок:

```
X-Telegram-Init-Data: <Telegram.WebApp.initData>
```

### Формат ошибки

```json
{ "code": "MIN_WITHDRAWAL_NOT_REACHED", "message": "Минимальная сумма вывода — 500 ₽." }
```

`code` обязателен: по нему фронтенд выбирает текст для пользователя. Если `code`
неизвестен, показывается безопасная заглушка, а `message` **не выводится** —
чтобы SQL-ошибка или стектрейс не попали в интерфейс.

### Деньги — всегда в копейках

Целое число, чтобы не терять точность: `14900` = 149 ₽.

---

## Аутентификация

### Как это работает

```
1. Telegram открывает Mini App и подписывает данные пользователя
2. Mini App берёт WebApp.initData (НЕ initDataUnsafe)
3. Каждый запрос уходит с заголовком X-Telegram-Init-Data
4. Backend проверяет HMAC-SHA256 подпись и auth_date
5. Backend извлекает user.id ИЗ ПОДПИСИ и сам решает, кто это
```

Отдельного `/auth/login` **нет и не нужно** — это stateless-аутентификация на
каждый запрос. Так невозможно попасть в окно «сессия истекла перед первым запросом».

### Проверка на backend'е

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const BOT_TOKEN = process.env.BOT_TOKEN!;   // секрет, НЕ во фронтенде
const MAX_AGE_SEC = 86400;                  // 24 часа

function validateInitData(initData: string): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => [k, v].sort(([a], [b]) => a.localeCompare(b)))
    .map((k) => k.join('='))
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(hash ?? '', 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Unauthorized();

  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > MAX_AGE_SEC) throw new Unauthorized();

  return JSON.parse(params.get('user') ?? '{}');
}
```

### `initDataUnsafe` — только для мгновенного UI

Из него **не подписанного** поля можно показать имя/аватар до ответа backend'а
(чтобы не мигало пустотой). Принимать решения по нему нельзя. В этом проекте
он используется только для мгновенной отрисовки — см. `getInitDataUnsafeUser()`
в `src/lib/telegram.ts`.

---

## Настройка контента

### Название, поддержка, версия

`src/config/app.ts` → объект `APP_CONFIG`:

```ts
export const APP_CONFIG = {
  name: 'Яблоко VPN',
  tagline: 'Безопасный интернет в один клик',
  version: '1.0.0',
  apiBaseUrl: '/api',
  support: { url: 'https://t.me/Support', username: 'Support' },
  privacyUrl: '',
  expiringSoonDays: 5,
  paymentPolling: { intervalMs: 3000, maxAttempts: 40 },
  currency: 'RUB',
};
```

### Инструкция по подключению

Там же, без правки UI:

```ts
export const INSTRUCTION_STEPS = [
  { id: 'install', title: 'Установите поддерживаемое VPN-приложение', text: '…' },
  { id: 'copy',    title: 'Скопируйте свою конфигурацию',            text: '…' },
  { id: 'import',  title: 'Добавьте конфигурацию в приложение',      text: '…' },
  { id: 'connect', title: 'Активируйте подключение',                 text: '…' },
];

export const VPN_APPS = [
  { id: 'happ', name: 'Happ', note: 'iOS, Android, macOS, Windows',
    platform: 'all', storeUrl: 'https://apps.apple.com/…', emoji: '🟢' },
  // …
];

export const FAQ = [{ q: '…', a: '…' }];
```

Инструкция **не привязана к конкретному клиенту**: список приложений
конфигурируется, а тексты шагов не упоминают ни один из них по имени.

Backend может переопределить список клиентов — `GET /vpn/config` возвращает
`availableClients`, и экран «Ваш VPN» покажет его вместо локального.

### Тексты ошибок

`src/config/app.ts` → `COPY.errors`. Коды, которые backend может отдавать
текстом, перечислены в `SAFE_BACKEND_MESSAGES` в `src/api/client.ts`.

---

## Структура проекта

```
vpn/
├─ index.html                     # viewport-fit=cover, бут-скрин
├─ vercel.json                    # SPA rewrites (без /api), кеш, заголовки
├─ .env.example
└─ src/
   ├─ main.tsx                    # initTelegram() → рендер → снятие бут-скрина
   ├─ App.tsx                     # провайдеры + code splitting
   ├─ styles/global.css           # дизайн-система (~1 100 строк)
   │
   ├─ api/
   │  ├─ client.ts                # транспорт, заголовок initData, санитизация ошибок
   │  ├─ index.ts                 # ← ВСЕ методы и пути API
   │  ├─ normalize.ts             # snake_case ↔ camelCase, копейки, статусы
   │  └─ mock.ts                  # мок только для dev (вырезается из бандла)
   │
   ├─ components/
   │  ├─ Button  Card  StatusBadge  PlanCard  SubscriptionCard  StatPill
   │  ├─ BottomNavigation  Header  Modal  Toast  CopyButton  Icon
   │  ├─ LoadingSkeleton  EmptyState  ErrorBoundary  Layout
   │
   ├─ hooks/
   │  ├─ useSession.tsx           # user, subscription, health, refresh
   │  ├─ useCheckout.tsx          # заказ в памяти, опрос оплаты
   │  ├─ useAsync.ts              # loading/error/refetch, защита от гонок
   │  └─ useToast.tsx
   │
   ├─ layouts/AppShell.tsx        # safe-area, BackButton, bottom nav
   ├─ lib/
   │  ├─ telegram.ts              # единственная обёртка над WebApp SDK
   │  ├─ router.tsx               # стековый роутер (0 КБ зависимостей)
   │  ├─ format.ts                # даты, деньги, склонения
   │  └─ logger.ts                # маскирование секретов в логах
   ├─ config/app.ts               # весь редактируемый контент
   ├─ types/index.ts
   └─ pages/
      Home · Subscription · Plans · Checkout · PaymentSuccess · VpnConfig
      Instructions · Referrals · Profile · Help · Privacy
```

---

## Адаптация под свой backend

Если пути или имена полей отличаются, правьте **только два файла**:

**1. `src/api/index.ts`** — пути и payload'ы

```ts
export async function getSubscription(signal?: AbortSignal): Promise<Subscription> {
  if (mockEnabled()) return (await loadMock()).getSubscription();
  const raw = await http.get<unknown>('/subscription', { signal });
  return normalizeSubscription(raw);
}
```

**2. `src/api/normalize.ts`** — маппинг полей

Сейчас поддерживаются альтернативные имена без правок:

| Каноническое | Альтернативы |
|---|---|
| `expiresAt` | `expire_at`, `validUntil`, `endDate` |
| `paymentUrl` | `confirmation_url`, `redirect_url`, `redirectUrl` |
| `remainingDays` | `daysLeft`, `days_left` |
| `planName` | `tariffName`, `plan` |
| `status` | `state` |
| `price` | `amount`, `cost`, `value` |
| `avatarUrl` | `photo_url`, `photoUrl` |

Если структура ответа принципиально другая — допишите функцию в `normalize.ts`.
UI, роутер, стили и логика безопасности при этом не меняются.

> **Суммы.** Если backend отдаёт рубли (`149`), а не копейки (`14900`),
> `normalizeAmount()` приведёт значения `< 1000` как рубли автоматически.
> Чтобы не гадать, просто приведите backend к копейкам.

---

## Безопасность

| Правило | Как обеспечено |
|---|---|
| `userId` не принимается от клиента | Ни один метод API его не принимает. Только заголовок с подписанной `initData` |
| Нет запросов вида `GET /api/user?id=123` | Ни в одном методе нет параметров идентичности |
| Цена определяется сервером | `POST /payments/create` получает `{ planId }`; сумма приходит в ответе `Order` |
| Статус оплаты решает сервер | Экран успеха достижим **только** при `status === 'paid'` от бэкенда. Фронт лишь опрашивает |
| Баланс и минимум вывода — с сервера | `GET /referrals/stats` и `GET /health`. Frontend не копит и не считает |
| Конфигурация не в URL | Стековый роутер без параметров-секретов. Проверено: `location.href` чист |
| Конфигурация не в хранилище | Только в памяти компонента. `localStorage`/`sessionStorage` пусты — проверено |
| Конфигурация не в логах | `logger.ts` маскирует `vless://`, `ss://`, `initData`, токены. Проверено на 4 векторах |
| Нет утечек технических ошибок | Проверено на 8 сценариях (SQL-стейт, JWT, HTML-ответ, битый JSON) — ноль утечек |
| H1VLESS недоступен из браузера | В `src/` нет ни одного обращения. Токены — только в env backend'а |
| Ошибка входа | Показано «Откройте через Telegram» вместо мусора |

Перед деплоем убедитесь, что backend:

* [ ] проверяет HMAC-SHA256 подпись `initData` сравнением constant-time;
* [ ] отклоняет `initData` старше 24 часов;
* [ ] **не** доверяет `user_id` из тела запроса или query-параметров;
* [ ] **не** логирует `initData` в открытом виде;
* [ ] **не** логирует ответ `/vpn/config` без маскирования;
* [ ] берёт цену из своей БД по `planId`, а не из тела запроса;
* [ ] ставит `Order = paid` только по webhook'у провайдера;
* [ ] идемпотентен в `POST /payments/create` (защита от двойного заказа);
* [ ] проверяет минимальную сумму вывода и наличие средств на сервере;
* [ ] валидирует сумму вывода и реквизиты на сервере.

---

## Решение проблем

**Приложение показывает «Откройте через Telegram»**
Открыто в обычном браузере. Нужен Telegram WebView — либо включите
`VITE_ENABLE_MOCK_API=true` для разработки.

**Все запросы возвращают 401**
Backend не находит или отвергает заголовок `X-Telegram-Init-Data`. Проверьте:
имя заголовка, `BOT_TOKEN`, и что домен Mini App добавлен через `/newapp`.

**Кнопка «Оплатить» открывает пустую страницу**
`paymentUrl` пустой или ведёт на localhost. `localhost` не работает в Telegram —
используйте HTTPS-домен. Если провайдер отдаёт `t.me`-ссылку, она откроется
внутри Telegram, остальные — во встроенном браузере.

**Оплатили, но подписки нет**
Проверьте webhook: `Order` должен перейти в `paid`, затем backend вызывает
`H1VlessService.provision()`. Экран покажет честное «подписка появится в течение
минуты» — фронтенд **не** считает оплату успешной по нажатию.

**`npm run build` падает**
Ошибка TypeScript. `npm run typecheck` покажет строку. Сборка намеренно строгая:
`strict`, `noUnusedLocals`, `noUncheckedIndexedAccess`.

**Проблемы с отступами в Telegram**
Mini App рассчитывает на safe-area и `--tg-viewport-stable-height`. Убедитесь,
что в `index.html` есть `viewport-fit=cover`. Не задавайте фиксированную высоту
экранам — используйте `.screen` с нижним отступом.

**Конфигурация не копируется**
Внутри Telegram на iOS `navigator.clipboard` может быть недоступен. В коде есть
фолбэк через `execCommand`; если и он не сработал, пользователю показывается
сообщение и он может раскрыть конфигурацию вручную кнопкой «показать полностью».

---

## Лицензия

Фронтенд готов к использованию. Бизнес-логика, платежи и управление H1VLESS
остаются в вашем backend.