import type { EncryptedPackage } from '@cn/crypto';

/**
 * Клиент IF2 INotesApi (ЛР7). Отправляет на сервер только зашифрованный пакет.
 */

export type ApiFailureCode = 'NETWORK' | 'TOO_LARGE' | 'REJECTED' | 'SERVER';

export class ApiFailure extends Error {
  readonly code: ApiFailureCode;

  constructor(code: ApiFailureCode, message: string) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
  }
}

export interface CreatedNote {
  id: string;
  expiresAt: string;
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  } catch (cause) {
    throw new ApiFailure('NETWORK', `Сервер недоступен: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

async function failure(res: Response): Promise<ApiFailure> {
  let detail = '';
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') detail = body.message;
  } catch {
    // тело не JSON — достаточно кода ответа
  }
  if (res.status === 413) return new ApiFailure('TOO_LARGE', detail || 'Заметка слишком большая.');
  if (res.status >= 400 && res.status < 500) return new ApiFailure('REJECTED', detail || `Сервер отклонил запрос (${res.status}).`);
  return new ApiFailure('SERVER', `Ошибка сервера (${res.status}).`);
}

export async function createNote(pkg: EncryptedPackage): Promise<CreatedNote> {
  const res = await send('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  if (res.status !== 201) throw await failure(res);
  const body = (await res.json()) as Partial<CreatedNote>;
  if (typeof body.id !== 'string' || typeof body.expiresAt !== 'string') {
    throw new ApiFailure('SERVER', 'Сервер вернул неожиданный ответ.');
  }
  return { id: body.id, expiresAt: body.expiresAt };
}

/** Пакет заметки или null, если её нет (не было, удалена или истёк срок — FR-07). */
export async function fetchNote(id: string): Promise<unknown> {
  const res = await send(`/api/notes/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (res.status !== 200) throw await failure(res);
  return (await res.json()) as unknown;
}
