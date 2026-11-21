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

export async function listNotes(): Promise<NoteSummary[]> {
  const res = await send('/api/notes');
  if (res.status !== 200) throw await failure(res);
  return ((await res.json()) as { notes: NoteSummary[] }).notes;
}

export async function deleteNote(id: string): Promise<void> {
  const res = await send(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.status !== 204) throw await failure(res);
}
