import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PLAINTEXT_BYTES,
  decryptNote,
  encryptNote,
  isCryptoError,
  isSupported,
  parsePackage,
  serializePackage,
  type CryptoErrorCode,
  type EncryptedPackage,
} from '../src/index.js';
import { fromBase64Url, toBase64Url } from '../src/encoding.js';
import { randomBytes } from '../src/subtle.js';
import { containsBytes, utf8 } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const FAST = { iterations: 100_000 }; // минимально допустимое — чтобы тесты шли быстро

async function expectCode(p: Promise<unknown>, code: CryptoErrorCode) {
  try {
    await p;
  } catch (e) {
    expect(isCryptoError(e, code), `ожидался ${code}, получено ${String(e)}`).toBe(true);
    return;
  }
  expect.unreachable(`ожидалась ошибка ${code}`);
}

function flipByte(b64: string, index: number): string {
  const bytes = fromBase64Url(b64);
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return toBase64Url(bytes);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('US-01 / US-02: полный цикл', () => {
  it('зашифровать → сериализовать → разобрать → расшифровать', async () => {
    const text = 'Секретная заметка 🔐\nстрока 2 — «кавычки», 中文, emoji 👍🏽';
    const pkg = await encryptNote(text, PASSWORD, FAST);
    const wire = serializePackage(pkg); // это уходит на сервер
    const back = parsePackage(wire); // это приходит читателю
    expect(await decryptNote(back, PASSWORD)).toBe(text);
  });

  it('пустая заметка тоже шифруется и расшифровывается', async () => {
    const pkg = await encryptNote('', PASSWORD, FAST);
    expect(await decryptNote(pkg, PASSWORD)).toBe('');
  });

  it('по умолчанию используется 600 000 итераций и правильный формат', async () => {
    const pkg = await encryptNote('x', PASSWORD);
    expect(pkg.v).toBe(1);
    expect(pkg.kdf).toMatchObject({ alg: 'PBKDF2-SHA256', iterations: 600_000 });
    expect(pkg.cipher.alg).toBe('AES-256-GCM');
    expect(fromBase64Url(pkg.kdf.salt)).toHaveLength(16);
    expect(fromBase64Url(pkg.cipher.iv)).toHaveLength(12);
    expect(fromBase64Url(pkg.ciphertext)).toHaveLength(1 + 16); // 1 байт текста + тег 16 байт
  });
});

describe('Zero-Knowledge: что уходит на сервер (NFR-08)', () => {
  it('в пакете нет ни пароля, ни фрагментов открытого текста', async () => {
    const secret = 'номер карты 4111 и код от сейфа 1234';
    const pkg = await encryptNote(secret, PASSWORD, FAST);
    const wire = serializePackage(pkg);
    expect(wire).not.toContain(PASSWORD);
    expect(wire).not.toContain('сейф');
    expect(containsBytes(fromBase64Url(pkg.ciphertext), utf8('сейф'))).toBe(false);
    expect(containsBytes(utf8(wire), utf8(PASSWORD))).toBe(false);
  });

  it('один и тот же текст с тем же паролем шифруется каждый раз по-разному', async () => {
    const a = await encryptNote('одинаковый текст', PASSWORD, FAST);
    const b = await encryptNote('одинаковый текст', PASSWORD, FAST);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe('Уникальность соли и IV (NFR-09)', () => {
  it('10 000 сгенерированных IV — все разные', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(toBase64Url(randomBytes(12)));
    expect(seen.size).toBe(10_000);
  });

  it('IV и соль в 20 подряд зашифрованных заметках не повторяются', async () => {
    const ivs = new Set<string>();
    const salts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pkg = await encryptNote(`заметка ${i}`, PASSWORD, FAST);
      ivs.add(pkg.cipher.iv);
      salts.add(pkg.kdf.salt);
    }
    expect(ivs.size).toBe(20);
    expect(salts.size).toBe(20);
  });
});

describe('Исключения из сценариев ЛР6', () => {
  it('US-02, шаг 4: неверный пароль → DECRYPT_FAILED', async () => {
    const pkg = await encryptNote('текст', PASSWORD, FAST);
    await expectCode(decryptNote(pkg, 'wrong password!'), 'DECRYPT_FAILED');
  });

  it('US-02, шаг 4: изменён один байт шифротекста → DECRYPT_FAILED', async () => {
    const pkg = await encryptNote('текст', PASSWORD, FAST);
    for (const index of [0, 3, fromBase64Url(pkg.ciphertext).length - 1]) {
      const tampered: EncryptedPackage = { ...pkg, ciphertext: flipByte(pkg.ciphertext, index) };
      await expectCode(decryptNote(tampered, PASSWORD), 'DECRYPT_FAILED');
    }
  });

  it('подмена заголовка (итерации, соль, IV) ловится через AAD → DECRYPT_FAILED', async () => {
    const pkg = await encryptNote('текст', PASSWORD, FAST);
    await expectCode(decryptNote({ ...pkg, kdf: { ...pkg.kdf, iterations: 100_001 } }, PASSWORD), 'DECRYPT_FAILED');
    await expectCode(decryptNote({ ...pkg, kdf: { ...pkg.kdf, salt: flipByte(pkg.kdf.salt, 0) } }, PASSWORD), 'DECRYPT_FAILED');
    await expectCode(decryptNote({ ...pkg, cipher: { ...pkg.cipher, iv: flipByte(pkg.cipher.iv, 5) } }, PASSWORD), 'DECRYPT_FAILED');
  });

  it('US-01, шаг 3: пароль короче 8 символов → WEAK_PASSWORD', async () => {
    await expectCode(encryptNote('текст', 'short', FAST), 'WEAK_PASSWORD');
  });

  it('US-01, шаг 2: текст больше 10 МБ → TOO_LARGE, ровно 10 МБ — можно', async () => {
    await expectCode(encryptNote('a'.repeat(MAX_PLAINTEXT_BYTES + 1), PASSWORD, FAST), 'TOO_LARGE');
    const pkg = await encryptNote('a'.repeat(MAX_PLAINTEXT_BYTES), PASSWORD, FAST);
    expect(fromBase64Url(pkg.ciphertext)).toHaveLength(MAX_PLAINTEXT_BYTES + 16);
  });

  it('US-01, шаг 4: браузер без Web Crypto API → UNSUPPORTED, ничего не шифруется', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(isSupported()).toBe(false);
    await expectCode(encryptNote('текст', PASSWORD, FAST), 'UNSUPPORTED');
  });
});

describe('Разбор пакета: повреждённые данные → INVALID_PACKAGE', () => {
  const cases: [string, (pkg: EncryptedPackage) => unknown][] = [
    ['неизвестная версия', (p) => ({ ...p, v: 2 })],
    ['другой алгоритм', (p) => ({ ...p, cipher: { ...p.cipher, alg: 'AES-128-CBC' } })],
    ['IV 11 байт', (p) => ({ ...p, cipher: { ...p.cipher, iv: toBase64Url(new Uint8Array(11)) } })],
    ['соль 15 байт', (p) => ({ ...p, kdf: { ...p.kdf, salt: toBase64Url(new Uint8Array(15)) } })],
    ['мало итераций', (p) => ({ ...p, kdf: { ...p.kdf, iterations: 1000 } })],
    ['слишком много итераций (DoS)', (p) => ({ ...p, kdf: { ...p.kdf, iterations: 1e9 } })],
    ['недопустимые символы base64url', (p) => ({ ...p, ciphertext: 'abc$%' })],
    ['шифротекст короче тега', (p) => ({ ...p, ciphertext: toBase64Url(new Uint8Array(10)) })],
    ['не объект', () => 'строка'],
    ['null', () => null],
  ];

  it.each(cases)('%s', async (_name, mutate) => {
    const pkg = await encryptNote('текст', PASSWORD, FAST);
    await expectCode(decryptNote(mutate(pkg), PASSWORD), 'INVALID_PACKAGE');
  });

  it('parsePackage: не JSON', () => {
    expect(() => parsePackage('{oops')).toThrow(/не JSON/);
  });
});

describe('NFR-01: производительность', () => {
  it('шифрование заметки 1 МБ (PBKDF2 + AES-GCM) укладывается в 1 секунду', async () => {
    const text = 'я'.repeat(512 * 1024); // 1 МБ в UTF-8
    const t0 = performance.now();
    const pkg = await encryptNote(text, PASSWORD);
    const encMs = performance.now() - t0;
    const t1 = performance.now();
    await decryptNote(pkg, PASSWORD);
    const decMs = performance.now() - t1;
    console.info(`600 000 итераций: шифрование 1 МБ ${encMs.toFixed(0)} мс, расшифровка ${decMs.toFixed(0)} мс`);
    expect(encMs).toBeLessThan(1000);
    expect(decMs).toBeLessThan(1000);
  });
});
