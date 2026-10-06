/**
 * Сравнение двух вариантов строки, по которой Telegram считает hash.
 *
 * 1. Только поля initData — так описано в документации для проверки токеном.
 * 2. С префиксом "<bot_id>:WebAppData" и переводом строки — так описана
 *    проверка сторонней подписью.
 *
 * Подпись Ed25519 от Telegram подтвердила, что набор полей и порядок верны.
 * Если hash не сходится ни с одним вариантом — проблема в чём-то третьем,
 * и нужно увидеть оба хэша рядом.
 */

import { createHmac } from 'node:crypto';

const TOKEN = process.argv[2] ?? '8818741361:AAGQY3yfEQsJQtjoI38WQqvtQ_r5LBf1Rh4';
const BOT_ID = TOKEN.split(':')[0] ?? '';

const pairs: Array<[string, string]> = [
  ['auth_date', '1791280000'],
  ['chat_instance', '-1234567890123456789'],
  ['chat_type', 'sender'],
  ['user', '{"id":123456789,"first_name":"Test"}'],
];

const body = pairs.map(([key, value]) => `${key}=${value}`).join('\n');
const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();

const plain = createHmac('sha256', secret).update(body).digest('hex');
const prefixed = createHmac('sha256', secret)
  .update(`${BOT_ID}:WebAppData\n${body}`)
  .digest('hex');

console.log('\nДва варианта строки для HMAC\n');
console.log('  только поля       ', plain);
console.log('  с префиксом bot_id', prefixed);
console.log(`\n  варианты различаются: ${plain !== prefixed}`);
console.log('  Значение hash из реального initData нужно сравнить вручную.');
console.log('  В логах это видно как hashStyle, когда несовпадений больше нет.\n');