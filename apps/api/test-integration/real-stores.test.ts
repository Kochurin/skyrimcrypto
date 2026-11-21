import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { decryptNote, encryptNote, type EncryptedPackage } from '@cn/crypto';
import { buildApp, SESSION_COOKIE } from '../src/app.js';
import { AuthService } from '../src/auth.js';
import { SecurityLog } from '../src/security/audit.js';
import { DEFAULT_GUARD, SecurityGuard } from '../src/security/guard.js';
import { loadConfig } from '../src/config.js';
import { NotesService } from '../src/notes.js';
import { PostgresMetadataStore } from '../src/stores/postgres.js';
import { S3BlobStore } from '../src/stores/s3.js';

/**
 * Интеграционные тесты с настоящими PostgreSQL и MinIO из docker-compose.
 * Запуск: docker compose up -d && npm run test:integration
 */
const config = loadConfig();
const PASSWORD = 'integration-test-password';
const metadata = PostgresMetadataStore.connect(config.databaseUrl);
const blobs = S3BlobStore.fromConfig(config.s3);
const sql = postgres(config.databaseUrl, { max: 1 });
const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
});
const service = new NotesService(metadata, blobs, { ttlDays: 30, log: { error: () => {} } });
const securityStore = metadata.security();
const audit = new SecurityLog(securityStore, { error: () => {} }, { flushDelayMs: 1 });
const guard = new SecurityGuard(securityStore, audit, { ...DEFAULT_GUARD, perMinute: 10_000, authPerMinute: 10_000 });
const app = buildApp({
  notes: service,
  auth: new AuthService(metadata),
  checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
  jwtSecret: 'integration-test-secret',
  security: { guard, audit, revoked: securityStore },
});
const created: string[] = [];
const logins: string[] = [];

beforeAll(async () => {
  await metadata.migrate();
});

afterAll(async () => {
  for (const id of created) {
    await sql`delete from notes where id = ${id}`;
    await blobs.delete(id);
  }
  for (const login of logins) await sql`delete from users where login = ${login}`;
  await app.close();
  await metadata.close();
  await sql.end();
  blobs.close();
  s3.destroy();
});

