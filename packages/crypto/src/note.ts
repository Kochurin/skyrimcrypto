import {
  CIPHER_ALGORITHM,
  DEFAULT_ITERATIONS,
  FORMAT_VERSION,
  IV_BYTES,
  KDF_ALGORITHM,
  MAX_PLAINTEXT_BYTES,
  SALT_BYTES,
  TAG_BITS,
} from './constants.js';
import { toBase64Url, utf8Decode, utf8Encode } from './encoding.js';
import { CryptoError } from './errors.js';
import { deriveKey, validateNewPassword } from './kdf.js';
import { decodePackage, headerAad, type EncryptedPackage } from './package.js';
import { getSubtle, randomBytes } from './subtle.js';

/**
 * Интерфейс ICrypto из ЛР7: encryptNote (процесс P2) и decryptNote (процесс P4).
 */

export interface EncryptOptions {
  /** Число итераций PBKDF2. По умолчанию DEFAULT_ITERATIONS. */
  iterations?: number;
}

/** FR-04. Шифрование заметки в браузере. */
export async function encryptNote(plaintext: string, password: string, options: EncryptOptions = {}): Promise<EncryptedPackage> {
  validateNewPassword(password);
  const data = utf8Encode(plaintext);
  if (data.length > MAX_PLAINTEXT_BYTES) {
    throw new CryptoError('TOO_LARGE', `Заметка больше ${MAX_PLAINTEXT_BYTES / 1024 / 1024} МБ.`);
  }

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = randomBytes(SALT_BYTES); // новая соль на каждое сохранение
  const iv = randomBytes(IV_BYTES); // новый IV на каждое шифрование
  const key = await deriveKey(password, salt, iterations);

  const header = {
    v: FORMAT_VERSION,
    kdf: { alg: KDF_ALGORITHM, iterations, salt: toBase64Url(salt) },
    cipher: { alg: CIPHER_ALGORITHM, iv: toBase64Url(iv) },
  } as const;

  let encrypted: ArrayBuffer;
  try {
    encrypted = await getSubtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: headerAad(header), tagLength: TAG_BITS },
      key,
      data,
    );
  } catch (cause) {
    throw new CryptoError('UNSUPPORTED', 'Сбой шифрования в браузере.', { cause });
  } finally {
    data.fill(0); // затираем копию открытого текста в байтах
  }

  return { ...header, ciphertext: toBase64Url(new Uint8Array(encrypted)) };
}

/** FR-08. Расшифровка и проверка целостности (Auth-Tag). */
export async function decryptNote(pkg: unknown, password: string): Promise<string> {
  const decoded = decodePackage(pkg);
  const key = await deriveKey(password, decoded.salt, decoded.header.kdf.iterations);

  let plain: ArrayBuffer;
  try {
    plain = await getSubtle().decrypt(
      { name: 'AES-GCM', iv: decoded.iv, additionalData: headerAad(decoded.header), tagLength: TAG_BITS },
      key,
      decoded.ciphertext,
    );
  } catch (cause) {
    // GCM не различает «неверный пароль» и «подмену данных» — и не должен.
    throw new CryptoError('DECRYPT_FAILED', undefined, { cause });
  }

  const bytes = new Uint8Array(plain);
  try {
    return utf8Decode(bytes);
  } catch (cause) {
    throw new CryptoError('INVALID_PACKAGE', 'Расшифрованные данные не являются текстом.', { cause });
  } finally {
    bytes.fill(0);
  }
}
