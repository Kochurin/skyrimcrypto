import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { decryptNote, encryptNote, type EncryptedPackage } from '@cn/crypto';
import { buildApp } from '../src/app.js';
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
const app = buildApp({
  notes: new NotesService(metadata, blobs, { ttlDays: 30, log: { error: () => {} } }),
  checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
});
const created: string[] = [];

beforeAll(async () => {
  await metadata.migrate();
});

afterAll(async () => {
  for (const id of created) {
    await sql`delete from notes where id = ${id}`;
    await blobs.delete(id);
  }
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
      ping: metadata.ping.bind(metadata),
    };
    const service = new NotesService(brokenDb, spyBlobs, { ttlDays: 30, log: { error: () => {} } });

    await expect(service.create(await encryptNote('x', PASSWORD, { iterations: 100_000 }))).rejects.toThrow(/kdf_iterations/);
    expect(writtenId).not.toBe('');
    expect(await blobs.get(writtenId)).toBeNull();
  });
});
