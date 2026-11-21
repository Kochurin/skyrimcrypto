// @vitest-environment jsdom
import './setup-dom.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';

/**
 * Сценарии US-01 и US-02 целиком: настоящий React, настоящее шифрование,
 * вместо сервера — fetch, который хранит то, что ему прислали.
 */
const PASSWORD = 'correct horse battery';
let server: Map<string, string>;
let requests: string[];

function fakeServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const body = String(init.body);
      requests.push(body);
      const id = crypto.randomUUID();
      server.set(id, body);
      return new Response(JSON.stringify({ id, expiresAt: '2026-12-21T10:00:00.000Z' }), { status: 201 });
    }
    const id = url.split('/').pop() ?? '';
    const stored = server.get(id);
    return stored
      ? new Response(stored, { status: 200 })
      : new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });
  });
}

beforeEach(() => {
  server = new Map();
  requests = [];
  vi.stubGlobal('fetch', fakeServer());
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function createNote(title: string, text: string) {
  const user = userEvent.setup();
  render(<App />);
  if (title) await user.type(screen.getByLabelText('Название'), title);
  await user.type(screen.getByLabelText('Текст'), text);
  await user.type(screen.getByLabelText('Пароль'), PASSWORD);
  await user.type(screen.getByLabelText('Пароль ещё раз'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Зашифровать и сохранить' }));
  const link = await screen.findByLabelText('Ссылка на заметку', {}, { timeout: 10_000 });
  return { user, url: (link as HTMLInputElement).value };
}

describe('US-01: создать и зашифровать заметку', () => {
  it('на сервер уходит только шифротекст, пользователь получает ссылку', async () => {
    const { url } = await createNote('Пароли от Wi-Fi', 'секрет: 12345');
    expect(url).toMatch(/^http:\/\/localhost(:\d+)?\/n\/[0-9a-f-]{36}$/);
    expect(requests).toHaveLength(1);
    const sent = requests[0]!;
    expect(sent).not.toContain('секрет');
    expect(sent).not.toContain('Wi-Fi'); // название тоже зашифровано
    expect(sent).not.toContain(PASSWORD);
    expect(Object.keys(JSON.parse(sent) as object).sort()).toEqual(['cipher', 'ciphertext', 'kdf', 'v']);
  });

  it('пароли не совпадают — ничего не отправляется', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Текст'), 'текст');
    await user.type(screen.getByLabelText('Пароль'), PASSWORD);
    await user.type(screen.getByLabelText('Пароль ещё раз'), PASSWORD + '!');
    await user.click(screen.getByRole('button', { name: 'Зашифровать и сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Пароли не совпадают');
    expect(requests).toHaveLength(0);
  });

  it('короткий пароль отклоняется до шифрования', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Текст'), 'текст');
    await user.type(screen.getByLabelText('Пароль'), 'short');
    await user.type(screen.getByLabelText('Пароль ещё раз'), 'short');
    await user.click(screen.getByRole('button', { name: 'Зашифровать и сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('не короче 8');
    expect(requests).toHaveLength(0);
  });

  it('сервер недоступен — текст остаётся в редакторе', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Текст'), 'не потерять');
    await user.type(screen.getByLabelText('Пароль'), PASSWORD);
    await user.type(screen.getByLabelText('Пароль ещё раз'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Зашифровать и сохранить' }));
    expect(await screen.findByRole('alert', {}, { timeout: 10_000 })).toHaveTextContent('Нет связи с сервером');
    expect(screen.getByLabelText('Текст')).toHaveValue('не потерять');
  });

  it('браузер без Web Crypto: шифрование недоступно, ничего не отправляется', async () => {
    vi.stubGlobal('crypto', {});
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('не поддерживает Web Crypto API');
    expect(screen.getByRole('button', { name: 'Зашифровать и сохранить' })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });
});

describe('US-02: открыть заметку по ссылке', () => {
  it('верный пароль — расшифрованные название и текст; HTML не исполняется', async () => {
    const { user, url } = await createNote('Мой план', '<img src=x onerror="alert(1)"> строка');
    cleanup();
    window.history.replaceState(null, '', new URL(url).pathname);
    render(<App />);

    await user.type(await screen.findByLabelText('Пароль'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Расшифровать' }));
    expect(await screen.findByRole('heading', { name: 'Мой план' }, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)"> строка')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull(); // подсунутый HTML не стал элементом
  });

  it('неверный пароль — сообщение, можно попробовать ещё раз', async () => {
    const { user, url } = await createNote('', 'текст');
    cleanup();
    window.history.replaceState(null, '', new URL(url).pathname);
    render(<App />);

    const field = await screen.findByLabelText('Пароль');
    await user.type(field, 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Расшифровать' }));
    expect(await screen.findByRole('alert', {}, { timeout: 10_000 })).toHaveTextContent('Неверный пароль');

    await user.clear(field);
    await user.type(field, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Расшифровать' }));
    await waitFor(() => expect(screen.getByText('текст')).toBeInTheDocument(), { timeout: 10_000 });
  });

  it('несуществующая заметка — 404 без подробностей', async () => {
    window.history.replaceState(null, '', '/n/00000000-0000-4000-8000-000000000000');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Заметка не найдена' })).toBeInTheDocument();
  });

  it('битая ссылка — страница не найдена, запросов нет', () => {
    window.history.replaceState(null, '', '/n/not-a-uuid');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
