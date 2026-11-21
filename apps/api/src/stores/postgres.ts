import postgres from 'postgres';
import {
  LoginTakenError,
  type IMetadataStore,
  type IUserStore,
  type NoteMetadata,
  type NoteSummary,
  type Role,
  type User,
} from './types.js';

/**
 * K3 База данных метаданных (PostgreSQL): реализует IF3 IMetadataStore и хранилище учётных записей.
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
  {
    // Этап 4: учётные записи (FR-01), владелец заметки (FR-05, FR-06), удаление (FR-09).
    id: 2,
    sql: `
      create table users (
        id               uuid primary key,
        login            text        not null unique check (login = lower(login) and length(login) between 3 and 32),
        password_hash    text        not null,
        role             text        not null default 'author' check (role in ('author', 'auditor', 'admin')),
        failed_attempts  integer     not null default 0,
        locked_until     timestamptz,
        created_at       timestamptz not null default now()
      );
      alter table notes add column owner_id   uuid references users (id);
      alter table notes add column deleted_at timestamptz;
      create index notes_owner_idx on notes (owner_id, created_at desc) where deleted_at is null;
      create index notes_deleted_idx on notes (deleted_at) where deleted_at is not null;
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
  owner_id: string | null;
}

interface UserRow {
  id: string;
  login: string;
  password_hash: string;
  role: Role;
  failed_attempts: number;
  locked_until: Date | null;
  created_at: Date;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  login: r.login,
  passwordHash: r.password_hash,
  role: r.role,
  failedAttempts: r.failed_attempts,
  lockedUntil: r.locked_until,
  createdAt: r.created_at,
});

export class PostgresMetadataStore implements IMetadataStore, IUserStore {
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

  // ---------- Заметки (IF3) ----------

  async insert(m: NoteMetadata): Promise<void> {
    await this.sql`
      insert into notes (id, format_version, kdf_alg, kdf_iterations, salt, cipher_alg, iv, size_bytes, created_at, expires_at, owner_id)
      values (${m.id}, ${m.formatVersion}, ${m.kdfAlg}, ${m.kdfIterations}, ${m.salt}, ${m.cipherAlg}, ${m.iv},
              ${m.sizeBytes}, ${m.createdAt}, ${m.expiresAt}, ${m.ownerId})`;
  }

  async findActive(id: string, now: Date): Promise<NoteMetadata | null> {
    const rows = await this.sql<NoteRow[]>`
      select * from notes where id = ${id} and expires_at > ${now} and deleted_at is null`;
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
      ownerId: r.owner_id,
    };
  }

  async listByOwner(ownerId: string, now: Date): Promise<NoteSummary[]> {
    const rows = await this.sql<Pick<NoteRow, 'id' | 'size_bytes' | 'created_at' | 'expires_at'>[]>`
      select id, size_bytes, created_at, expires_at from notes
      where owner_id = ${ownerId} and deleted_at is null and expires_at > ${now}
      order by created_at desc
      limit 1000`;
    return rows.map((r) => ({ id: r.id, sizeBytes: r.size_bytes, createdAt: r.created_at, expiresAt: r.expires_at }));
  }

  async markDeleted(id: string, now: Date): Promise<void> {
    await this.sql`update notes set deleted_at = ${now} where id = ${id} and deleted_at is null`;
  }

  async listPurgeable(now: Date, limit: number): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id from notes where deleted_at is not null or expires_at <= ${now} limit ${limit}`;
    return rows.map((r) => r.id);
  }

  async remove(id: string): Promise<void> {
    await this.sql`delete from notes where id = ${id}`;
  }

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  // ---------- Учётные записи ----------

  async create(u: User): Promise<void> {
    try {
      await this.sql`
        insert into users (id, login, password_hash, role, failed_attempts, locked_until, created_at)
        values (${u.id}, ${u.login}, ${u.passwordHash}, ${u.role}, ${u.failedAttempts}, ${u.lockedUntil}, ${u.createdAt})`;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new LoginTakenError(); // unique_violation
      throw e;
    }
  }

  async findByLogin(login: string): Promise<User | null> {
    const [r] = await this.sql<UserRow[]>`select * from users where login = ${login}`;
    return r ? toUser(r) : null;
  }

  async findById(id: string): Promise<User | null> {
    const [r] = await this.sql<UserRow[]>`select * from users where id = ${id}`;
    return r ? toUser(r) : null;
  }

  async updateLock(id: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.sql`update users set failed_attempts = ${failedAttempts}, locked_until = ${lockedUntil} where id = ${id}`;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
