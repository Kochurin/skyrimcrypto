import { describe, expect, it } from 'vitest';
import { encryptNote } from '@cn/crypto';
import { buildApp } from '../src/app.js';
import { AuthService } from '../src/auth.js';
import { NotesService } from '../src/notes.js';
import { maskDetails, SecurityLog } from '../src/security/audit.js';
import { DEFAULT_GUARD, SecurityGuard } from '../src/security/guard.js';
import { SlidingWindow } from '../src/security/limiter.js';
import { MemoryIpBlockStore, MemoryRevokedTokenStore, MemorySecurityEventStore } from '../src/security/memory.js';
import { MemoryBlobStore, MemoryMetadataStore, MemoryUserStore } from '../src/stores/memory.js';
import { register, sessionCookie, setup } from './helpers.js';

const MISSING = '/api/notes/00000000-0000-4000-8000-000000000000';
const ATTACKER = '203.0.113.7';

describe('Скользящее окно', () => {
  it('пропускает max событий за окно и освобождает место по мере старения', () => {
    const w = new SlidingWindow(1000, 3);
    expect([0, 100, 200].map((t) => w.hit('a', t).allowed)).toEqual([true, true, true]);
    const denied = w.hit('a', 300);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(700);
    expect(w.hit('b', 300).allowed).toBe(true); // другой ключ — свой счётчик
    expect(w.hit('a', 1001).allowed).toBe(true); // первое событие вышло из окна
  });
});

describe('NFR-11 / FR-12: ограничение частоты', () => {
  it('61-й запрос за минуту — 429 с Retry-After; через минуту снова можно', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app, audit, events } = setup({ now: () => now, guard: { perMinute: 60 } });
    for (let i = 0; i < 60; i++) {
      expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);
    }
    const limited = await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: 'RATE_LIMITED' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    // другой адрес не затронут, /api/health не ограничивается
    expect((await app.inject({ url: MISSING, remoteAddress: '198.51.100.1' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/health', remoteAddress: ATTACKER })).statusCode).toBe(200);

    now = new Date(now.getTime() + 61_000);
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);

    await audit.flush();
    expect(events.events.some((e) => e.type === 'rate.limited' && e.ip === ATTACKER && e.status === 429)).toBe(true);
  });

  it('вход и регистрация ограничены строже, чем остальные запросы', async () => {
    const { app } = setup({ guard: { perMinute: 1000, authPerMinute: 5 } });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'x', password: 'y' }, remoteAddress: ATTACKER })).statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);
  });
});

describe('FR-12: блокировка за перебор file_id', () => {
  it('больше 100 ответов 404 за 10 минут — адрес блокируется на 24 часа (403 на всё API)', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app, ipBlocks, audit, events } = setup({ now: () => now });
    for (let i = 0; i < 101; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });

    const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'a', password: 'b' }, remoteAddress: ATTACKER });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ error: 'BLOCKED' });
    expect(ipBlocks.blocks.get(ATTACKER)?.until.getTime()).toBe(now.getTime() + 24 * 3_600_000);
    expect((await app.inject({ url: MISSING, remoteAddress: '198.51.100.1' })).statusCode).toBe(404);

    now = new Date(now.getTime() + 24 * 3_600_000 + 1000);
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);

    await audit.flush();
    const ev = events.events.find((e) => e.type === 'ip.blocked');
    expect(ev).toMatchObject({ ip: ATTACKER });
    expect(String(ev?.details.reason)).toMatch(/404/);
  });

  it('100 ответов 404 — ещё не блокировка; растянутые во времени — тоже', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app } = setup({ now: () => now });
    for (let i = 0; i < 100; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    now = new Date(now.getTime() + 11 * 60_000); // окно сдвинулось
    for (let i = 0; i < 50; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);
  });

  it('адрес из белого списка не блокируется', async () => {
    const { app, ipBlocks } = setup({ guard: { allowlist: [ATTACKER], notFoundMax: 3 } });
    for (let i = 0; i < 10; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);
    expect(ipBlocks.blocks.size).toBe(0);
  });

  it('если правило не записалось в БД — блокировка не применяется', async () => {
    const { app, ipBlocks } = setup({ guard: { notFoundMax: 3 } });
    ipBlocks.failNext = 1;
    for (let i = 0; i < 4; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    expect((await app.inject({ url: MISSING, remoteAddress: ATTACKER })).statusCode).toBe(404);
  });

  it('блокировки переживают перезапуск сервера (загружаются из БД)', async () => {
    const ipBlocks = new MemoryIpBlockStore();
    await ipBlocks.upsert({ ip: ATTACKER, until: new Date(Date.now() + 3_600_000), reason: 'test', createdAt: new Date() });
    const audit = new SecurityLog(new MemorySecurityEventStore(), { error: () => {} });
    const guard = new SecurityGuard(ipBlocks, audit, DEFAULT_GUARD);
    await guard.init();
    expect(guard.isBlocked(ATTACKER)).toBe(true);
    expect(guard.isBlocked('198.51.100.1')).toBe(false);
  });
});

