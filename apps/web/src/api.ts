import type { EncryptedPackage } from '@cn/crypto';

/**
 * Клиент IF2 INotesApi (ЛР7). Отправляет на сервер только зашифрованный пакет.
 */

export type ApiFailureCode = 'NETWORK' | 'TOO_LARGE' | 'UNAUTHORIZED' | 'REJECTED' | 'SERVER';

export class ApiFailure extends Error {
  readonly code: ApiFailureCode;
  /** Код ошибки сервера (INVALID_CREDENTIALS, LOCKED, LOGIN_TAKEN, FORBIDDEN…). */
  readonly serverCode: string;

  constructor(code: ApiFailureCode, message: string, serverCode = '') {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.serverCode = serverCode;
  }
}

export interface CreatedNote {
  id: string;
  expiresAt: string;
  /** Заметка привязана к учётной записи и видна в «Моих заметках». */
  owned: boolean;
}

export interface Account {
  login: string;
  role: string;
}

export interface NoteSummary {
  id: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

export const TTL_OPTIONS = [1, 7, 30] as const;
export type TtlDays = (typeof TTL_OPTIONS)[number];

async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  } catch (cause) {
    throw new ApiFailure('NETWORK', `Сервер недоступен: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

async function failure(res: Response): Promise<ApiFailure> {
  let detail = '';
  let serverCode = '';
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string') detail = body.message;
    if (typeof body.error === 'string') serverCode = body.error;
  } catch {
    // тело не JSON — достаточно кода ответа
  }
  if (res.status === 413) return new ApiFailure('TOO_LARGE', detail || 'Заметка слишком большая.', serverCode);
  if (res.status === 401 && serverCode === 'UNAUTHORIZED') {
    return new ApiFailure('UNAUTHORIZED', detail || 'Войдите в учётную запись.', serverCode);
  }
  if (res.status >= 400 && res.status < 500) {
    return new ApiFailure('REJECTED', detail || `Сервер отклонил запрос (${res.status}).`, serverCode);
  }
  return new ApiFailure('SERVER', `Ошибка сервера (${res.status}).`);
}

export async function createNote(pkg: EncryptedPackage, ttlDays: TtlDays = 30): Promise<CreatedNote> {
  const res = await send(`/api/notes?ttl=${ttlDays}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  if (res.status !== 201) throw await failure(res);
  const body = (await res.json()) as Partial<CreatedNote>;
  if (typeof body.id !== 'string' || typeof body.expiresAt !== 'string') {
    throw new ApiFailure('SERVER', 'Сервер вернул неожиданный ответ.');
  }
  return { id: body.id, expiresAt: body.expiresAt, owned: body.owned === true };
}

/** Пакет заметки или null, если её нет (не было, удалена или истёк срок — FR-07). */
export async function fetchNote(id: string): Promise<unknown> {
  const res = await send(`/api/notes/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (res.status !== 200) throw await failure(res);
  return (await res.json()) as unknown;
}

// ---------- Учётная запись (FR-01) ----------
// Сессия — httpOnly-cookie: JavaScript страницы токен не видит и не хранит.

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Текущая учётная запись или null, если вход не выполнен. */
export async function fetchMe(): Promise<Account | null> {
  const res = await send('/api/auth/me');
  if (res.status === 401) return null;
  if (res.status !== 200) throw await failure(res);
  return (await res.json()) as Account;
}

export async function signIn(login: string, password: string): Promise<Account> {
  const res = await send('/api/auth/login', json({ login, password }));
  if (res.status !== 200) throw await failure(res);
  return (await res.json()) as Account;
}

export async function signUp(login: string, password: string): Promise<Account> {
  const res = await send('/api/auth/register', json({ login, password }));
  if (res.status !== 201) throw await failure(res);
  return (await res.json()) as Account;
}

export async function signOut(): Promise<void> {
  const res = await send('/api/auth/logout', { method: 'POST' });
  if (res.status !== 204) throw await failure(res);
}

// ---------- Мои заметки (FR-06, FR-09) ----------

export interface Usage {
  usedBytes: number;
  quotaBytes: number;
  maxNoteBytes: number;
}

export async function listNotes(): Promise<{ notes: NoteSummary[]; usage: Usage | null }> {
  const res = await send('/api/notes');
  if (res.status !== 200) throw await failure(res);
  const body = (await res.json()) as { notes: NoteSummary[]; usage?: Usage };
  return { notes: body.notes, usage: body.usage ?? null };
}

export async function deleteNote(id: string): Promise<void> {
  const res = await send(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.status !== 204) throw await failure(res);
}

// ---------- Этап 6: администратор и аудитор ----------

async function call<T>(url: string, init: RequestInit = {}, okStatus = [200]): Promise<T> {
  const res = await send(url, init);
  if (!okStatus.includes(res.status)) throw await failure(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const body = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export interface Quotas {
  maxNoteBytes: number;
  userQuotaBytes: number;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  status: 'ok' | 'failed';
  notes: number;
  users: number;
  bytes: number;
  failed: string[];
}

export interface ReconcileReport {
  at: string;
  blobs: number;
  rows: number;
  orphanBlobs: string[];
  removedOrphans: number;
  youngOrphans: number;
  missingBlobs: string[];
}

export interface Overview {
  stats: { notes: number; bytes: number; anonymous: number; users: number };
  quotas: Quotas;
  blocks: number;
  lastBackup: BackupManifest | null;
  lastReconcile: ReconcileReport | null;
  health: Record<string, 'ok' | 'down'>;
}

export interface IpBlockInfo {
  ip: string;
  until: string;
  reason: string;
  createdAt: string;
}

export interface SecurityEventInfo {
  at: string;
  type: string;
  ip: string;
  userId: string | null;
  status: number | null;
  details: Record<string, string | number | boolean>;
}

export interface AuditCheck {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface AuditReportInfo {
  id: string;
  at: string;
  passed: boolean;
  durationMs: number;
  checks: AuditCheck[];
}

export const admin = {
  overview: () => call<Overview>('/api/admin/overview'),
  setQuotas: (q: Quotas) => call<{ quotas: Quotas }>('/api/admin/quotas', body('PUT', q)),
  blocks: () => call<{ blocks: IpBlockInfo[] }>('/api/admin/blocks').then((r) => r.blocks),
  block: (ip: string, hours: number, reason: string) => call<unknown>('/api/admin/blocks', body('POST', { ip, hours, reason }), [201]),
  unblock: (ip: string) => call<void>(`/api/admin/blocks/${encodeURIComponent(ip)}`, { method: 'DELETE' }, [204]),
  events: (filter: { type?: string; ip?: string }) => {
    const q = new URLSearchParams({ limit: '200' });
    if (filter.type) q.set('type', filter.type);
    if (filter.ip) q.set('ip', filter.ip);
    return call<{ events: SecurityEventInfo[] }>(`/api/admin/events?${q}`).then((r) => r.events);
  },
  reconcile: () => call<ReconcileReport>('/api/admin/reconcile', { method: 'POST' }),
  backups: () => call<{ backups: BackupManifest[] }>('/api/admin/backups').then((r) => r.backups),
  backup: () => call<BackupManifest>('/api/admin/backups', { method: 'POST' }, [201]),
  restore: (id: string) => call<{ notes: number; users: number; blobs: number }>(`/api/admin/backups/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  setRole: (login: string, role: string) => call<{ login: string; role: string }>('/api/admin/users/role', body('PUT', { login, role })),
};

export const audit = {
  save: (checks: AuditCheck[], durationMs: number) => call<{ id: string; passed: boolean }>('/api/audit/reports', body('POST', { checks, durationMs }), [201]),
  list: () => call<{ reports: AuditReportInfo[] }>('/api/audit/reports').then((r) => r.reports),
};
