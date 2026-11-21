/**
 * @cn/crypto — K1.2 Криптомодуль Crypto Notepad (ЛР7).
 * Реализует интерфейс ICrypto: deriveKey, encryptNote, decryptNote.
 * Работает только в браузере пользователя; на сервер уходит лишь EncryptedPackage.
 */
export * from './constants.js';
export { CryptoError, isCryptoError, type CryptoErrorCode } from './errors.js';
export { isSupported } from './subtle.js';
export { deriveKey, validateNewPassword } from './kdf.js';
export { encryptNote, decryptNote, type EncryptOptions } from './note.js';
export {
  serializePackage,
  parsePackage,
  decodePackage,
  type EncryptedPackage,
  type DecodedPackage,
} from './package.js';
export { toBase64Url, fromBase64Url } from './encoding.js';
