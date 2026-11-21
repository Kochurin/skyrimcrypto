import { describe, expect, it } from 'vitest';
import { encryptNote, toBase64Url } from '@cn/crypto';
import { validateQuotas, MB } from '../src/admin/settings.js';
import { register, setup, type App } from './helpers.js';

const FAST = { iterations: 100_000 };
type Env = ReturnType<typeof setup>;

async function asRole(env: Env, login: string, role: 'admin' | 'auditor' | 'author') {
  const cookie = await register(env.app, login);
  await env.users.setRole(login, role);
  return cookie;
}

async function note(app: App, cookie: string | undefined, text: string) {
  return app.inject({
    method: 'POST',
    url: '/api/notes',
    payload: await encryptNote(text, 'note-password-1', FAST),
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

describe('FR-01: доступ к разделам по роли', () => {
  it('без входа — 401, автор — 403, администратор — 200; журнал доступен и аудитору', async () => {
    const env = setup();
    const author = await asRole(env, 'author1', 'author');
    const auditor = await asRole(env, 'auditor1', 'auditor');
    const admin = await asRole(env, 'admin1', 'admin');
    const get = (url: string, cookie?: string) => env.app.inject({ url, ...(cookie ? { headers: { cookie } } : {}) });

    expect((await get('/api/admin/overview')).statusCode).toBe(401);
    expect((await get('/api/admin/overview', author)).json()).toMatchObject({ error: 'NO_ROLE' });
    expect((await get('/api/admin/overview', auditor)).statusCode).toBe(403);
    expect((await get('/api/admin/overview', admin)).statusCode).toBe(200);
    expect((await get('/api/admin/events', auditor)).statusCode).toBe(200);
    expect((await get('/api/admin/events', author)).statusCode).toBe(403);
    expect((await get('/api/audit/reports', auditor)).statusCode).toBe(200);
  });

  it('администратор назначает роли, но не может снять роль с себя', async () => {
    const env = setup();
    const admin = await asRole(env, 'boss', 'admin');
    await register(env.app, 'bob');
    const put = (body: object) => env.app.inject({ method: 'PUT', url: '/api/admin/users/role', payload: body, headers: { cookie: admin } });
    expect((await put({ login: 'bob', role: 'auditor' })).statusCode).toBe(200);
    expect((await env.users.findByLogin('bob'))?.role).toBe('auditor');
    expect((await put({ login: 'boss', role: 'author' })).json()).toMatchObject({ error: 'SELF_DEMOTE' });
    expect((await put({ login: 'bob', role: 'root' })).json()).toMatchObject({ error: 'BAD_ROLE' });
    expect((await put({ login: 'nobody', role: 'author' })).statusCode).toBe(404);
  });
});

describe('FR-10: квоты', () => {
  it('границы: 1 и 10 МБ допустимы, меньше и больше — отказ с причиной', () => {
    expect(validateQuotas({ maxNoteBytes: 1 * MB, userQuotaBytes: 1 * MB })).toEqual({ maxNoteBytes: MB, userQuotaBytes: MB });
    expect(validateQuotas({ maxNoteBytes: 10 * MB, userQuotaBytes: 10 * 1024 * MB }).maxNoteBytes).toBe(10 * MB);
    expect(() => validateQuotas({ maxNoteBytes: MB - 1, userQuotaBytes: MB })).toThrow(/от 1 до 10 МБ/);
    expect(() => validateQuotas({ maxNoteBytes: 10 * MB + 1, userQuotaBytes: MB })).toThrow(/от 1 до 10 МБ/);
    expect(() => validateQuotas({ maxNoteBytes: 1.5, userQuotaBytes: MB })).toThrow(/целое/);
    expect(() => validateQuotas(null)).toThrow();
  });

  it('заметка больше разрешённого размера — 413 с причиной; действие администратора — в журнале', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    const res = await env.app.inject({ method: 'PUT', url: '/api/admin/quotas', payload: { maxNoteBytes: MB, userQuotaBytes: 100 * MB }, headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);

    expect((await note(env.app, undefined, 'a'.repeat(MB))).statusCode).toBe(201); // ровно 1 МБ — можно
    const big = await note(env.app, undefined, 'a'.repeat(MB + 1));
    expect(big.statusCode).toBe(413);
    expect(big.json().message).toMatch(/администратор/);

    await env.audit.flush();
    expect(env.events.events.some((e) => e.type === 'admin.quotas' && e.userId)).toBe(true);
  });

  it('объём на пользователя: сверх квоты — 403 QUOTA_EXCEEDED; занятое видно в «Моих заметках»', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    await env.app.inject({ method: 'PUT', url: '/api/admin/quotas', payload: { maxNoteBytes: MB, userQuotaBytes: MB }, headers: { cookie: admin } });
    const alice = await register(env.app, 'alice');

    expect((await note(env.app, alice, 'x'.repeat(600 * 1024))).statusCode).toBe(201);
    const over = await note(env.app, alice, 'y'.repeat(600 * 1024));
    expect(over.statusCode).toBe(403);
    expect(over.json()).toMatchObject({ error: 'QUOTA_EXCEEDED' });

    const list = (await env.app.inject({ url: '/api/notes', headers: { cookie: alice } })).json<{ usage: { usedBytes: number; quotaBytes: number } }>();
    expect(list.usage.quotaBytes).toBe(MB);
    expect(list.usage.usedBytes).toBeGreaterThan(600 * 1024);
    // без входа квота на пользователя не действует, только размер заметки
    expect((await note(env.app, undefined, 'z'.repeat(600 * 1024))).statusCode).toBe(201);
  });

  it('автор не может менять квоты', async () => {
    const env = setup();
    const author = await asRole(env, 'author1', 'author');
    const res = await env.app.inject({ method: 'PUT', url: '/api/admin/quotas', payload: { maxNoteBytes: MB, userQuotaBytes: MB }, headers: { cookie: author } });
    expect(res.statusCode).toBe(403);
  });
});

describe('FR-12: ручная блокировка администратором', () => {
  it('заблокировать, увидеть в списке, разблокировать', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    const h = { cookie: admin };
    expect((await env.app.inject({ method: 'POST', url: '/api/admin/blocks', payload: { ip: '203.0.113.9', hours: 2, reason: 'спам' }, headers: h })).statusCode).toBe(201);
    expect((await env.app.inject({ url: '/api/health', remoteAddress: '203.0.113.9' })).statusCode).toBe(200);
    expect((await env.app.inject({ url: '/api/notes/x', remoteAddress: '203.0.113.9' })).statusCode).toBe(403);

    const list = (await env.app.inject({ url: '/api/admin/blocks', headers: h })).json<{ blocks: { ip: string; reason: string }[] }>();
    expect(list.blocks).toMatchObject([{ ip: '203.0.113.9', reason: 'спам (администратор)' }]);

    expect((await env.app.inject({ method: 'DELETE', url: '/api/admin/blocks/203.0.113.9', headers: h })).statusCode).toBe(204);
    expect((await env.app.inject({ url: '/api/notes/x', remoteAddress: '203.0.113.9' })).statusCode).toBe(404);
  });

  it('неверный адрес, свой адрес и адрес из белого списка — отказ', async () => {
    const env = setup({ guard: { allowlist: ['198.51.100.10'] } });
    const admin = await asRole(env, 'admin1', 'admin');
    const post = (ip: string) => env.app.inject({ method: 'POST', url: '/api/admin/blocks', payload: { ip }, headers: { cookie: admin } });
    expect((await post('not-an-ip')).json()).toMatchObject({ error: 'BAD_IP' });
    expect((await post('127.0.0.1')).json()).toMatchObject({ error: 'SELF_BLOCK' });
    expect((await post('198.51.100.10')).json()).toMatchObject({ error: 'ALLOWLISTED' });
  });
});

describe('FR-13: поиск по журналу', () => {
  it('фильтр по префиксу типа и IP', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin1', password: 'wrong-one' }, remoteAddress: '203.0.113.5' });
    await note(env.app, admin, 'x');
    await env.audit.flush();
    const get = (q: string) => env.app.inject({ url: `/api/admin/events?${q}`, headers: { cookie: admin } }).then((r) => r.json<{ events: { type: string; ip: string }[] }>().events);
    expect((await get('type=auth.')).every((e) => e.type.startsWith('auth.'))).toBe(true);
    expect((await get('type=note.')).map((e) => e.type)).toEqual(['note.create']);
    expect((await get('ip=203.0.113.5')).map((e) => e.type)).toEqual(['auth.login_failed']);
  });
});

