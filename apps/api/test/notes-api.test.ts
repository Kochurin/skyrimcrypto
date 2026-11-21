import { afterEach, describe, expect, it } from 'vitest';
import { decryptNote, encryptNote, fromBase64Url, toBase64Url, type EncryptedPackage } from '@cn/crypto';
import { buildApp } from '../src/app.js';
import { NotesService } from '../src/notes.js';
import { MemoryBlobStore, MemoryMetadataStore } from '../src/stores/memory.js';

const PASSWORD = 'correct horse battery staple';
const FAST = { iterations: 100_000 };

function setup(opts: { now?: () => Date; metadata?: MemoryMetadataStore; blobs?: MemoryBlobStore } = {}) {
  const metadata = opts.metadata ?? new MemoryMetadataStore();
  const blobs = opts.blobs ?? new MemoryBlobStore();
  const errors: { obj: object; msg: string }[] = [];
  const notes = new NotesService(metadata, blobs, {
    ttlDays: 30,
    log: { error: (obj, msg) => errors.push({ obj, msg }) },
    ...(opts.now ? { now: opts.now } : {}),
  });
  const app = buildApp({ notes, checks: { db: () => metadata.ping(), s3: () => blobs.ping() } });
  apps.push(app);
  return { app, metadata, blobs, errors };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.inject({ method: 'POST', url: '/api/notes', payload: body as object });
}

