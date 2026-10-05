# Backend: Vercel Functions + H1VLESS

Документ описывает серверную часть: как поднять базу, заполнить переменные,
применить миграции, выдать первую подписку вручную и что происходит при оплате.

Фронтенд (`src/`) ничего не знает про панель. Все секреты живут только здесь.

---

## 1. Что где лежит

```
api/                          # Vercel Functions (Node.js, TypeScript)
├─ health.ts                  # GET  /api/health              — публичный, без авторизации
├─ me.ts                      # GET  /api/me                  — текущий пользователь
├─ me/profile.ts              # GET  /api/me/profile          — агрегат профиля
├─ subscription.ts            # GET  /api/subscription        — подписка и остаток дней
├─ plans.ts                   # GET  /api/plans               — тарифы И ЦЕНЫ
├─ payments/create.ts         # POST /api/payments/create     — заказ { planId }
├─ payments/[id]/status.ts    # GET  /api/payments/:id/status — опрос статуса
├─ vpn/config.ts              # GET  /api/vpn/config          — ссылка vless://
├─ referrals/stats.ts         # GET  /api/referrals/stats     — рефералы и кошелёк
├─ withdrawals/create.ts      # POST /api/withdrawals/create  — заявка на вывод
├─ webhooks/payment.ts        # POST /api/webhooks/payment    — единственное место `paid`
├─ admin/provision.ts         # POST /api/admin/provision     — ручная выдача (секрет!)
└─ _lib/
   ├─ env.ts                  # ЕДИНСТВЕННОЕ место чтения process.env
   ├─ http.ts                 # ответы, ошибки, маскирование логов
   ├─ telegram.ts             # проверка HMAC-подписи initData
   ├─ h1vless.ts              # клиент панели H1VLESS
   ├─ prisma.ts               # Prisma-клиент (один на инстанс)
   ├─ user.ts                 # upsert пользователя, реферальная связь
   ├─ subscription.ts         # выдача, продление, синхронизация с панелью
   ├─ plans.ts                # тарифы и цены
   ├─ payments.ts             # заказы, расчёт, подтверждение
   └─ referrals.ts            # бонусы, баланс, выводы

prisma/schema.prisma          # Пользователи, тарифы, подписки, заказы, рефералы
scripts/db-local.ts           # Локальный Postgres на PGlite (без Docker)
scripts/dev-api.ts            # Локальный запуск функций без Vercel CLI
scripts/provision.ts          # Ручная выдача подписки: npm run provision -- <id>
scripts/seed.ts               # Наполнение таблицы тарифов
scripts/smoke-h1vless.ts      # Живая проверка интеграции с панелью
scripts/test-initdata.ts      # Тесты проверки подписи Telegram
scripts/test-e2e.ts           # Сквозной тест всех маршрутов
scripts/diag-db.ts            # Диагностика подключения Prisma
scripts/_devResponse.ts       # Адаптер VercelResponse для локального запуска
```

---

## 2. Переменные окружения

Полный шаблон с комментариями — `api/.env.example`. Обязательные:

| Переменная | Зачем |
| --- | --- |
| `BOT_TOKEN` | Токен бота от BotFather. Без него нельзя проверять подпись `initData` — ни один защищённый маршрут не заработает |
| `DATABASE_URL` | Строка подключения к PostgreSQL |
| `ADMIN_SECRET` | Секрет ручной выдачи подписки. Пока не задан, `/api/admin/provision` закрыт целиком |
| `WEBHOOK_SECRET` | Секрет подтверждения оплаты |

Для интеграции с панелью достаточно **одного** из двух:

- `H1VLESS_TOKEN` — готовый токен панели;
- `H1VLESS_USERNAME` + `H1VLESS_PASSWORD` — backend сам выполнит `POST /auth/login` и закэширует токен в памяти инстанса.

Токен можно получить один раз:

```bash
curl -X POST http://<панель>:25108/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"<логин>","password":"<пароль>"}'
# → {"ok":true,"token":"…"}
```

> Ни токен, ни пароль не должны попадать во фронтенд. В `VITE_*` их быть не должно.

---

## 3. База данных

Подойдёт любой PostgreSQL. Проще всего — Neon или Supabase, у обоих есть бесплатный серверless-тариф.

```bash
# Neon
npx.cmd create-neon-app          # или создайте проект в браузере
# → скопируйте строку postgresql://… в DATABASE_URL

# Supabase: Project Settings → Database → Connection string → URI
```

