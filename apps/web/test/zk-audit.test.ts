import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedPackage } from '@cn/crypto';
import { createNote } from '../src/api.js';
import { runZkAudit, STEPS } from '../src/audit/zk-audit.js';

/**
 * FR-14: «Функциональный: внедрённая ошибка (отправка пароля в заголовке) обнаруживается аудитом».
 * Сервер — fetch-заглушка, которая хранит пакеты как настоящий API.
 */
let stored: Map<string, string>;
let tamperServer = false;

beforeEach(() => {
  stored = new Map();
  tamperServer = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        const id = crypto.randomUUID();
        stored.set(id, String(init.body));
        return new Response(JSON.stringify({ id, expiresAt: new Date().toISOString(), owned: false }), { status: 201 });
      }
      const id = url.split('/').pop()!;
      let body = stored.get(id);
      if (!body) return new Response('{}', { status: 404 });
      if (tamperServer) {
        const pkg = JSON.parse(body) as EncryptedPackage;
        body = JSON.stringify({ ...pkg, kdf: { ...pkg.kdf, iterations: pkg.kdf.iterations + 1 } });
      }
      return new Response(body, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Аудит Zero-Knowledge (FR-14)', () => {
  it('честный клиент и сервер — все проверки пройдены', async () => {
    const steps: string[] = [];
    const { checks } = await runZkAudit({ uniqueRuns: 10, onStep: (id, s) => s === 'running' && steps.push(id) });
    expect(checks.map((c) => c.id)).toEqual(STEPS.map((s) => s.id));
    expect(checks.filter((c) => !c.passed)).toEqual([]);
    expect(steps).toEqual(STEPS.map((s) => s.id)); // прогресс сообщается по каждой проверке
  }, 30_000);

  const control = { password: 'audit-known-password-1', text: 'Контрольный текст аудита 42' };

  it('внедрённая ошибка: пароль уходит в заголовке — аудит это ловит', async () => {
    const { checks } = await runZkAudit({
      uniqueRuns: 5,
      control,
      // «Сломанный» клиент добавляет отладочный заголовок с паролем — типичная ошибка, ради которой нужен аудит
      save: (pkg) => {
        const original = globalThis.fetch;
        return original('/api/notes?ttl=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Password': control.password },
          body: JSON.stringify(pkg),
        }).then((r) => r.json());
      },
    });
    const traffic = checks.find((c) => c.id === 'traffic')!;
    expect(traffic.passed).toBe(false);
    expect(traffic.detail).toMatch(/пароль/);
  }, 30_000);

  it('внедрённая ошибка: открытый текст уходит вместе с пакетом (даже в base64) — аудит это ловит', async () => {
    const { checks } = await runZkAudit({
      uniqueRuns: 5,
      control,
      save: (pkg) =>
        createNote({ ...pkg, debug: btoa(unescape(encodeURIComponent(control.text))) } as unknown as EncryptedPackage),
    });
    const traffic = checks.find((c) => c.id === 'traffic')!;
    expect(traffic.passed).toBe(false);
    expect(traffic.detail).toMatch(/текст/);
  }, 30_000);

  it('подменённый на сервере заголовок — проверка «сервер хранит то, что отправлено» не пройдена', async () => {
    tamperServer = true;
    const { checks } = await runZkAudit({ uniqueRuns: 5 });
    expect(checks.find((c) => c.id === 'server')?.passed).toBe(false);
    expect(checks.find((c) => c.id === 'roundtrip')?.passed).toBe(false);
  }, 30_000);
});
