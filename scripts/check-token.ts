/**
 * Проверка токена бота: `npm run check:token`.
 *
 * Зачем: если токен неверный, backend не падает — он молча отвергает
 * подпись `initData`, и пользователи видят «Сессия истекла. Перезапустите
 * приложение». Симптом очень далёк от настоящей причины, поэтому лучше
 * проверить токен явно и сразу.
 *
 * Сначала проверяется формат строки (без сети), потом — сам Telegram.
 * Разные ошибки дают разные подсказки.
 */

const RAW = process.env.BOT_TOKEN ?? '';

function fail(reason: string, hint: string): never {
  console.error(`\n  Токен не подходит: ${reason}\n`);
  console.error(`  ${hint}\n`);
  process.exit(1);
}

/* ── 1. Формат: ловим опечатки ещё до обращения к сети ──────────────────── */

if (!RAW) {
  fail('BOT_TOKEN не задан', 'Впишите токен в api/.env — его выдаёт BotFather.');
}

const parts = RAW.split(':');
if (parts.length !== 2) {
  fail(
    'нет единственного двоеточия между id и секретом',
    'Токен должен выглядеть как 123456789:AAH… — проверьте, не обрезался ли конец строки.',
  );
}

const [botId, secret] = parts as [string, string];

if (!/^\d{5,20}$/.test(botId)) {
  fail(`«${botId}» не похоже на числовой id бота`, 'Перед двоеточием стоят только цифры.');
}

if (secret.length !== 35) {
  fail(
    `секрет длиной ${secret.length} символов, а должен быть 35`,
    'Почти наверняка символ потерялся при копировании — скопируйте токен заново.',
  );
}

if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
  fail('в секрете есть недопустимые символы', 'В токене встречаются только буквы, цифры, _ и -.');
}

console.log('\nФормат токена корректен.');

/* ── 2. Живая проверка у Telegram ────────────────────────────────────────── */

let response: Response;
try {
  response = await fetch(`https://api.telegram.org/bot${RAW}/getMe`);
} catch {
  // Отдельно от «токен неверный»: сеть до Telegram может быть закрыта.
  fail(
    'не удалось достучаться до api.telegram.org',
    'Это не ошибка токена — нет сетевого доступа. Частая история в РФ: помогает VPN.',
  );
}

const payload = (await response.json().catch(() => null)) as
  | { ok?: boolean; result?: { id: number; username: string; first_name: string }; description?: string }
  | null;

if (!payload?.ok || !payload.result) {
  const code = response.status;
  if (code === 404) {
    fail(
      'Telegram не знает такой токен (404)',
      'Бот удалён, токен перевыпущен через BotFather (/revoke) или в нём опечатка.\n' +
        '  Откройте @BotFather → /mybots → выберите бота → API Token и возьмите свежий.',
    );
  }
  if (code === 401) {
    fail('токен отозван (401)', 'Выпустите новый токен в BotFather: /revoke, затем скопируйте новый.');
  }
  fail(
    `Telegram ответил ${code}: ${payload?.description ?? 'без описания'}`,
    'Проверьте интернет и попробуйте ещё раз.',
  );
}

const bot = payload.result;
console.log(`Telegram подтвердил токен.\n`);
console.log(`  id         ${bot.id}`);
console.log(`  @username  @${bot.username}`);
console.log(`  имя        ${bot.first_name}`);

const expected = process.env.BOT_USERNAME?.replace(/^@/, '');
if (expected && expected !== bot.username) {
  console.warn(`\n  ВНИМАНИЕ: в api/.env BOT_USERNAME=${expected}, а у бота @${bot.username}.`);
  console.warn(`  Реферальные ссылки собираются из BOT_USERNAME — исправьте, иначе они будут вести не туда.\n`);
} else if (!expected) {
  console.warn(`\n  BOT_USERNAME в api/.env не задан — реферальные ссылки соберутся с заглушкой.`);
  console.warn(`  Впишите сюда ${bot.username}\n`);
}

console.log(`\n  Осталось привязать Mini App: в BotFather → /newapp → указать https-домен с этим ботом.\n`);