describe('Сверка блобов', () => {
  it('старые «сироты» удаляются, свежие не трогаются, строки без блобов помечаются удалёнными', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const env = setup({ now: () => now });
    const admin = await asRole(env, 'admin1', 'admin');
    const kept = (await note(env.app, admin, 'нормальная')).json<{ id: string }>().id;
    const lost = (await note(env.app, admin, 'потеряет блоб')).json<{ id: string }>().id;
    env.blobs.objects.delete(lost);
    await env.blobs.put('00000000-0000-4000-8000-0000000000aa', new Uint8Array(32));
    env.blobs.modified.set('00000000-0000-4000-8000-0000000000aa', new Date(now.getTime() - 2 * 3_600_000));
    await env.blobs.put('00000000-0000-4000-8000-0000000000bb', new Uint8Array(32));
    env.blobs.modified.set('00000000-0000-4000-8000-0000000000bb', now);

    now = new Date(now.getTime() + 60_000);
    const report = (await env.app.inject({ method: 'POST', url: '/api/admin/reconcile', headers: { cookie: admin } })).json();
    expect(report).toMatchObject({ removedOrphans: 1, youngOrphans: 1, missingBlobs: [lost] });
    expect(env.blobs.objects.has('00000000-0000-4000-8000-0000000000aa')).toBe(false);
    expect(env.blobs.objects.has('00000000-0000-4000-8000-0000000000bb')).toBe(true);
    expect((await env.app.inject({ url: `/api/notes/${kept}` })).statusCode).toBe(200);
    expect(env.metadata.rows.get(lost)?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('FR-11: резервное копирование', () => {
  it('создать копию → изменить данные → восстановить → данные совпадают с копией', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    const h = { cookie: admin };
    const a = (await note(env.app, admin, 'первая')).json<{ id: string }>().id;
    const b = (await note(env.app, undefined, 'вторая')).json<{ id: string }>().id;
    await env.app.inject({ method: 'PUT', url: '/api/admin/quotas', payload: { maxNoteBytes: 5 * MB, userQuotaBytes: 50 * MB }, headers: h });
    const before = { rows: [...env.metadata.rows.keys()].sort(), blobA: toBase64Url(env.blobs.objects.get(a)!), users: env.users.users.size };

    const created = await env.app.inject({ method: 'POST', url: '/api/admin/backups', headers: h });
    expect(created.statusCode).toBe(201);
    const manifest = created.json<{ id: string; status: string; notes: number; blobs: Record<string, string> }>();
    expect(manifest).toMatchObject({ status: 'ok', notes: 2 });
    expect(Object.keys(manifest.blobs).sort()).toEqual([a, b].sort());
    expect(manifest.blobs[a]).toMatch(/^[0-9a-f]{64}$/);

    // «авария»: удалили заметку, добавили чужую, сменили квоты, завели пользователя
    await env.app.inject({ method: 'DELETE', url: `/api/notes/${a}`, headers: h });
    await note(env.app, undefined, 'появилась после копии');
    await env.app.inject({ method: 'PUT', url: '/api/admin/quotas', payload: { maxNoteBytes: MB, userQuotaBytes: MB }, headers: h });
    await register(env.app, 'latecomer');

    const restored = await env.app.inject({ method: 'POST', url: `/api/admin/backups/${manifest.id}/restore`, headers: h });
    expect(restored.json()).toMatchObject({ notes: 2, blobs: 2 });
    expect([...env.metadata.rows.keys()].sort()).toEqual(before.rows);
    expect(toBase64Url(env.blobs.objects.get(a)!)).toBe(before.blobA);
    expect(env.users.users.size).toBe(before.users);
    expect(await env.settings.quotas()).toMatchObject({ maxNoteBytes: 5 * MB });
    expect((await env.app.inject({ url: `/api/notes/${a}` })).statusCode).toBe(200);

    await env.audit.flush();
    expect(env.events.events.filter((e) => e.type.startsWith('backup.')).map((e) => e.type)).toEqual(['backup.created', 'backup.restored']);
  });

  it('битая запись — повтор; не прошла и повтор — копия failed и событие для администратора', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    const id = (await note(env.app, admin, 'x')).json<{ id: string }>().id;
    const origPut = env.backupStorage.put.bind(env.backupStorage);
    let calls = 0;
    env.backupStorage.put = async (key, data) => {
      if (key.endsWith(id)) {
        calls++;
        env.backupStorage.corrupt.add(key); // каждая запись этого блоба портится
      }
      return origPut(key, data);
    };
    const manifest = (await env.app.inject({ method: 'POST', url: '/api/admin/backups', headers: { cookie: admin } })).json();
    expect(calls).toBe(2); // запись + один повтор
    expect(manifest).toMatchObject({ status: 'failed', failed: [id] });
    await env.audit.flush();
    expect(env.events.events.some((e) => e.type === 'backup.failed')).toBe(true);
    const restore = await env.app.inject({ method: 'POST', url: `/api/admin/backups/${manifest.id}/restore`, headers: { cookie: admin } });
    expect(restore.json()).toMatchObject({ error: 'RESTORE_FAILED' });
  });

  it('повреждённая копия не восстанавливается, живые данные не тронуты', async () => {
    const env = setup();
    const admin = await asRole(env, 'admin1', 'admin');
    const id = (await note(env.app, admin, 'x')).json<{ id: string }>().id;
    const manifest = (await env.app.inject({ method: 'POST', url: '/api/admin/backups', headers: { cookie: admin } })).json<{ id: string }>();
    const key = `${manifest.id}/blobs/${id}`;
    const data = env.backupStorage.objects.get(key)!;
    data[0] = data[0]! ^ 1; // кто-то испортил копию на диске
    await note(env.app, admin, 'после копии');
    const rows = env.metadata.rows.size;
    const res = await env.app.inject({ method: 'POST', url: `/api/admin/backups/${manifest.id}/restore`, headers: { cookie: admin } });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/повреждён/);
    expect(env.metadata.rows.size).toBe(rows);
  });

  it('хранятся только последние копии (keep)', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const env = setup({ now: () => now });
    const admin = await asRole(env, 'admin1', 'admin');
    for (let i = 0; i < 5; i++) {
      now = new Date(now.getTime() + 3_600_000);
      await env.app.inject({ method: 'POST', url: '/api/admin/backups', headers: { cookie: admin } });
    }
    expect((await env.backups.list()).length).toBe(3);
  });
});