describe('FR-13: журнал событий без содержимого', () => {
  it('входы, сохранения и удаления пишутся; пароли, токены и шифротекст — нет', async () => {
    const { app, audit, events } = setup();
    const cookie = await register(app, 'alice', 'super-secret-pass');
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'alice', password: 'wrong-password-x' } });
    const pkg = await encryptNote('открытый текст заметки', 'note-password', { iterations: 100_000 });
    const created = await app.inject({ method: 'POST', url: '/api/notes?ttl=7', payload: pkg, headers: { cookie } });
    const { id } = created.json<{ id: string }>();
    await app.inject({ method: 'DELETE', url: `/api/notes/${id}`, headers: { cookie } });
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    await audit.flush();

    expect(events.events.map((e) => e.type)).toEqual(['auth.register', 'auth.login_failed', 'note.create', 'note.delete', 'auth.logout']);
    const create = events.events.find((e) => e.type === 'note.create')!;
    expect(create.details).toMatchObject({ noteId: id, ttlDays: 7 });
    expect(create.userId).toBeTruthy();
    expect(events.events.find((e) => e.type === 'auth.login_failed')?.details).toEqual({ login: 'alice', error: 'INVALID_CREDENTIALS' });

    const dump = JSON.stringify(events.events);
    for (const secret of ['super-secret-pass', 'wrong-password-x', 'note-password', pkg.ciphertext.slice(0, 20), pkg.kdf.salt, cookie.split('=')[1]!.slice(0, 20)]) {
      expect(dump).not.toContain(secret);
    }
  });

  it('маскирование: чужие ключи отбрасываются, похожее на секрет скрывается', () => {
    expect(
      maskDetails({ login: 'bob', password: 'p', body: '{...}', ciphertext: 'abc', reason: 'token=eyJhbGciOiJIUzI1NiJ9xxxx', noteId: 'x'.repeat(500) }),
    ).toEqual({ login: 'bob', reason: '[скрыто]', noteId: `${'x'.repeat(120)}…` });
  });

  it('если БД журнала недоступна — события ждут в буфере и записываются потом', async () => {
    const store = new MemorySecurityEventStore();
    const errors: string[] = [];
    const log = new SecurityLog(store, { error: (_o, m) => errors.push(m) }, { flushDelayMs: 10_000 });
    store.failNext = 1;
    log.record({ type: 'auth.login', ip: '1.2.3.4' });
    await log.flush();
    expect(store.events).toHaveLength(0);
    expect(log.pending).toBe(1);
    expect(errors[0]).toMatch(/повтор/);
    await log.flush();
    expect(store.events.map((e) => e.type)).toEqual(['auth.login']);
  });

  it('журнал сервера (stdout) не содержит тел запросов', async () => {
    const lines: string[] = [];
    const app = buildApp(
      {
        notes: new NotesService(new MemoryMetadataStore(), new MemoryBlobStore(), { ttlDays: 30, log: { error: () => {} } }),
        auth: new AuthService(new MemoryUserStore()),
        checks: {},
        jwtSecret: 'test-secret-test-secret-test-secret',
        security: {
          guard: new SecurityGuard(new MemoryIpBlockStore(), new SecurityLog(new MemorySecurityEventStore(), { error: () => {} }), DEFAULT_GUARD),
          audit: new SecurityLog(new MemorySecurityEventStore(), { error: () => {} }),
          revoked: new MemoryRevokedTokenStore(),
        },
      },
      { level: 'info', stream: { write: (l: string) => void lines.push(l) } },
    );
    const pkg = await encryptNote('x', 'note-password', { iterations: 100_000 });
    await app.inject({ method: 'POST', url: '/api/notes', payload: pkg });
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: 'carol', password: 'carol-password-1' } });
    await app.close();
    const all = lines.join('');
    expect(all).toContain('request completed');
    expect(all).not.toContain(pkg.ciphertext.slice(0, 16));
    expect(all).not.toContain('carol-password-1');
  });
});

