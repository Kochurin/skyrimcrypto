import { describe, expect, it } from 'vitest';
import { encryptNote } from '@cn/crypto';
import { MemoryBlobStore } from '../src/stores/memory.js';
import { register, sessionCookie, setup, type App } from './helpers.js';

const NOTE_PASSWORD = 'note-master-password';
const FAST = { iterations: 100_000 };
const DAY = 24 * 3600 * 1000;

const login = (app: App, login: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, password } });

async function createNote(app: App, cookie?: string, query = '') {
  const res = await app.inject({
    method: 'POST',
    url: `/api/notes${query}`,
    payload: await encryptNote('секрет', NOTE_PASSWORD, FAST),
    headers: cookie ? { cookie } : {},
  });
  return res;
}

describe('FR-01: регистрация и вход', () => {
  it('регистрация выдаёт httpOnly-cookie с JWT; /me возвращает логин и роль', async () => {
    const { app, users } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: '  Vova.K ', password: 'account-password-1' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ login: 'vova.k', role: 'author' });

    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api/);

    // Пароль хранится только как хеш Argon2id
    const [user] = [...users.users.values()];
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user!.passwordHash).not.toContain('account-password-1');

    const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(res) } });
    expect(me.json()).toEqual({ login: 'vova.k', role: 'author' });
  });

  it('занятый логин — 409, плохой логин и короткий пароль — 400', async () => {
    const { app } = setup();
    await register(app, 'alice');
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: 'ALICE', password: 'another-pass-1' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: 'a b', password: 'account-password-1' } });
    expect(bad.json()).toMatchObject({ error: 'BAD_LOGIN' });
    const weak = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login: 'bob', password: 'short' } });
    expect(weak.json()).toMatchObject({ error: 'WEAK_PASSWORD' });
  });

  it('неверный пароль и несуществующий логин дают одинаковый ответ', async () => {
    const { app } = setup();
    await register(app, 'alice');
    const wrong = await login(app, 'alice', 'wrong-password');
    const missing = await login(app, 'nobody', 'wrong-password');
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json()).toEqual(missing.json());
    expect(wrong.cookies).toHaveLength(0);
  });

  it('после 5 неудачных попыток вход блокируется на 15 минут, потом снова доступен', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app } = setup({ now: () => now });
    await register(app, 'alice');
    for (let i = 0; i < 5; i++) expect((await login(app, 'alice', 'wrong-password')).statusCode).toBe(401);

    // Даже верный пароль не пускает во время блокировки
    const locked = await login(app, 'alice', 'account-password-1');
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toMatchObject({ error: 'LOCKED' });

    now = new Date(now.getTime() + 15 * 60_000 + 1000);
    expect((await login(app, 'alice', 'account-password-1')).statusCode).toBe(200);
  });

  it('успешный вход сбрасывает счётчик попыток', async () => {
    const { app } = setup();
    await register(app, 'alice');
    for (let i = 0; i < 4; i++) await login(app, 'alice', 'wrong-password');
    expect((await login(app, 'alice', 'account-password-1')).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await login(app, 'alice', 'wrong-password');
    expect((await login(app, 'alice', 'account-password-1')).statusCode).toBe(200);
  });

  it('без cookie, с поддельным или чужим токеном — 401', async () => {
    const { app } = setup();
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(401);
    const forged = await app.inject({ url: '/api/auth/me', headers: { cookie: 'sc_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' } });
    expect(forged.statusCode).toBe(401);

    const other = setup(); // другое приложение — другой секрет не нужен: пользователя там нет
    const cookie = await register(other.app, 'alice');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('выход стирает cookie', async () => {
    const { app } = setup();
    await register(app, 'alice');
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/sc_session=;/);
  });
});

