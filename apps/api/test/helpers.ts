import { afterEach } from 'vitest';
import { buildApp, SESSION_COOKIE } from '../src/app.js';
import { AuthService } from '../src/auth.js';
import { NotesService } from '../src/notes.js';
import { MemoryBlobStore, MemoryMetadataStore, MemoryUserStore } from '../src/stores/memory.js';

export interface SetupOptions {
  now?: () => Date;
  metadata?: MemoryMetadataStore;
  blobs?: MemoryBlobStore;
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
  const app = buildApp({
    notes,
    auth: new AuthService(users, clock),
    checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
    jwtSecret: 'test-secret-test-secret-test-secret',
  });
  apps.push(app);
  return { app, metadata, blobs, users, notes, errors };
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