describe('Интеграция: PostgreSQL 17 + MinIO', () => {
  it('/api/health видит обе системы', async () => {
    const res = await app.inject({ url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok', db: 'ok', s3: 'ok' });
  });

  it('миграции идемпотентны', async () => {
    expect(await metadata.migrate()).toEqual([]);
  });

  it('полный цикл: в БД — только заголовок, в S3 — только шифротекст', async () => {
    const secret = 'настоящая база и настоящий S3: секрет 42';
    const pkg = await encryptNote(secret, PASSWORD);
    const res = await app.inject({ method: 'POST', url: '/api/notes', payload: pkg });
    expect(res.statusCode).toBe(201);
    const { id } = res.json<{ id: string }>();
    created.push(id);

    const [row] = await sql`select * from notes where id = ${id}`;
    expect(row).toMatchObject({ salt: pkg.kdf.salt, iv: pkg.cipher.iv, kdf_iterations: 600_000 });
    expect(JSON.stringify(row)).not.toContain('секрет');

    const obj = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: `notes/${id}` }));
    const stored = Buffer.from(await obj.Body!.transformToByteArray());
    expect(stored.toString('utf8')).not.toContain('секрет');
    expect(stored.includes(Buffer.from('секрет', 'utf8'))).toBe(false);

    const back = (await app.inject({ url: `/api/notes/${id}` })).json<EncryptedPackage>();
    expect(await decryptNote(back, PASSWORD)).toBe(secret);
  });

  it('истёкшая заметка не выдаётся', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notes', payload: await encryptNote('old', PASSWORD, { iterations: 100_000 }) });
    const { id } = res.json<{ id: string }>();
    created.push(id);
    await sql`update notes set expires_at = now() - interval '1 second' where id = ${id}`;
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(404);
  });

  it('если запись в БД упала — объект в настоящем S3 удаляется (NFR-05)', async () => {
    let writtenId = '';
    const spyBlobs = Object.assign(Object.create(blobs) as S3BlobStore, {
      put: async (id: string, data: Uint8Array) => {
        writtenId = id;
        await blobs.put(id, data);
      },
    });
    const brokenDb = {
      insert: async () => {
        // нарушение ограничения в настоящем PostgreSQL
        await sql`insert into notes (id, format_version, kdf_alg, kdf_iterations, salt, cipher_alg, iv, size_bytes, expires_at)
                  values (gen_random_uuid(), 1, 'x', 1, 'x', 'x', 'x', 16, now())`;
      },
      findActive: metadata.findActive.bind(metadata),
      listByOwner: metadata.listByOwner.bind(metadata),
      markDeleted: metadata.markDeleted.bind(metadata),
      listPurgeable: metadata.listPurgeable.bind(metadata),
      remove: metadata.remove.bind(metadata),
      ping: metadata.ping.bind(metadata),
    };
    const service = new NotesService(brokenDb, spyBlobs, { ttlDays: 30, log: { error: () => {} } });

    await expect(service.create(await encryptNote('x', PASSWORD, { iterations: 100_000 }))).rejects.toThrow(/kdf_iterations/);
    expect(writtenId).not.toBe('');
    expect(await blobs.get(writtenId)).toBeNull();
  });

  it('учётная запись в PostgreSQL: регистрация, вход, список, удаление владельцем (FR-01, 06, 09)', async () => {
    const login = `it-${Date.now().toString(36)}`;
    logins.push(login);
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login, password: 'integration-pass-1' } });
    expect(reg.statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login, password: 'integration-pass-1' } });
    expect(dup.statusCode).toBe(409);

    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, password: 'integration-pass-1' } });
    const c = res.cookies.find((x) => x.name === SESSION_COOKIE)!;
    const cookie = `${SESSION_COOKIE}=${c.value}`;

    const [user] = await sql`select password_hash, role from users where login = ${login}`;
    expect(user).toMatchObject({ role: 'author' });
    expect(String(user!.password_hash)).toMatch(/^\$argon2id\$/);

    const note = await app.inject({
      method: 'POST', url: '/api/notes?ttl=7', headers: { cookie },
      payload: await encryptNote('x', PASSWORD, { iterations: 100_000 }),
    });
    const { id } = note.json<{ id: string }>();
    created.push(id);

    const list = await app.inject({ url: '/api/notes', headers: { cookie } });
    expect(list.json<{ notes: { id: string }[] }>().notes.map((n) => n.id)).toEqual([id]);

    expect((await app.inject({ method: 'DELETE', url: `/api/notes/${id}`, headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/notes/${id}` })).statusCode).toBe(404);
    expect(await sql`select 1 from notes where id = ${id}`).toHaveLength(0);
    expect(await blobs.get(id)).toBeNull();
  });

  it('очистка удаляет просроченную заметку из PostgreSQL и MinIO', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notes?ttl=1', payload: await encryptNote('x', PASSWORD, { iterations: 100_000 }) });
    const { id } = res.json<{ id: string }>();
    created.push(id);
    await sql`update notes set expires_at = now() - interval '1 second' where id = ${id}`;
    expect(await service.purge()).toBeGreaterThanOrEqual(1);
    expect(await sql`select 1 from notes where id = ${id}`).toHaveLength(0);
    expect(await blobs.get(id)).toBeNull();
  });

  it('этап 5 в PostgreSQL: журнал, блокировки IP, отозванные токены', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    await securityStore.insertMany([{ at: new Date(), type: 'test.event', ip, userId: null, status: 200, details: { login: 'x', noteId: 'y' } }]);
    const recent = await securityStore.recent(20);
    expect(recent.find((e) => e.ip === ip)).toMatchObject({ type: 'test.event', status: 200, details: { login: 'x', noteId: 'y' } });

    await securityStore.upsert({ ip, until: new Date(Date.now() + 60_000), reason: 'test', createdAt: new Date() });
    await securityStore.upsert({ ip, until: new Date(Date.now() + 120_000), reason: 'test 2', createdAt: new Date() });
    expect((await securityStore.listActive(new Date())).filter((b) => b.ip === ip)).toMatchObject([{ reason: 'test 2' }]);
    await securityStore.remove(ip);
    expect((await securityStore.listActive(new Date())).some((b) => b.ip === ip)).toBe(false);

    const jti = crypto.randomUUID();
    await securityStore.revoke(jti, new Date(Date.now() - 1000));
    expect(await securityStore.isRevoked(jti)).toBe(true);
    expect(await securityStore.purgeExpired(new Date())).toBeGreaterThanOrEqual(1);
    expect(await securityStore.isRevoked(jti)).toBe(false);
    await sql`delete from security_events where type = 'test.event'`;
  });
});
