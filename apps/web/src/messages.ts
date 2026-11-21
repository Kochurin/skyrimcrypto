import { isCryptoError, MIN_PASSWORD_LENGTH } from '@cn/crypto';
import { ApiFailure } from './api.js';

/** Понятное пользователю сообщение для любой ошибки сценариев US-01 и US-02. */
export function errorMessage(e: unknown): string {
  if (isCryptoError(e)) {
    switch (e.code) {
      case 'UNSUPPORTED':
        return 'Браузер не умеет шифровать (нет Web Crypto API). Ничего не отправлено, текст остался в редакторе. Обновите браузер или откройте сайт по HTTPS.';
      case 'WEAK_PASSWORD':
        return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`;
      case 'TOO_LARGE':
        return 'Заметка больше 10 МБ. Сократите текст.';
      case 'INVALID_PACKAGE':
        return 'Данные заметки повреждены, расшифровать их нельзя.';
      case 'DECRYPT_FAILED':
        return 'Неверный пароль, или заметка была изменена. Проверьте пароль и попробуйте ещё раз.';
    }
  }
  if (e instanceof ApiFailure) {
    switch (e.code) {
      case 'NETWORK':
        return 'Нет связи с сервером. Текст остался в редакторе — попробуйте ещё раз.';
      case 'TOO_LARGE':
        return 'Сервер не принял заметку: она больше 10 МБ.';
      case 'UNAUTHORIZED':
        return 'Сессия истекла. Войдите в учётную запись ещё раз.';
      case 'REJECTED':
        return e.message || 'Сервер отклонил запрос.';
      case 'SERVER':
        return 'Ошибка на сервере. Попробуйте позже.';
    }
  }
  return 'Непредвиденная ошибка. Попробуйте ещё раз.';
}