Схема лежит в `prisma/schema.prisma`. Две команды:

```bash
$env:DATABASE_URL = 'postgresql://…'

npm.cmd run db:push      # создать таблицы по схеме (быстро, для старта)
npm.cmd run db:seed      # заполнить таблицу тарифов
```

`db:push` good для быстрого старта. Когда схема устаканится — переходите на миграции:

```bash
npm.cmd run db:migrate -- --name init   # создать файл миграции
npm.cmd run db:deploy                    # применить на production
```

Посмотреть данные — `npm run db:studio`.

### Что в таблицах

| Таблица | Содержит |
| --- | --- |
| `users` | Telegram-профиль, кто пригласил |
| `plans` | Тарифы и цены в копейках — **единственный** источник цен |
| `subscriptions` | Срок, тариф, имя клиента в панели, кэш ссылки |
| `orders` | Заказы, сумма, статус, факт оплаты |
| `referral_earnings` | Бонусы пригласившим |
| `withdrawals` | Заявки на вывод |

Суммы везде — **целые копейки**: `14900` = 149 ₽. Так не теряется точность.

---

## 4. Переменные на Vercel

Проект в Vercel должен быть один (монолит: статика + `/api`). Настройки:

| Параметр | Значение |
| --- | --- |
| Framework Preset | Vite |
| Build Command | `npm run build` (уже включает `prisma generate`) |
| Output Directory | `dist` |
| Install Command | `npm ci` |

В **Environment Variables** добавьте всё из `api/.env.example`. Секреты — только там; в `VITE_*` их быть не должно.

`vercel.json` уже содержит:

- rewrites, которые **не** задевают `/api` (фронтенд на `/api` работает как с обычным API);
- лимит времени функций — 30 с (хватает на запрос к панели);
- заголовки кеша и безопасности.

---

## 5. Локальный запуск

### 5.1 База без установки PostgreSQL

Docker на Windows — отдельная боль, поэтому в проекте есть локальный Postgres
на PGlite (тот же Postgres, скомпилированный в WASM). Данные лежат в `.pglite/`
и переживают перезапуск.

```bash
npm.cmd run db:local      # в отдельном терминале, не закрывать
```

Поднимается сервер на `127.0.0.1:5432`. Строка подключения:

```
postgresql://postgres:postgres@127.0.0.1:5432/vpn?connection_limit=1&pgbouncer=true
```

Два параметра в конце обязательны **для PGlite**:

- `connection_limit=1` — движок однопоточный, соединение должно быть одно;
- `pgbouncer=true` — Prisma не использует prepared statements. PGlite их не поддерживает, и без этого параметра запрос падает с `prepared statement "s0" already exists`.

На Neon и Supabase эти параметры не нужны — там обычный PostgreSQL.

### 5.2 Схема и тарифы

```bash
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/vpn?connection_limit=1&pgbouncer=true'

npm.cmd run db:push    # создать таблицы
npm.cmd run db:seed    # заполнить тарифы
```

### 5.3 Backend и статика

```bash
$env:BOT_TOKEN        = '7123…'
$env:ADMIN_SECRET     = 'любой-длинный-секрет'
$env:H1VLESS_BASE_URL = 'http://<панель>:25108'
$env:H1VLESS_USERNAME = '…'
$env:H1VLESS_PASSWORD = '…'

npm.cmd run build      # собрать статику в dist/
npm.cmd run dev:api    # API + раздача dist/ на :3000
```

Проверка:

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"version":"1.0.0","app":{…}}
```

`vercel dev` тоже работает, если CLI установлен.

Скрипты `dev:api`, `db:seed`, `provision`, `test:e2e` и `test:h1vless` читают
`api/.env` сами — вручную переменные выставлять не нужно. Файл в `.gitignore`,
в репозиторий не попадёт.

---

## 6. Проверки

```bash
npm.cmd run test            # типы фронтенда + типы backend + тесты initData
npm.cmd run typecheck:api   # только типы backend и скриптов
npm.cmd run test:initdata   # подпись Telegram: приём и отклонение
npm.cmd run test:h1vless    # живой цикл create → info → edit → delete на панели
npm.cmd run test:e2e        # сквозной тест всех маршрутов через настоящий initData
```

`test:h1vless` создаёт временного клиента, проверяет, что `PATCH /edit` действительно **прибавляет** дни, и **удаляет** клиента в конце. Панель после теста остаётся чистой.

`test:e2e` поднимает обработчики из `api/`, генерирует валидную подписанную `initData` и проходит весь путь: `/health` → `/plans` → `/me` → заказ → ручная выдача подписки через панель → `/vpn/config` → продление → рефералы → вывод. В конце удаляет и клиента в панели, и запись в базе, поэтому прогон повторяемый. Полный отчёт пишется в `e2e-report.txt`.

Для `test:e2e` нужны база и доступ к панели:

```bash
$env:DATABASE_URL     = 'postgresql://postgres:postgres@127.0.0.1:5432/vpn?connection_limit=1&pgbouncer=true'
$env:BOT_TOKEN        = '7123…'
$env:ADMIN_SECRET     = 'local-test-secret'
$env:H1VLESS_BASE_URL = 'http://<панель>:25108'
$env:H1VLESS_USERNAME = '…'
$env:H1VLESS_PASSWORD = '…'

