/**
 * Криптопараметры (контроль C1 из ЛР5, NFR-09 из ЛР6).
 * Меняются только вместе с номером версии формата пакета.
 */

/** Текущая версия формата зашифрованного пакета. */
export const FORMAT_VERSION = 1 as const;

export const KDF_ALGORITHM = 'PBKDF2-SHA256' as const;
export const CIPHER_ALGORITHM = 'AES-256-GCM' as const;

/** Число итераций PBKDF2 для новых заметок. */
export const DEFAULT_ITERATIONS = 600_000;
/** Нижняя граница из требований: меньше — пакет отклоняется. */
export const MIN_ITERATIONS = 100_000;
/** Верхняя граница: защищает читателя от пакета, который «повесит» браузер. */
export const MAX_ITERATIONS = 10_000_000;

export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BITS = 256;
export const TAG_BITS = 128;
export const TAG_BYTES = TAG_BITS / 8;

/** Минимальная длина мастер-пароля (FR-03). */
export const MIN_PASSWORD_LENGTH = 8;

/** Максимальный размер открытого текста заметки — 10 МБ (контроль C3, FR-02). */
export const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
