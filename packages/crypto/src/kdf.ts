import { KEY_BITS, MAX_ITERATIONS, MIN_ITERATIONS, MIN_PASSWORD_LENGTH } from './constants.js';
import { utf8Encode } from './encoding.js';
import { CryptoError } from './errors.js';
import { getSubtle } from './subtle.js';

/**
 * FR-03. Деривация ключа из мастер-пароля: PBKDF2-HMAC-SHA-256.
 * Ключ создаётся неэкспортируемым — даже код страницы не может прочитать его байты.
 */

export function checkIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new CryptoError('INVALID_PACKAGE', `Недопустимое число итераций PBKDF2: ${iterations}.`);
  }
}

/** Проверка пароля при создании заметки. При открытии не применяется. */
export function validateNewPassword(password: string): void {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    throw new CryptoError('WEAK_PASSWORD', `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`);
  }
}

async function importPassword(password: string): Promise<CryptoKey> {
  // NFC: один и тот же пароль, набранный на разных устройствах, даёт одинаковые байты.
  return getSubtle().importKey('raw', utf8Encode(password.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
    'deriveBits',
  ]);
}

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  checkIterations(iterations);
  const base = await importPassword(password);
  return getSubtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Сырые байты PBKDF2 — только для проверки на эталонных векторах (RFC 7914, §11).
 * Не используется для шифрования; ограничение на число итераций здесь не действует.
 */
export async function pbkdf2Bits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  lengthBytes: number,
): Promise<Uint8Array> {
  const base = await importPassword(password);
  const bits = await getSubtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, lengthBytes * 8);
  return new Uint8Array(bits);
}
