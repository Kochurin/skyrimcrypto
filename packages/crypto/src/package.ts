import {
  CIPHER_ALGORITHM,
  FORMAT_VERSION,
  IV_BYTES,
  KDF_ALGORITHM,
  SALT_BYTES,
  TAG_BYTES,
} from './constants.js';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding.js';
import { CryptoError } from './errors.js';
import { checkIterations } from './kdf.js';

/**
 * Формат зашифрованного пакета (поток F5 / F13 из ЛР7).
 * Это всё, что когда-либо видит сервер: ни пароля, ни ключа, ни открытого текста.
 */
export interface EncryptedPackage {
  v: typeof FORMAT_VERSION;
  kdf: { alg: typeof KDF_ALGORITHM; iterations: number; salt: string };
  cipher: { alg: typeof CIPHER_ALGORITHM; iv: string };
  /** Шифротекст вместе с 16-байтовым тегом аутентификации, base64url. */
  ciphertext: string;
}

export interface DecodedPackage {
  header: Omit<EncryptedPackage, 'ciphertext'>;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

/**
 * Заголовок пакета в каноническом виде. Он подаётся в AES-GCM как
 * дополнительные аутентифицированные данные (AAD): если кто-то изменит
 * версию, число итераций, соль или IV, проверка Auth-Tag не пройдёт.
 */
export function headerAad(header: DecodedPackage['header']): Uint8Array<ArrayBuffer> {
  const canonical = JSON.stringify([
    header.v,
    header.kdf.alg,
    header.kdf.iterations,
    header.kdf.salt,
    header.cipher.alg,
    header.cipher.iv,
  ]);
  return utf8Encode(canonical);
}

function invalid(reason: string): never {
  throw new CryptoError('INVALID_PACKAGE', `Данные заметки повреждены: ${reason}.`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function bytes(field: unknown, name: string): Uint8Array<ArrayBuffer> {
  if (typeof field !== 'string') invalid(`поле ${name} отсутствует`);
  return fromBase64Url(field) as Uint8Array<ArrayBuffer>;
}

/** Строгая проверка структуры. Принимает уже разобранный JSON-объект. */
export function decodePackage(input: unknown): DecodedPackage {
  if (!isRecord(input)) invalid('ожидается объект');
  if (input.v !== FORMAT_VERSION) invalid(`неизвестная версия формата ${String(input.v)}`);
  const { kdf, cipher } = input;
  if (!isRecord(kdf) || kdf.alg !== KDF_ALGORITHM) invalid('неизвестный алгоритм деривации ключа');
  if (!isRecord(cipher) || cipher.alg !== CIPHER_ALGORITHM) invalid('неизвестный алгоритм шифрования');
  if (typeof kdf.iterations !== 'number') invalid('нет числа итераций');
  checkIterations(kdf.iterations);

  const salt = bytes(kdf.salt, 'kdf.salt');
  const iv = bytes(cipher.iv, 'cipher.iv');
  const ciphertext = bytes(input.ciphertext, 'ciphertext');
  if (salt.length !== SALT_BYTES) invalid(`длина соли ${salt.length} байт вместо ${SALT_BYTES}`);
  if (iv.length !== IV_BYTES) invalid(`длина IV ${iv.length} байт вместо ${IV_BYTES}`);
  if (ciphertext.length < TAG_BYTES) invalid('шифротекст короче тега аутентификации');

  return {
    header: {
      v: FORMAT_VERSION,
      kdf: { alg: KDF_ALGORITHM, iterations: kdf.iterations, salt: kdf.salt as string },
      cipher: { alg: CIPHER_ALGORITHM, iv: cipher.iv as string },
    },
    salt,
    iv,
    ciphertext,
  };
}

export function serializePackage(pkg: EncryptedPackage): string {
  return JSON.stringify(pkg);
}

export function parsePackage(json: string): EncryptedPackage {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (cause) {
    throw new CryptoError('INVALID_PACKAGE', 'Данные заметки повреждены: это не JSON.', { cause });
  }
  const d = decodePackage(data);
  return { ...d.header, ciphertext: toBase64Url(d.ciphertext) };
}
