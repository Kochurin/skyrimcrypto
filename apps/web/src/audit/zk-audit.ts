import {
  CIPHER_ALGORITHM,
  DEFAULT_ITERATIONS,
  IV_BYTES,
  KDF_ALGORITHM,
  MIN_ITERATIONS,
  SALT_BYTES,
  decryptNote,
  deriveKey,
  encryptNote,
  fromBase64Url,
  isCryptoError,
  isSupported,
  type EncryptedPackage,
} from '@cn/crypto';
import { createNote, deleteNote, fetchNote, type AuditCheck, type CreatedNote } from '../api.js';

/**
 * FR-14 «Аудит Zero-Knowledge», US-03 — выполняется в браузере аудитора.
 * Только здесь можно увидеть, что реально уходит в сеть до шифрования: аудит перехватывает
 * исходящие запросы (fetch) на время сохранения контрольной заметки и ищет в них пароль и текст.
 * Плюс проверки параметров криптомодуля (NFR-09), уникальности (соль, IV), неэкспортируемости ключа
 * и обнаружения подмены (Auth-Tag GCM).
 */

export interface AuditStep {
  id: string;
  name: string;
}

export const STEPS: AuditStep[] = [
  { id: 'webcrypto', name: 'Браузер шифрует сам (Web Crypto API)' },
  { id: 'params', name: 'Параметры: PBKDF2 ≥ 100 000, соль 16 байт, IV 12 байт, AES-256-GCM' },
  { id: 'key', name: 'Ключ неэкспортируемый — достать его из браузера нельзя' },
  { id: 'unique', name: 'Пары (соль, IV) не повторяются' },
  { id: 'traffic', name: 'В сеть не уходят ни пароль, ни текст' },
  { id: 'server', name: 'Сервер хранит ровно то, что отправлено' },
  { id: 'roundtrip', name: 'Верный пароль расшифровывает' },
  { id: 'wrong', name: 'Неверный пароль — отказ' },
  { id: 'tamper', name: 'Подмена байта шифротекста обнаруживается' },
  { id: 'header', name: 'Подмена заголовка пакета обнаруживается' },
];

export interface AuditDeps {
  /** Как сохранить заметку. В тесте сюда подставляется «сломанная» версия — аудит должен это поймать. */
  save?: (pkg: EncryptedPackage) => Promise<CreatedNote>;
  /** Сколько шифрований для проверки уникальности. */
  uniqueRuns?: number;
  /** Контрольные пароль и текст (по умолчанию — случайные на каждый запуск; тесты задают свои). */
  control?: { password: string; text: string };
  onStep?: (id: string, state: 'running' | AuditCheck) => void;
}

interface Captured {
  url: string;
  method: string;
  headers: string;
  body: string;
}

const randomString = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(36).padStart(2, '0')).join('');

function b64(s: string): string[] {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const std = btoa(bin);
  return [std, std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')];
}

/** Все формы, в которых секрет мог бы утечь: как есть, в URL-кодировке, в base64 / base64url. */
function leakForms(secret: string): string[] {
  return [secret, encodeURIComponent(secret), ...b64(secret)];
}

async function bodyText(body: BodyInit | null | undefined): Promise<string> {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Blob) return body.text();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new TextDecoder().decode(body as ArrayBuffer);
  if (body instanceof URLSearchParams) return body.toString();
  return String(body);
}

/** Перехват всех запросов fetch на время fn (что ушло бы в сеть). */
async function captureTraffic<T>(fn: () => Promise<T>): Promise<{ result: T; requests: Captured[] }> {
  const original = globalThis.fetch;
  const requests: Captured[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? req?.headers);
    const headerText = [...headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    requests.push({
      url: String(req?.url ?? input),
      method: init?.method ?? req?.method ?? 'GET',
      headers: headerText,
      body: await bodyText(init?.body ?? null),
    });
    return original(input, init);
  };
  try {
    return { result: await fn(), requests };
  } finally {
    globalThis.fetch = original;
  }
}