describe('US-01 → US-02 через API', () => {
  it('сохранить пакет и получить его обратно; читатель расшифровывает', async () => {
    const { app, metadata, blobs } = setup();
    const text = 'Заметка для API-теста 🔐';
    const pkg = await encryptNote(text, PASSWORD, FAST);

    const res = await post(app, pkg);
    expect(res.statusCode).toBe(201);
    const { id, expiresAt } = res.json<{ id: string; expiresAt: string }>();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

    // D1 хранит только шифротекст, D2 — только заголовок
    expect(toBase64Url(blobs.objects.get(id)!)).toBe(pkg.ciphertext);
    expect(metadata.rows.get(id)).toMatchObject({ salt: pkg.kdf.salt, iv: pkg.cipher.iv, kdfIterations: 100_000 });

    const got = await app.inject({ method: 'GET', url: `/api/notes/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.headers['cache-control']).toBe('no-store');
    const back = got.json<EncryptedPackage>();
    expect(back).toEqual(pkg);
    expect(await decryptNote(back, PASSWORD)).toBe(text);
  });

  it('сервер не хранит ничего, кроме полей пакета (лишние поля отбрасываются)', async () => {
    const { app, metadata } = setup();
    const pkg = await encryptNote('x', PASSWORD, FAST);
    const res = await post(app, { ...pkg, password: PASSWORD, plaintext: 'x' });
    expect(res.statusCode).toBe(201);
    const row = metadata.rows.get(res.json<{ id: string }>().id)!;
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
  });
});

describe('Проверка входных данных (POST)', () => {
  it('битый пакет → 400 INVALID_PACKAGE, ничего не сохраняется', async () => {
    const { app, metadata, blobs } = setup();
    const pkg = await encryptNote('x', PASSWORD, FAST);
    for (const bad of [
      { ...pkg, v: 2 },
      { ...pkg, kdf: { ...pkg.kdf, iterations: 10 } },
      { ...pkg, cipher: { ...pkg.cipher, iv: toBase64Url(new Uint8Array(8)) } },
      { hello: 'world' },
    ]) {
      const res = await post(app, bad);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'INVALID_PACKAGE' });
    }
    expect(metadata.rows.size).toBe(0);
    expect(blobs.objects.size).toBe(0);
  });

  it('не JSON → 400', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/notes', payload: '{oops', headers: { 'content-type': 'application/json' } });
    expect(res.statusCode).toBe(400);
  });

  it('шифротекст больше 10 МБ + тег → 413 TOO_LARGE', async () => {
    const { app, blobs } = setup();
    const pkg = await encryptNote('x', PASSWORD, FAST);
    const huge = { ...pkg, ciphertext: toBase64Url(new Uint8Array(10 * 1024 * 1024 + 17)) };
    const res = await post(app, huge);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'TOO_LARGE' });
    expect(blobs.objects.size).toBe(0);
  });

  it('тело запроса больше лимита отсекается ещё до разбора → 413', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: JSON.stringify({ ciphertext: 'A'.repeat(15 * 1024 * 1024) }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('Выдача (GET): 404 без объяснения причины', () => {
  it('несуществующий, некорректный и истёкший id → 404 NOT_FOUND', async () => {
    let now = new Date('2026-11-21T00:00:00Z');
    const { app } = setup({ now: () => now });
    const pkg = await encryptNote('x', PASSWORD, FAST);
    const { id } = (await post(app, pkg)).json<{ id: string }>();

    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(200);
    for (const bad of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid', '..%2F..%2Fetc']) {
      const res = await app.inject({ url: `/api/notes/${bad}` });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'NOT_FOUND', message: 'Заметка не найдена.' });
    }

    now = new Date(now.getTime() + 31 * 24 * 3600 * 1000); // прошло 31 день, TTL 30
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(404);
  });
});

describe('NFR-05: атомарность сохранения', () => {
  it('сбой записи метаданных → блоб удаляется, ответ 500, заметки нет', async () => {
    const metadata = new MemoryMetadataStore();
    metadata.insert = async () => {
      throw new Error('db down');
    };
    const { app, blobs } = setup({ metadata });
    const res = await post(app, await encryptNote('x', PASSWORD, FAST));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'INTERNAL', message: 'Внутренняя ошибка сервера.' });
    expect(blobs.objects.size).toBe(0);
    expect(metadata.rows.size).toBe(0);
  });

  it('сбой записи блоба → метаданные не пишутся', async () => {
    const blobs = new MemoryBlobStore();
    blobs.put = async () => {
      throw new Error('s3 down');
    };
    const { app, metadata } = setup({ blobs });
    const res = await post(app, await encryptNote('x', PASSWORD, FAST));
    expect(res.statusCode).toBe(500);
    expect(metadata.rows.size).toBe(0);
  });

  it('сбой и записи метаданных, и удаления блоба → ошибка логируется', async () => {
    const metadata = new MemoryMetadataStore();
    metadata.insert = async () => {
      throw new Error('db down');
    };
    const blobs = new MemoryBlobStore();
    blobs.delete = async () => {
      throw new Error('s3 down');
    };
    const { app, errors } = setup({ metadata, blobs });
    expect((await post(app, await encryptNote('x', PASSWORD, FAST))).statusCode).toBe(500);
    expect(errors.some((e) => e.msg.includes('не удалось удалить блоб'))).toBe(true);
  });
});

describe('FR-11: /api/health', () => {
  it('всё работает → 200 ok', async () => {
    const { app } = setup();
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok', s3: 'ok' });
  });

  it('хранилище недоступно → 503 degraded', async () => {
    const blobs = new MemoryBlobStore();
    blobs.ping = async () => {
      throw new Error('down');
    };
    const { app } = setup({ blobs });
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', db: 'ok', s3: 'down' });
  });
});

describe('Полный размер: заметка 10 МБ проходит через API', () => {
  it('10 МБ туда и обратно', async () => {
    const { app } = setup();
    const pkg = await encryptNote('a'.repeat(10 * 1024 * 1024), PASSWORD, FAST);
    const res = await post(app, pkg);
    expect(res.statusCode).toBe(201);
    const back = (await app.inject({ url: `/api/notes/${res.json<{ id: string }>().id}` })).json<EncryptedPackage>();
    expect(fromBase64Url(back.ciphertext)).toHaveLength(10 * 1024 * 1024 + 16);
  });
});
