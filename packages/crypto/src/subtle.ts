import { CryptoError } from './errors.js';

/**
 * Доступ к Web Crypto API. Если его нет (старый браузер или страница не по HTTPS),
 * выбрасывается UNSUPPORTED — и ничего не отправляется на сервер (US-01, шаг 4).
 */
export function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle || typeof c.getRandomValues !== 'function') {
    throw new CryptoError('UNSUPPORTED');
  }
  return c;
}

export function getSubtle(): SubtleCrypto {
  return getCrypto().subtle;
}

export function isSupported(): boolean {
  try {
    getCrypto();
    return true;
  } catch {
    return false;
  }
}

/** Криптостойкие случайные байты (CSPRNG). */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  getCrypto().getRandomValues(out);
  return out;
}
