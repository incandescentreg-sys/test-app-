/**
 * Тесты проверки подписи Telegram initData.
 *
 * Не нуждаются ни в базе, ни в сети: генерируем initData тем же HMAC,
 * которым подписывает Telegram, и проверяем, что backend их принимает,
 * а подделки и протухшие — отвергает.
 *
 * Запуск: npm.cmd run test:initdata
 */

import { createHmac } from 'node:crypto';
import { validateInitData, parseReferralId } from '../api/_lib/telegram.ts';

const BOT_TOKEN = '7123456789:AAHfakeTokenForTestsOnly000';

process.env.BOT_TOKEN = BOT_TOKEN;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Собирает initData так же, как это делает Telegram. */
function buildInitData(user: Record<string, unknown>, extra: Record<string, string> = {}, authDate = Math.floor(Date.now() / 1000)): string {
  const params: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user, null, 0),
    ...extra,
  };

  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  return `${new URLSearchParams({ ...params, hash }).toString()}`;
}

const user = {
  id: 123456789,
  first_name: 'Иван',
  last_name: 'Петров',
  username: 'ivan',
  language_code: 'ru',
};

console.log('\nПроверка подписи initData\n');

/* ── Приём ──────────────────────────────────────────────────────────────── */
{
  const auth = validateInitData(buildInitData(user));
  check('валидная подпись принимается', auth.user.id === 123456789);
  check('имя читается', auth.user.first_name === 'Иван');
  check('authDate парсится', auth.authDate > 1_600_000_000);
}

{
  // start_param приходит подписанным — именно из него берётся ref-код.
  const auth = validateInitData(buildInitData(user, { start_param: 'ref_987654321' }));
  check('start_param читается', auth.startParam === 'ref_987654321');
  check(
    'ref-код разбирается',
    parseReferralId(auth.startParam) === 987654321,
    `получено ${String(parseReferralId(auth.startParam))}`,
  );
}

/* ── Отклонение ─────────────────────────────────────────────────────────── */
function expectUnauthorized(label: string, initData: string): void {
  try {
    validateInitData(initData);
    check(label, false, 'подпись принята, а должна была быть отвергнута');
  } catch {
    check(label, true);
  }
}

expectUnauthorized('пустая строка отвергается', '');
expectUnauthorized('нет поля hash', 'auth_date=123&user=%7B%22id%22%3A1%7D');

{
  // Подмена user при сохранённой подписи — классическая атака.
  const valid = buildInitData(user);
  const tampered = valid.replace('123456789', '777777777');
  expectUnauthorized('подмена user.id ломает подпись', tampered);
}

{
  // Свой ключ вместо бот-токена.
  const dataCheckString = `auth_date=${Math.floor(Date.now() / 1000)}\nuser=${JSON.stringify(user)}`;
  const secret = createHmac('sha256', 'WebAppData').update('wrong-token').digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  expectUnauthorized(
    'чужая подпись отвергается',
    new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), hash }).toString(),
  );
}

{
  // Сутки назад — ещё живёт, двое суток — уже нет.
  const day = 86_400;
  const fresh = buildInitData(user, {}, Math.floor(Date.now() / 1000) - day + 60);
  check('initData суточной давности принимается', Boolean(validateInitData(fresh)));

  const stale = buildInitData(user, {}, Math.floor(Date.now() / 1000) - day * 2);
  expectUnauthorized('initData двухдневной давности отвергается', stale);
}

{
  // Подпись из будущего — признак подделки или рассинхрона часов.
  const future = buildInitData(user, {}, Math.floor(Date.now() / 1000) + 3600);
  expectUnauthorized('initData из будущего отвергается', future);
}

expectUnauthorized('битый user отвергается', buildInitData({}));

/* ── Разбор ref-кода ─────────────────────────────────────────────────────── */
console.log('\nРазбор реферального кода:');
check('ref_123 → 123', parseReferralId('ref_123') === 123);
check('пусто → null', parseReferralId(null) === null);
check('пустая строка → null', parseReferralId('') === null);
check('мусор → null', parseReferralId('abc') === null);
check('без префикса → null', parseReferralId('123') === null);
check('другой префикс → null', parseReferralId('promo_123') === null);
check('не число → null', parseReferralId('ref_abc') === null);
check('ноль → null', parseReferralId('ref_0') === null);
check('пробелы обрезаются', parseReferralId('  ref_555  ') === 555);

console.log(`\nИтог: ${passed} прошло, ${failed} провалено\n`);
process.exit(failed === 0 ? 0 : 1);