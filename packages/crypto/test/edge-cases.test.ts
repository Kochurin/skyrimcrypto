import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePackage, decryptNote, encryptNote, isCryptoError, type CryptoErrorCode } from '../src/index.js';

/**
 * NFR-13: покрытие криптомодуля ≥ 95%. Здесь — редкие ветки: сбои Web Crypto
 * и пакеты с полями неверного типа (что может прислать подменённый сервер).
 */
const PASSWORD = 'edge-case-password';
const FAST = { iterations: 100_000 };

async function expectCode(p: Promise<unknown>, code: CryptoErrorCode) {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isCryptoError(error, code), `ожидался ${code}, получено ${String(error)}`).toBe(true);
}

function expectInvalid(input: unknown) {
  let error: unknown = null;
  try {
    decodePackage(input);
  } catch (e) {
    error = e;
  }
  expect(isCryptoError(error, 'INVALID_PACKAGE')).toBe(true);
}

afterEach(() => vi.restoreAllMocks());

describe('Сбои Web Crypto', () => {
  it('ошибка шифрования в браузере → UNSUPPORTED', async () => {
    vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('сбой'));
    await expectCode(encryptNote('текст', PASSWORD, FAST), 'UNSUPPORTED');
  });

  it('расшифровано, но это не UTF-8 → INVALID_PACKAGE', async () => {
    const pkg = await encryptNote('текст', PASSWORD, FAST);
    vi.spyOn(crypto.subtle, 'decrypt').mockResolvedValueOnce(new Uint8Array([0xff, 0xfe, 0xfd]).buffer);
    await expectCode(decryptNote(pkg, PASSWORD), 'INVALID_PACKAGE');
  });
});

describe('Поля пакета неверного типа', async () => {
  const pkg = await encryptNote('текст', PASSWORD, FAST);

  it('kdf или cipher — не объект', () => {
    expectInvalid({ ...pkg, kdf: null });
    expectInvalid({ ...pkg, kdf: [] });
    expectInvalid({ ...pkg, cipher: 'AES-256-GCM' });
  });

  it('число итераций — не число', () => {
    expectInvalid({ ...pkg, kdf: { ...pkg.kdf, iterations: '600000' } });
  });

  it('соль, IV или шифротекст — не строка', () => {
    expectInvalid({ ...pkg, kdf: { ...pkg.kdf, salt: 42 } });
    expectInvalid({ ...pkg, cipher: { ...pkg.cipher, iv: undefined } });
    expectInvalid({ ...pkg, ciphertext: [1, 2, 3] });
  });
});
