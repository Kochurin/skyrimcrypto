import postgres from 'postgres';
import type { ISnapshotSource, Snapshot } from '../admin/backup.js';
import type { ISettingsStore, Quotas } from '../admin/settings.js';
import type { AuditReport, IAuditReportStore } from '../admin/audit-reports.js';
import type {
  EventDetails,
  EventFilter,
  IIpBlockStore,
  IpBlock,
  IRevokedTokenStore,
  ISecurityEventStore,
  SecurityEvent,
} from '../security/types.js';
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
  {
    // Этап 5: журнал безопасности (FR-13), блокировки IP (FR-12), отозванные токены.
    id: 3,
    sql: `
      create table security_events (
        id       bigserial   primary key,
        at       timestamptz not null,
        type     text        not null,
        ip       text        not null,
        user_id  uuid,
        status   smallint,
        details  jsonb       not null default '{}'::jsonb
      );
      create index security_events_at_idx on security_events (at desc);
      create index security_events_type_idx on security_events (type, at desc);

      create table ip_blocks (
        ip          text        primary key,
        until       timestamptz not null,
        reason      text        not null,
        created_at  timestamptz not null default now()
      );

      create table revoked_tokens (
        jti         uuid        primary key,
        expires_at  timestamptz not null
      );
      create index revoked_tokens_exp_idx on revoked_tokens (expires_at);
    `,
  },
  {
    // Этап 6: настройки (квоты FR-10) и отчёты аудита Zero-Knowledge (FR-14).
    id: 4,
    sql: `
      create table settings (
        key    text  primary key,
        value  jsonb not null
      );
      create table audit_reports (
        id           uuid        primary key,
        at           timestamptz not null,
        user_id      uuid        not null references users (id),
        passed       boolean     not null,
        duration_ms  integer     not null,
        checks       jsonb       not null
      );
      create index audit_reports_at_idx on audit_reports (at desc);
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

export class PostgresMetadataStore implements IMetadataStore, IUserStore, ISettingsStore, ISnapshotSource {
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

  async usageByOwner(ownerId: string, now: Date): Promise<number> {
    const [r] = await this.sql<{ total: string | null }[]>`
      select sum(size_bytes) as total from notes where owner_id = ${ownerId} and deleted_at is null and expires_at > ${now}`;
    return Number(r?.total ?? 0);
  }

  async allIds(): Promise<string[]> {
    return (await this.sql<{ id: string }[]>`select id from notes`).map((r) => r.id);
  }

  async stats(now: Date): Promise<{ notes: number; bytes: number; anonymous: number }> {
    const [r] = await this.sql<{ notes: string; bytes: string | null; anonymous: string }[]>`
      select count(*) as notes, sum(size_bytes) as bytes, count(*) filter (where owner_id is null) as anonymous
      from notes where deleted_at is null and expires_at > ${now}`;
    return { notes: Number(r?.notes ?? 0), bytes: Number(r?.bytes ?? 0), anonymous: Number(r?.anonymous ?? 0) };
  }

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }

  // ---------- Настройки (FR-10) ----------

  async getQuotas(): Promise<Quotas | null> {
    const [r] = await this.sql<{ value: Quotas }[]>`select value from settings where key = 'quotas'`;
    return r?.value ?? null;
  }

  async setQuotas(q: Quotas): Promise<void> {
    await this.sql`
      insert into settings (key, value) values ('quotas', ${this.sql.json(q as never)})
      on conflict (key) do update set value = excluded.value`;
  }

  // ---------- Снимок для резервной копии (FR-11) ----------

  async exportSnapshot(): Promise<Snapshot> {
    // Одна транзакция REPEATABLE READ: заметки и пользователи согласованы между собой
    return this.sql.begin('isolation level repeatable read', async (tx) => {
      const notes = await tx`select * from notes`;
      const users = await tx`select * from users`;
      const [q] = await tx<{ value: Quotas }[]>`select value from settings where key = 'quotas'`;
      return JSON.parse(JSON.stringify({ notes: [...notes], users: [...users], quotas: q?.value ?? null })) as Snapshot;
    });
  }

  async importSnapshot(s: Snapshot): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Отчёты аудита пользователей, которых нет в снимке, удаляются вместе с ними (внешний ключ)
      await tx`delete from audit_reports where user_id not in (select (u->>'id')::uuid from jsonb_array_elements(${tx.json(s.users as never)}) u)`;
      await tx`delete from notes`;
      await tx`delete from users where id not in (select (u->>'id')::uuid from jsonb_array_elements(${tx.json(s.users as never)}) u)`;
      for (const u of s.users) {
        await tx`
          insert into users (id, login, password_hash, role, failed_attempts, locked_until, created_at)
          values (${String(u.id)}, ${String(u.login)}, ${String(u.password_hash)}, ${String(u.role)},
                  ${Number(u.failed_attempts)}, ${u.locked_until ? String(u.locked_until) : null}, ${String(u.created_at)})
          on conflict (id) do update set login = excluded.login, password_hash = excluded.password_hash, role = excluded.role,
            failed_attempts = excluded.failed_attempts, locked_until = excluded.locked_until, created_at = excluded.created_at`;
      }
      for (const n of s.notes) {
        await tx`
          insert into notes (id, format_version, kdf_alg, kdf_iterations, salt, cipher_alg, iv, size_bytes, created_at, expires_at, owner_id, deleted_at)
          values (${String(n.id)}, ${Number(n.format_version)}, ${String(n.kdf_alg)}, ${Number(n.kdf_iterations)}, ${String(n.salt)},
                  ${String(n.cipher_alg)}, ${String(n.iv)}, ${Number(n.size_bytes)}, ${String(n.created_at)}, ${String(n.expires_at)},
                  ${n.owner_id ? String(n.owner_id) : null}, ${n.deleted_at ? String(n.deleted_at) : null})`;
      }
      if (s.quotas) {
        await tx`insert into settings (key, value) values ('quotas', ${tx.json(s.quotas as never)}) on conflict (key) do update set value = excluded.value`;
      } else {
        await tx`delete from settings where key = 'quotas'`;
      }
    });
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

  async setRole(login: string, role: Role): Promise<boolean> {
    const r = await this.sql`update users set role = ${role} where login = ${login}`;
    return r.count > 0;
  }

  async count(): Promise<number> {
    const [r] = await this.sql<{ n: string }[]>`select count(*) as n from users`;
    return Number(r?.n ?? 0);
  }

  /** Хранилище этапа 5 на том же подключении. */
  security(): PostgresSecurityStore {
    return new PostgresSecurityStore(this.sql);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

interface EventRow {
  at: Date;
  type: string;
  ip: string;
  user_id: string | null;
  status: number | null;
  details: EventDetails;
}

/** Журнал безопасности, блокировки IP и отозванные токены (часть K3). */
export class PostgresSecurityStore implements ISecurityEventStore, IIpBlockStore, IRevokedTokenStore, IAuditReportStore {
  constructor(private readonly sql: postgres.Sql) {}

  async insertMany(events: SecurityEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((e) => ({
      at: e.at,
      type: e.type,
      ip: e.ip,
      user_id: e.userId,
      status: e.status,
      details: this.sql.json(e.details),
    }));
    await this.sql`insert into security_events ${this.sql(rows, 'at', 'type', 'ip', 'user_id', 'status', 'details')}`;
  }

  async recent(limit: number): Promise<SecurityEvent[]> {
    const rows = await this.sql<EventRow[]>`
      select at, type, ip, user_id, status, details from security_events order by id desc limit ${limit}`;
    return rows.map((r) => ({ at: r.at, type: r.type, ip: r.ip, userId: r.user_id, status: r.status, details: r.details }));
  }

  async search(f: EventFilter): Promise<SecurityEvent[]> {
    const typePattern = f.type ? `${f.type.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const rows = await this.sql<EventRow[]>`
      select at, type, ip, user_id, status, details from security_events
      where (${typePattern}::text is null or type like ${typePattern})
        and (${f.ip ?? null}::text is null or ip = ${f.ip ?? null})
        and (${f.userId ?? null}::uuid is null or user_id = ${f.userId ?? null})
      order by id desc limit ${f.limit}`;
    return rows.map((r) => ({ at: r.at, type: r.type, ip: r.ip, userId: r.user_id, status: r.status, details: r.details }));
  }

  async insert(r: AuditReport): Promise<void> {
    await this.sql`
      insert into audit_reports (id, at, user_id, passed, duration_ms, checks)
      values (${r.id}, ${r.at}, ${r.userId}, ${r.passed}, ${r.durationMs}, ${this.sql.json(r.checks as never)})`;
  }

  async list(limit: number): Promise<AuditReport[]> {
    const rows = await this.sql<{ id: string; at: Date; user_id: string; passed: boolean; duration_ms: number; checks: AuditReport['checks'] }[]>`
      select id, at, user_id, passed, duration_ms, checks from audit_reports order by at desc limit ${limit}`;
    return rows.map((r) => ({ id: r.id, at: r.at, userId: r.user_id, passed: r.passed, durationMs: r.duration_ms, checks: r.checks }));
  }

  async purgeBefore(date: Date): Promise<number> {
    const r = await this.sql`delete from security_events where at < ${date}`;
    return r.count;
  }

  async upsert(b: IpBlock): Promise<void> {
    await this.sql`
      insert into ip_blocks (ip, until, reason, created_at) values (${b.ip}, ${b.until}, ${b.reason}, ${b.createdAt})
      on conflict (ip) do update set until = excluded.until, reason = excluded.reason, created_at = excluded.created_at`;
  }

  async remove(ip: string): Promise<void> {
    await this.sql`delete from ip_blocks where ip = ${ip}`;
  }

  async listActive(now: Date): Promise<IpBlock[]> {
    const rows = await this.sql<{ ip: string; until: Date; reason: string; created_at: Date }[]>`
      select ip, until, reason, created_at from ip_blocks where until > ${now}`;
    return rows.map((r) => ({ ip: r.ip, until: r.until, reason: r.reason, createdAt: r.created_at }));
  }

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.sql`insert into revoked_tokens (jti, expires_at) values (${jti}, ${expiresAt}) on conflict do nothing`;
  }

  async isRevoked(jti: string): Promise<boolean> {
    const rows = await this.sql`select 1 from revoked_tokens where jti = ${jti}`;
    return rows.length > 0;
  }

  async purgeExpired(now: Date): Promise<number> {
    const r = await this.sql`delete from revoked_tokens where expires_at <= ${now}`;
    return r.count;
  }
}
