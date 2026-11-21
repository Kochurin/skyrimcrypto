import { afterEach, describe, expect, it, vi } from 'vitest';
import { CryptoError, encryptNote } from '@cn/crypto';
import { ApiFailure, createNote, fetchNote } from '../src/api.js';
import { formatBytes, parseDocument, serializeDocument, utf8Length } from '../src/document.js';
import { errorMessage } from '../src/messages.js';
import { parseRoute } from '../src/route.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Формат документа внутри шифротекста', () => {
  it('название и текст переживают сериализацию', () => {
    const doc = { title: 'План "Б" <script>', text: 'строка 1\nстрока 2 🔐' };
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });

  it('чужой или битый формат показывается как обычный текст', () => {
    expect(parseDocument('просто текст')).toEqual({ title: '', text: 'просто текст' });
    expect(parseDocument('{"type":"other","title":"x"}')).toEqual({ title: '', text: '{"type":"other","title":"x"}' });
    expect(parseDocument('null')).toEqual({ title: '', text: 'null' });
  });

  it('размер считается в байтах UTF-8', () => {
    expect(utf8Length('я')).toBe(2);
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.00 МБ');
  });
});

describe('Маршруты', () => {
  const id = '6c1564c3-24e3-4cc2-b5a7-5929ba75358e';
  it.each([
    ['/', { page: 'editor' }],
    [`/n/${id}`, { page: 'view', id }],
    [`/n/${id.toUpperCase()}/`, { page: 'view', id }],
    ['/n/123', { page: 'not-found' }],
    ['/n/../etc', { page: 'not-found' }],
    ['/admin', { page: 'not-found' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });
});

describe('Клиент IF2 INotesApi', () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('POST отправляет только пакет и возвращает id', async () => {
    const pkg = await encryptNote('секретный текст', 'password-1', { iterations: 100_000 });
    const fetchMock = vi.fn(async () => json(201, { id: 'abc', expiresAt: '2026-12-21T00:00:00.000Z' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createNote(pkg, 7)).resolves.toEqual({ id: 'abc', expiresAt: '2026-12-21T00:00:00.000Z', owned: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notes?ttl=7');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(pkg);
    expect(init.body).not.toContain('секрет');
    expect(init.body).not.toContain('password-1');
  });

  it('404 → null, без исключения', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: 'NOT_FOUND' })));
    await expect(fetchNote('x')).resolves.toBeNull();
  });

  it.each([
    [413, 'TOO_LARGE'],
    [400, 'REJECTED'],
    [500, 'SERVER'],
    [503, 'SERVER'],
  ])('код %i → %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(status, { message: 'x' })));
    await expect(fetchNote('x')).rejects.toMatchObject({ code });
  });

  it('сеть недоступна → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(fetchNote('x')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('Сообщения об ошибках', () => {
  it('у каждой ошибки сценариев есть понятный текст', () => {
    for (const code of ['UNSUPPORTED', 'WEAK_PASSWORD', 'TOO_LARGE', 'INVALID_PACKAGE', 'DECRYPT_FAILED'] as const) {
      expect(errorMessage(new CryptoError(code))).not.toMatch(/Непредвиденная/);
    }
    for (const code of ['NETWORK', 'TOO_LARGE', 'REJECTED', 'SERVER'] as const) {
      expect(errorMessage(new ApiFailure(code, ''))).not.toMatch(/Непредвиденная/);
    }
    expect(errorMessage(new CryptoError('UNSUPPORTED'))).toMatch(/текст остался в редакторе/);
  });
});