async function expectDecryptFailure(pkg: unknown, password: string): Promise<string | null> {
  try {
    await decryptNote(pkg, password);
    return 'расшифровалось — подмена не обнаружена!';
  } catch (e) {
    if (isCryptoError(e, 'DECRYPT_FAILED') || isCryptoError(e, 'INVALID_PACKAGE')) return null;
    return `неожиданная ошибка: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function runZkAudit(deps: AuditDeps = {}): Promise<{ checks: AuditCheck[]; durationMs: number }> {
  const started = performance.now();
  const checks: AuditCheck[] = [];
  const save = deps.save ?? ((pkg: EncryptedPackage) => createNote(pkg, 1));
  // Контрольная заметка: случайные текст и пароль на каждый запуск
  const password = deps.control?.password ?? `audit-${randomString(12)}`;
  const text = deps.control?.text ?? `Контрольная заметка аудита ZK ${randomString(8)}`;
  let pkg: EncryptedPackage | null = null;
  let saved: CreatedNote | null = null;
  let fromServer: unknown = null;

  async function step(id: string, run: () => Promise<string | null>) {
    deps.onStep?.(id, 'running');
    const name = STEPS.find((s) => s.id === id)?.name ?? id;
    let check: AuditCheck;
    try {
      const problem = await run();
      check = { id, name, passed: problem === null, detail: problem ?? 'пройдено' };
    } catch (e) {
      check = { id, name, passed: false, detail: e instanceof Error ? e.message : String(e) };
    }
    checks.push(check);
    deps.onStep?.(id, check);
  }

  await step('webcrypto', async () => (isSupported() ? null : 'Web Crypto API недоступен'));

  await step('params', async () => {
    pkg = await encryptNote(text, password);
    const p = pkg;
    const problems: string[] = [];
    if (p.kdf.alg !== KDF_ALGORITHM) problems.push(`KDF ${p.kdf.alg}`);
    if (p.cipher.alg !== CIPHER_ALGORITHM) problems.push(`шифр ${p.cipher.alg}`);
    if (p.kdf.iterations < MIN_ITERATIONS) problems.push(`итераций ${p.kdf.iterations} < ${MIN_ITERATIONS}`);
    if (fromBase64Url(p.kdf.salt).length !== SALT_BYTES) problems.push('длина соли');
    if (fromBase64Url(p.cipher.iv).length !== IV_BYTES) problems.push('длина IV');
    return problems.length ? problems.join('; ') : null;
  });
  const iterationsNote = pkg ? `итераций: ${(pkg as EncryptedPackage).kdf.iterations.toLocaleString('ru-RU')}` : '';
  if (checks.at(-1)?.passed && iterationsNote) checks.at(-1)!.detail = `${iterationsNote} (по умолчанию ${DEFAULT_ITERATIONS.toLocaleString('ru-RU')})`;

  await step('key', async () => {
    const key = await deriveKey(password, crypto.getRandomValues(new Uint8Array(SALT_BYTES)), MIN_ITERATIONS);
    if (key.extractable) return 'ключ помечен как экспортируемый';
    try {
      await crypto.subtle.exportKey('raw', key);
      return 'exportKey вернул ключ!';
    } catch {
      return null;
    }
  });

  await step('unique', async () => {
    const runs = deps.uniqueRuns ?? 40;
    const pairs = new Set<string>();
    const ivs = new Set<string>();
    for (let i = 0; i < runs; i++) {
      const p = await encryptNote('u', password, { iterations: MIN_ITERATIONS });
      pairs.add(`${p.kdf.salt}:${p.cipher.iv}`);
      ivs.add(p.cipher.iv);
    }
    return pairs.size === runs && ivs.size === runs ? null : `повторы среди ${runs} шифрований`;
  });

  await step('traffic', async () => {
    if (!pkg) return 'нет пакета';
    const { result, requests } = await captureTraffic(() => save(pkg!));
    saved = result;
    if (requests.length === 0) return 'запросов не было — нечего проверять';
    const haystack = requests.map((r) => `${r.url}\n${r.headers}\n${r.body}`).join('\n');
    const leaks = [
      ...leakForms(password).filter((f) => haystack.includes(f)).map(() => 'пароль'),
      ...leakForms(text).filter((f) => haystack.includes(f)).map(() => 'текст заметки'),
    ];
    return leaks.length ? `найдено в исходящих запросах: ${[...new Set(leaks)].join(', ')}` : null;
  });

  await step('server', async () => {
    if (!saved || !pkg) return 'заметка не сохранена';
    fromServer = await fetchNote((saved as CreatedNote).id);
    return JSON.stringify(fromServer) === JSON.stringify(pkg) ? null : 'пакет с сервера отличается от отправленного';
  });

  await step('roundtrip', async () => {
    if (!fromServer) return 'нет пакета с сервера';
    return (await decryptNote(fromServer, password)) === text ? null : 'расшифрованный текст не совпал';
  });

  await step('wrong', async () => (fromServer ? expectDecryptFailure(fromServer, `${password}x`) : 'нет пакета'));

  await step('tamper', async () => {
    if (!pkg) return 'нет пакета';
    const p = pkg as EncryptedPackage;
    const bytes = fromBase64Url(p.ciphertext);
    bytes[Math.floor(bytes.length / 2)]! ^= 0x01;
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const ciphertext = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return expectDecryptFailure({ ...p, ciphertext }, password);
  });

  await step('header', async () => {
    if (!pkg) return 'нет пакета';
    const p = pkg as EncryptedPackage;
    // IV из другого шифрования того же пароля: структура верна, но тег не сойдётся
    const other = await encryptNote('другое', password, { iterations: MIN_ITERATIONS });
    return expectDecryptFailure({ ...p, cipher: { ...p.cipher, iv: other.cipher.iv } }, password);
  });

  // Уборка: контрольную заметку удаляем, если она привязана к учётной записи
  if (saved && (saved as CreatedNote).owned) await deleteNote((saved as CreatedNote).id).catch(() => undefined);

  return { checks, durationMs: Math.round(performance.now() - started) };
}