npm.cmd run test:e2e
```

Если подключение к базе сломалось и непонятно где — `npx tsx scripts/diag-db.ts` покажет реальную ошибку Prisma целиком.

---

## 7. Выдача подписки вручную

Пока платежи выключены, доступ выдаётся этой командой. Она читает `api/.env`,
поэтому секреты руками вводить не нужно.

```bash
npm.cmd run provision -- 123456789            # тариф plan-1m, 30 дней
npm.cmd run provision -- 123456789 plan-3m     # 3 месяца
npm.cmd run provision -- 123456789 plan-1m 90  # 90 дней поверх тарифа
```

Вывод:

```
Готово. Создана подписка:
  тариф      1 месяц (30 дней)
  действует  до 2026-11-04T17:54:26.000Z
  клиент     tg123456789
  на панели  active, осталось 29 дн.
  ссылка     vless://…@rsvnor.eq6upxi8if.h1cloud.lol:443?…
```

> Панель округляет `left_days` **вниз**, поэтому только что выданные 30 дней
> приходят как 29. Это её особенность, не ошибка. Наш `remainingDays`
> округляется вверх — в приложении пользователь видит честные 30 дней.

Повторный запуск с тем же id **продлевает** подписку, а не создаёт второго клиента.

То же самое делает HTTP-маршрут — он нужен, когда backend уже задеплоен.
Секрет обязателен, из фронтенда маршрут вызываться не должен:

```bash
curl -X POST https://<host>/api/admin/provision \
     -H "Content-Type: application/json" \
     -H "X-Admin-Secret: <ADMIN_SECRET>" \
     -d '{"telegramId":123456789,"planId":"plan-1m"}'
```

Ответ содержит и то, что вернула панель:

```jsonc
{
  "ok": true,
  "telegramId": 123456789,
  "isNew": true,          // true — создана, false — продлена
  "expiresAt": "2026-12-04T10:22:31.000Z",
  "panel": { "name": "tg123456789", "uuid": "…", "status": "active", "leftDays": 29 }
}
```

---

## 8. Поток покупки

Сейчас `PAYMENTS_ENABLED=false`: тарифы видны, а `POST /payments/create` отвечает `503 PAYMENT_UNAVAILABLE`. Пользователь видит «Приём оплаты временно недоступен» — деньги никуда не уходят.

Когда подключите провайдера:

1. Реализуйте создание платежа в `api/_lib/payments.ts` (одна функция) — контракт с фронтендом не изменится;
2. Поставьте `PAYMENTS_ENABLED=true`;
3. Направьте webhook провайдера на `POST /api/webhooks/payment` с заголовком `X-Webhook-Secret`.

Что происходит при webhook:

```
провайдер → POST /api/webhooks/payment
              ├─ проверка секрета (сравнение за постоянное время)
              ├─ заказ → paid
              ├─ grantAccess(): панели уходят дни, клиент создаётся/продлевается
              └─ начисление бонуса пригласившему
