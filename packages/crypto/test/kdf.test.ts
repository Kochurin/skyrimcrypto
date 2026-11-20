import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkIterations, deriveKey, pbkdf2Bits, validateNewPassword } from '../src/kdf.js';
import { isCryptoError } from '../src/errors.js';
import { hex, toHex, utf8 } from './helpers.js';

describe('FR-03: PBKDF2-HMAC-SHA-256', () => {
  // Эталонные векторы PBKDF2-HMAC-SHA-256 из RFC 7914, раздел 11.
  it('RFC 7914, вектор 1: P="passwd", S="salt", c=1', async () => {
    const out = await pbkdf2Bits('passwd', utf8('salt'), 1, 64);
    expect(toHex(out)).toBe(
      toHex(
        hex(`55 ac 04 6e 56 e3 08 9f ec 16 91 c2 25 44 b6 05
             f9 41 85 21 6d de 04 65 e6 8b 9d 57 c2 0d ac bc
             49 ca 9c cc f1 79 b6 45 99 16 64 b3 9d 77 ef 31
             7c 71 b8 45 b1 e3 0b d5 09 11 20 41 d3 a1 97 83`),
      ),
    );
  });

  it('RFC 7914, вектор 2: P="Password", S="NaCl", c=80000', async () => {
    const out = await pbkdf2Bits('Password', utf8('NaCl'), 80_000, 64);
    expect(toHex(out)).toBe(
      toHex(
        hex(`4d dc d8 f6 0b 98 be 21 83 0c ee 5e f2 27 01 f9
             64 1a 44 18 d0 4c 04 14 ae ff 08 87 6b 34 ab 56
             a1 d4 25 a1 22 58 33 54 9a db 84 1b 51 c9 b3 17
             6a 27 2b de bb a1 d0 78 47 8f 62 b3 97 f3 3c 8d`),
      ),
    );
  });

  it('совпадает с независимой реализацией node:crypto на случайных данных', async () => {
    for (let i = 0; i < 5; i++) {
      const password = toHex(randomBytes(12)) + 'пароль';
      const salt = new Uint8Array(randomBytes(16));
      const ours = await pbkdf2Bits(password, salt, 1000, 32);
      const ref = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, 1000, 32, 'sha256');
      expect(toHex(ours)).toBe(ref.toString('hex'));
    }
  });

  it('ключ неэкспортируемый: байты ключа прочитать нельзя', async () => {
    const key = await deriveKey('correct horse battery', new Uint8Array(16), 100_000);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('одинаковые пароль и соль дают одинаковый ключ, разные соли — разные', async () => {
    const salt1 = new Uint8Array(16).fill(1);
    const salt2 = new Uint8Array(16).fill(2);
    const a = await pbkdf2Bits('пароль-123', salt1, 100_000, 32);
    const b = await pbkdf2Bits('пароль-123', salt1, 100_000, 32);
    const c = await pbkdf2Bits('пароль-123', salt2, 100_000, 32);
    expect(toHex(a)).toBe(toHex(b));
    expect(toHex(a)).not.toBe(toHex(c));
  });

  it('пароль нормализуется в NFC: «й» одним и двумя символами — один ключ', async () => {
    const salt = new Uint8Array(16);
    const composed = 'мой-пароль-й';
    const decomposed = 'мой-пароль-й';
    expect(composed).not.toBe(decomposed);
    const a = await pbkdf2Bits(composed, salt, 1000, 32);
    const b = await pbkdf2Bits(decomposed, salt, 1000, 32);
    expect(toHex(a)).toBe(toHex(b));
  });
});

describe('Ограничения', () => {
  it('число итераций: меньше 100 000 и больше 10 000 000 отклоняется', () => {
    expect(() => checkIterations(99_999)).toThrow();
    expect(() => checkIterations(10_000_001)).toThrow();
    expect(() => checkIterations(150_000.5)).toThrow();
    expect(() => checkIterations(100_000)).not.toThrow();
  });

  it('пароль короче 8 символов отклоняется (US-01, шаг 3)', () => {
    try {
      validateNewPassword('1234567');
      expect.unreachable();
    } catch (e) {
      expect(isCryptoError(e, 'WEAK_PASSWORD')).toBe(true);
    }
    expect(() => validateNewPassword('12345678')).not.toThrow();
    // длина считается в символах, а не в UTF-16: 4 эмодзи — это 4 символа
    expect(() => validateNewPassword('🔑🔑🔑🔑')).toThrow();
  });
});
