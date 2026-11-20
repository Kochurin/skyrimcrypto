/**
 * Коды ошибок криптомодуля. Каждый соответствует исключению из сценариев ЛР6.
 */
export type CryptoErrorCode =
  /** Браузер не поддерживает Web Crypto API (US-01, шаг 4). */
  | 'UNSUPPORTED'
  /** Пароль короче минимума (US-01, шаг 3). */
  | 'WEAK_PASSWORD'
  /** Текст больше 10 МБ (US-01, шаг 2). */
  | 'TOO_LARGE'
  /** Пакет повреждён структурно: не тот формат, длины, кодировка. */
  | 'INVALID_PACKAGE'
  /** Неверный пароль или подмена данных: проверка Auth-Tag не прошла (US-02, шаг 4). */
  | 'DECRYPT_FAILED';

const MESSAGES: Record<CryptoErrorCode, string> = {
  UNSUPPORTED: 'Браузер не поддерживает шифрование (Web Crypto API). Обновите браузер или откройте сайт по HTTPS.',
  WEAK_PASSWORD: 'Пароль слишком короткий.',
  TOO_LARGE: 'Заметка слишком большая.',
  INVALID_PACKAGE: 'Данные заметки повреждены.',
  DECRYPT_FAILED: 'Неверный пароль или повреждённые данные.',
};

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string = MESSAGES[code], options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CryptoError';
    this.code = code;
  }
}

export function isCryptoError(e: unknown, code?: CryptoErrorCode): e is CryptoError {
  return e instanceof CryptoError && (code === undefined || e.code === code);
}