```

Обработка **идемпотентна**: повторный webhook не продлит подписку дважды.

Фронтенд при этом только опрашивает `GET /api/payments/:id/status`. Он не может объявить заказ оплаченным — такой возможности у него физически нет.

---

## 9. Интеграция с H1VLESS

Используется REST API панели (`release 2.3.91`). Соответствие вызовов:

| Задача | Вызов | Важная деталь |
| --- | --- | --- |
| Вход | `POST /auth/login` | Токен кэшируется в памяти инстанса на 30 минут |
| Статус | `GET /status` | Нода, транспорт, счётчики клиентов |
| Клиент | `GET /info?name=NAME` | `404` панели — это «клиента нет», не ошибка |
| Создать | `POST /create {name, days}` | `days` — срок **от текущего момента** |
| Продлить | `PATCH /edit {name, days}` | `days` **прибавляется** к текущему сроку, а не задаёт заново |
| Бан | `PATCH /clients/NAME/ban` | Вызывается при отзыве доступа |
| Удалить | `DELETE /clients/NAME` | Только при полном отзыве |
| Ссылка | `client.links.xhttp_cdn`, `client.sub_url` | Приоритет — в `pickLink()` |

Имя клиента: `H1VLESS_CLIENT_PREFIX` + `telegramId` → `tg123456789`.

**Панель — источник истины.** Перед выдачей конфигурации backend сверяется с ней (`syncFromPanel`), поэтому ручное продление или бан администратором в панели сразу видны в приложении. Срок в базе никогда не пересчитывается «по своей формуле» — он берётся из панели.

Обрыв связи с панелью не ломает чтение: приложение отдаёт последнее известное состояние.

---

## 10. Проверка безопасности

Что обеспечено на сервере:

| Правило | Как |
| --- | --- |
| `userId` не принимается от клиента | Ни один маршрут; только заголовок `X-Telegram-Init-Data` |
| Подпись проверяется | HMAC-SHA256, сравнение `timingSafeEqual` |
| Сессия не вечна | `initData` старше `INIT_DATA_MAX_AGE_SEC` отвергается |
| `initData` из будущего отвергается | Небольшой допуск на расхождение часов |
| Цена определяется сервером | `POST /payments/create` получает только `planId` |
| `paid` ставит только webhook | Фронтенд лишь опрашивает статус |
| Заказ читает только владелец | `userId` подставляется в условие запроса |
| Реферальный код нельзя подделать | Читается из **подписанного** `start_param` |
| Пригласившего нельзя сменить | `referredById` выставляется один раз |
| Двойной вывод невозможен | Проверка и создание заявки — в одной транзакции |
| Сумма вывода проверяется на сервере | Минимум, баланс, реквизиты, одна активная заявка |
| `vless://` не попадает в лог | Маскирование по имени поля в `log()` |
| Ответ с конфигом не кэшируется | `Cache-Control: no-store` |
| Реквизиты не отдаются целиком | Показываются последние 4 символа |
| Технические ошибки не утекают | Наружу уходит только `{code, message}` с кодом из договорённого списка |

Секреты (`BOT_TOKEN`, `H1VLESS_PASSWORD`, `ADMIN_SECRET`, `WEBHOOK_SECRET`) — только в env. Во фронтенде их нет и быть не должно: значения с префиксом `VITE_*` попадают в публичный бандл.

---

## 11. Что осталось настроить

| Задача | Как |
| --- | --- |
| Домен Mini App у BotFather | `/newapp` → указать URL с HTTPS |
| Токен бота | `BOT_TOKEN` в Vercel |
| База | `DATABASE_URL`, `db:push`, `db:seed` |
| Подписки вручную | `ADMIN_SECRET` + `POST /api/admin/provision` |
| Оплата | `PAYMENTS_ENABLED=true` + реализация одной функции + webhook |
| Цены | Таблица `plans`; фронтенд собирается заново не нужно |

---

## 12. Решение проблем

**Все запросы возвращают 401.** Не задан `BOT_TOKEN` или домен не прописан через `/newapp`. Сверьте: значение `BOT_TOKEN` — ровно то, что выдал BotFather, без кавычек и пробелов.

**`/api/health` отвечает, остальные — 500.** Скорее всего, не применены миграции: `npm run db:push` с актуальным `DATABASE_URL`.

**500 при выдаче подписки.** Скорее всего, панель недоступна или не задан `H1VLESS_TOKEN`/`H1VLESS_USERNAME`. Проверьте `npm run test:h1vless` — он покажет, на каком шаге панель отказала.

**Продление не работает.** Уточните в панели, что `PATCH /edit {days: N}` прибавляет дни. `npm run test:h1vless` проверяет именно это.

**Конфигурация не приходит, а подписка есть.** Панель ещё не отдала ссылку. Backend честно отвечает `VPN_NOT_READY` с текстом «обновите через минуту», а не пустой строкой.

**401 на `/api/admin/provision` при верном секрете.** Проверьте, что `ADMIN_SECRET` задан в том же окружении, где идёт запрос. Не задан — маршрут закрыт целиком, это намеренно.