describe('Выход отзывает токен', () => {
  it('cookie, сохранённая до выхода, после выхода не действует', async () => {
    const { app, revoked } = setup();
    const cookie = await register(app, 'alice');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(revoked.tokens.size).toBe(1);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);

    // новый вход выдаёт новый токен, он работает
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'alice', password: 'account-password-1' } });
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(res) } })).statusCode).toBe(200);
  });
});

describe('Заголовки безопасности', () => {
  it('ответы API запрещают встраивание, угадывание типа и Referer', async () => {
    const { app } = setup();
    const res = await app.inject({ url: '/api/health' });
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toBeUndefined(); // без HTTPS HSTS не ставим
  });

  it('с HTTPS (cookieSecure) — HSTS и Secure-cookie', async () => {
    const app = buildApp({
      notes: new NotesService(new MemoryMetadataStore(), new MemoryBlobStore(), { ttlDays: 30, log: { error: () => {} } }),
      auth: new AuthService(new MemoryUserStore()),
      checks: {},
      jwtSecret: 'test-secret-test-secret-test-secret',
      cookieSecure: true,
      security: {
        guard: new SecurityGuard(new MemoryIpBlockStore(), new SecurityLog(new MemorySecurityEventStore(), { error: () => {} }), DEFAULT_GUARD),
        audit: new SecurityLog(new MemorySecurityEventStore(), { error: () => {} }),
        revoked: new MemoryRevokedTokenStore(),
      },
    });
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: 'dave', password: 'dave-password-1' } });
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
    await app.close();
  });
});

describe('IP клиента за прокси', () => {
  it('подделанный X-Forwarded-For не обходит лимит: доверяем только записи от Caddy', async () => {
    const { app } = setup({ trustProxy: 1, guard: { perMinute: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      // Клиент каждый раз подставляет новый «свой» адрес; Caddy дописывает настоящий в конец
      const res = await app.inject({ url: MISSING, remoteAddress: '172.18.0.5', headers: { 'x-forwarded-for': `10.0.0.${i}, ${ATTACKER}` } });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([404, 404, 404, 429, 429]);
  });
});

describe('Журнал не переполняется атакой', () => {
  it('сотни запросов сверх лимита — одна запись rate.limited в минуту', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app, audit, events } = setup({ now: () => now, guard: { perMinute: 2 } });
    for (let i = 0; i < 200; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    now = new Date(now.getTime() + 61_000);
    for (let i = 0; i < 50; i++) await app.inject({ url: MISSING, remoteAddress: ATTACKER });
    await audit.flush();
    expect(events.events.filter((e) => e.type === 'rate.limited')).toHaveLength(2);
  });
});
