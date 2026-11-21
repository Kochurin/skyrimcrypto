import { afterEach } from 'vitest';
import { buildApp, SESSION_COOKIE } from '../src/app.js';
import { AuthService } from '../src/auth.js';
import { NotesService } from '../src/notes.js';
import { MemoryBlobStore, MemoryMetadataStore, MemoryUserStore } from '../src/stores/memory.js';
import { SecurityLog } from '../src/security/audit.js';
import { DEFAULT_GUARD, SecurityGuard, type GuardOptions } from '../src/security/guard.js';
import { MemoryIpBlockStore, MemoryRevokedTokenStore, MemorySecurityEventStore } from '../src/security/memory.js';

export interface SetupOptions {
  now?: () => Date;
  metadata?: MemoryMetadataStore;
  blobs?: MemoryBlobStore;
  guard?: Partial<GuardOptions>;
  trustProxy?: number;
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

/** Приложение на хранилищах в памяти. */
export function setup(opts: SetupOptions = {}) {
  const metadata = opts.metadata ?? new MemoryMetadataStore();
  const blobs = opts.blobs ?? new MemoryBlobStore();
  const users = new MemoryUserStore();
  const errors: { obj: object; msg: string }[] = [];
  const clock = opts.now ? { now: opts.now } : {};
  const notes = new NotesService(metadata, blobs, {
    ttlDays: 30,
    log: { error: (obj, msg) => errors.push({ obj, msg }) },
    ...clock,
  });
  const events = new MemorySecurityEventStore();
  const ipBlocks = new MemoryIpBlockStore();
  const revoked = new MemoryRevokedTokenStore();
  const audit = new SecurityLog(events, { error: (obj, msg) => errors.push({ obj, msg }) }, { ...clock, flushDelayMs: 1 });
  // В тестах лимиты щедрые, чтобы не мешать; тесты защиты задают свои
  const guard = new SecurityGuard(ipBlocks, audit, { ...DEFAULT_GUARD, perMinute: 10_000, authPerMinute: 10_000, ...clock, ...opts.guard });
  const app = buildApp({
    notes,
    auth: new AuthService(users, clock),
    checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
    jwtSecret: 'test-secret-test-secret-test-secret',
    ...(opts.trustProxy ? { trustProxy: opts.trustProxy } : {}),
    security: { guard, audit, revoked },
  });
  apps.push(app);
  return { app, metadata, blobs, users, notes, errors, events, ipBlocks, revoked, audit, guard };
}

export type App = ReturnType<typeof setup>['app'];

/** Зарегистрироваться и вернуть заголовок Cookie для следующих запросов. */
export async function register(app: App, login: string, password = 'account-password-1'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { login, password } });
  if (res.statusCode !== 201) throw new Error(`register ${res.statusCode}: ${res.body}`);
  return sessionCookie(res);
}

export function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  if (!c) throw new Error('нет cookie сессии');
  return `${SESSION_COOKIE}=${c.value}`;
}