describe('FR-14: отчёты аудита Zero-Knowledge', () => {
  const checks = (passed: boolean) => [
    { id: 'traffic', name: 'Пароль и текст не уходят в сеть', passed: true, detail: 'ok' },
    { id: 'tamper', name: 'Подмена байта обнаруживается', passed, detail: passed ? 'ok' : 'расшифровалось!' },
  ];

  it('аудитор сохраняет отчёт; нарушение — инцидент в журнале', async () => {
    const env = setup();
    const auditor = await asRole(env, 'auditor1', 'auditor');
    const post = (body: unknown) => env.app.inject({ method: 'POST', url: '/api/audit/reports', payload: body as object, headers: { cookie: auditor } });
    expect((await post({ checks: checks(true), durationMs: 1234 })).json()).toMatchObject({ passed: true });
    expect((await post({ checks: checks(false), durationMs: 99 })).json()).toMatchObject({ passed: false });
    expect((await post({ checks: [] })).json()).toMatchObject({ error: 'BAD_REPORT' });

    const list = (await env.app.inject({ url: '/api/audit/reports', headers: { cookie: auditor } })).json<{ reports: { passed: boolean; checks: unknown[] }[] }>();
    expect(list.reports.map((r) => r.passed)).toEqual([false, true]);
    await env.audit.flush();
    const incident = env.events.events.find((e) => e.type === 'audit.failed');
    expect(incident?.details.reason).toMatch(/tamper/);
  });

  it('автор не может отправлять отчёты', async () => {
    const env = setup();
    const author = await asRole(env, 'author1', 'author');
    const res = await env.app.inject({ method: 'POST', url: '/api/audit/reports', payload: { checks: checks(true) }, headers: { cookie: author } });
    expect(res.statusCode).toBe(403);
  });
});