describe('FR-05, FR-06: заметки владельца', () => {
  it('заметка, созданная после входа, появляется в «Моих заметках»; чужие не видны', async () => {
    const { app, metadata } = setup();
    const alice = await register(app, 'alice');
    const bob = await register(app, 'bob');

    const a1 = (await createNote(app, alice)).json<{ id: string; owned: boolean }>();
    const a2 = (await createNote(app, alice, '?ttl=7')).json<{ id: string }>();
    await createNote(app, bob);
    const anon = (await createNote(app)).json<{ owned: boolean }>();
    expect(a1.owned).toBe(true);
    expect(anon.owned).toBe(false);

    const list = await app.inject({ url: '/api/notes', headers: { cookie: alice } });
    expect(list.statusCode).toBe(200);
    const { notes } = list.json<{ notes: { id: string; sizeBytes: number }[] }>();
    expect(notes.map((n) => n.id).sort()).toEqual([a1.id, a2.id].sort());
    // В списке только метаданные: ни шифротекста, ни соли, ни IV
    expect(Object.keys(notes[0]!).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'sizeBytes']);
    expect(metadata.rows.size).toBe(4);
  });

  it('список без входа — 401', async () => {
    const { app } = setup();
    expect((await app.inject({ url: '/api/notes' })).statusCode).toBe(401);
  });

  it('TTL: 1, 7 или 30 дней; другое значение — 400', async () => {
    const now = new Date('2026-11-21T10:00:00Z');
    const { app } = setup({ now: () => now });
    for (const days of [1, 7, 30]) {
      const res = await createNote(app, undefined, `?ttl=${days}`);
      expect(new Date(res.json<{ expiresAt: string }>().expiresAt).getTime()).toBe(now.getTime() + days * DAY);
    }
    for (const bad of ['0', '365', 'abc', '-1']) {
      expect((await createNote(app, undefined, `?ttl=${bad}`)).json()).toMatchObject({ error: 'BAD_TTL' });
    }
  });
});

describe('FR-09: удаление и TTL', () => {
  it('владелец удаляет заметку: ссылка даёт 404, блоб и строка удалены', async () => {
    const { app, metadata, blobs } = setup();
    const alice = await register(app, 'alice');
    const { id } = (await createNote(app, alice)).json<{ id: string }>();

    const del = await app.inject({ method: 'DELETE', url: `/api/notes/${id}`, headers: { cookie: alice } });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(404);
    expect(blobs.objects.has(id)).toBe(false);
    expect(metadata.rows.has(id)).toBe(false);
  });

  it('чужую заметку удалить нельзя — 403; без входа — 401; несуществующую — 404', async () => {
    const { app } = setup();
    const alice = await register(app, 'alice');
    const bob = await register(app, 'bob');
    const { id } = (await createNote(app, alice)).json<{ id: string }>();
    const anon = (await createNote(app)).json<{ id: string }>();

    expect((await app.inject({ method: 'DELETE', url: `/api/notes/${id}`, headers: { cookie: bob } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/notes/${anon.id}`, headers: { cookie: bob } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/notes/${id}` })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/notes/00000000-0000-4000-8000-000000000000', headers: { cookie: bob } })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(200);
  });

  it('S3 недоступен при удалении: заметка сразу скрыта, очистка дочищает позже', async () => {
    const blobs = new MemoryBlobStore();
    const { app, metadata, notes, errors } = setup({ blobs });
    const alice = await register(app, 'alice');
    const { id } = (await createNote(app, alice)).json<{ id: string }>();

    const realDelete = blobs.delete.bind(blobs);
    blobs.delete = async () => {
      throw new Error('S3 down');
    };
    expect((await app.inject({ method: 'DELETE', url: `/api/notes/${id}`, headers: { cookie: alice } })).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(404);
    expect(metadata.rows.get(id)?.deletedAt).toBeInstanceOf(Date); // помечена к повторному удалению
    expect(errors.some((e) => e.msg.includes('повтор'))).toBe(true);

    blobs.delete = realDelete;
    expect(await notes.purge()).toBe(1);
    expect(metadata.rows.has(id)).toBe(false);
    expect(blobs.objects.has(id)).toBe(false);
  });

  it('очистка удаляет просроченные заметки и не трогает активные', async () => {
    let now = new Date('2026-11-21T10:00:00Z');
    const { app, metadata, blobs, notes } = setup({ now: () => now });
    const short = (await createNote(app, undefined, '?ttl=1')).json<{ id: string }>();
    const long = (await createNote(app, undefined, '?ttl=30')).json<{ id: string }>();

    expect(await notes.purge()).toBe(0);
    now = new Date(now.getTime() + 2 * DAY);
    expect(await notes.purge()).toBe(1);
    expect(metadata.rows.has(short.id)).toBe(false);
    expect(blobs.objects.has(short.id)).toBe(false);
    expect(metadata.rows.has(long.id)).toBe(true);
  });
});
