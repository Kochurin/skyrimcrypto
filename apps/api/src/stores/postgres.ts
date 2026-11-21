import postgres from 'postgres';
import type { IMetadataStore, NoteMetadata } from './types.js';

/**
 * K3 База данных метаданных (PostgreSQL), реализует IF3 IMetadataStore.
 * Миграции применяются по порядку и запоминаются в таблице schema_migrations.
 */
const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      create table notes (
        id              uuid primary key,
        format_version  smallint    not null,
        kdf_alg         text        not null,
        kdf_iterations  integer     not null check (kdf_iterations >= 100000),
        salt            text        not null,
        cipher_alg      text        not null,
        iv              text        not null,
        size_bytes      integer     not null check (size_bytes >= 16),
        created_at      timestamptz not null default now(),
        expires_at      timestamptz not null
      );
      create index notes_expires_at_idx on notes (expires_at);
    `,
  },
];

interface NoteRow {
  id: string;
  format_version: number;
  kdf_alg: string;
  kdf_iterations: number;
  salt: string;
  cipher_alg: string;
  iv: string;
  size_bytes: number;
  created_at: Date;
  expires_at: Date;
}

export class PostgresMetadataStore implements IMetadataStore {
  constructor(private readonly sql: postgres.Sql) {}

  static connect(url: string): PostgresMetadataStore {
    return new PostgresMetadataStore(postgres(url, { max: 10, onnotice: () => {} }));
  }

  async migrate(): Promise<number[]> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(7391)`; // два сервера не мигрируют одновременно
      await tx`create table if not exists schema_migrations (id integer primary key, applied_at timestamptz not null default now())`;
      const done = new Set((await tx<{ id: number }[]>`select id from schema_migrations`).map((r) => r.id));
      const applied: number[] = [];
      for (const m of MIGRATIONS) {
        if (done.has(m.id)) continue;
        await tx.unsafe(m.sql);
        await tx`insert into schema_migrations (id) values (${m.id})`;
        applied.push(m.id);
      }
      return applied;
    });
  }

  async insert(m: NoteMetadata): Promise<void> {
    await this.sql`
      insert into notes (id, format_version, kdf_alg, kdf_iterations, salt, cipher_alg, iv, size_bytes, created_at, expires_at)
      values (${m.id}, ${m.formatVersion}, ${m.kdfAlg}, ${m.kdfIterations}, ${m.salt}, ${m.cipherAlg}, ${m.iv},
              ${m.sizeBytes}, ${m.createdAt}, ${m.expiresAt})`;
  }

  async findActive(id: string, now: Date): Promise<NoteMetadata | null> {
    const rows = await this.sql<NoteRow[]>`select * from notes where id = ${id} and expires_at > ${now}`;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      formatVersion: 1,
      kdfAlg: r.kdf_alg,
      kdfIterations: r.kdf_iterations,
      salt: r.salt,
      cipherAlg: r.cipher_alg,
      iv: r.iv,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };
  }

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
