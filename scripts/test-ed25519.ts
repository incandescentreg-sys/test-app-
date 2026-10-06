/**
 * Проверка Ed25519: ключ Telegram из документации и синтетическая подпись.
 *
 * Нужна, чтобы убедиться, что построение ключа и проверка работают в этой
 * среде. Если они сломаны, поле signature нельзя использовать как
 * независимую проверку initData.
 */

import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify as verifySignature,
} from 'node:crypto';

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const TELEGRAM_PRODUCTION = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
const TELEGRAM_TEST = '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec';

function keyFromRaw(hexKey: string) {
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hexKey, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log('\nПроверка Ed25519\n');

// Ключи Telegram из документации должны читаться без ошибок.
let productionKey: ReturnType<typeof keyFromRaw> | null = null;
let testKey: ReturnType<typeof keyFromRaw> | null = null;
void testKey;
try {
  productionKey = keyFromRaw(TELEGRAM_PRODUCTION);
  check('ключ production читается', true);
} catch {
  check('ключ production читается', false);
}
try {
  testKey = keyFromRaw(TELEGRAM_TEST);
  check('ключ test читается', true);
} catch {
  check('ключ test читатся', false);
}

// Подписываем своим ключом и проверяем обратной сборкой того же формата.
{
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const rebuilt = keyFromRaw(raw.toString('hex'));
  const data = Buffer.from('12345:WebAppData\nauth_date=1\nuser={}', 'utf8');
  const signature = sign(null, data, privateKey).toString('base64url');

  check('своя подпись принимается', verifySignature(null, data, rebuilt, Buffer.from(signature, 'base64url')));
  check(
    'чужая подпись отвергается',
    !verifySignature(null, Buffer.from('другой'), rebuilt, Buffer.from(signature, 'base64url')),
  );
}

// Ключ Telegram не должен подходить под чужую подпись.
if (productionKey) {
  const { privateKey } = generateKeyPairSync('ed25519');
  const data = Buffer.from('8818741361:WebAppData\nauth_date=1', 'utf8');
  const signature = sign(null, data, privateKey).toString('base64url');
  check(
    'подпись чужого ключа не проходит ключом Telegram',
    !verifySignature(null, data, productionKey, Buffer.from(signature, 'base64url')),
  );
}

console.log(`\nИтог: ${passed} прошло, ${failed} провалено\n`);
process.exitCode = failed === 0 ? 0 : 1;