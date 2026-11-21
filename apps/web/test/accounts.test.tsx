// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';

/**
 * FR-01, FR-06, FR-09 в интерфейсе: вход, «Мои заметки», выбор срока, удаление.
 * Сервер подменён fetch-заглушкой с той же семантикой ответов, что у apps/api.
 */
const NOTE_PASSWORD = 'note-password-1';

interface FakeNote {
  id: string;
  owner: string | null;
  body: string;
  ttl: number;
}

let loggedIn: string | null;
let accounts: Map<string, string>;
let notes: FakeNote[];
let requests: { method: string; url: string; body: string }[];

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? String(init.body) : '';
    requests.push({ method, url: url.pathname + url.search, body });
    const path = url.pathname;

    if (path === '/api/auth/me') return loggedIn ? json(200, { login: loggedIn, role: 'author' }) : json(401, { error: 'UNAUTHORIZED' });
    if (path === '/api/auth/register') {
      const { login, password } = JSON.parse(body) as { login: string; password: string };
      if (accounts.has(login)) return json(409, { error: 'LOGIN_TAKEN', message: 'Этот логин уже занят.' });
      accounts.set(login, password);
      loggedIn = login;
      return json(201, { login, role: 'author' });
    }
    if (path === '/api/auth/login') {
      const { login, password } = JSON.parse(body) as { login: string; password: string };
      if (accounts.get(login) !== password) return json(401, { error: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль.' });
      loggedIn = login;
      return json(200, { login, role: 'author' });
    }
    if (path === '/api/auth/logout') {
      loggedIn = null;
      return json(204);
    }
    if (path === '/api/notes' && method === 'POST') {
      const id = crypto.randomUUID();
      const ttl = Number(url.searchParams.get('ttl'));
      notes.push({ id, owner: loggedIn, body, ttl });
      return json(201, { id, expiresAt: new Date(Date.now() + ttl * 86_400_000).toISOString(), owned: loggedIn !== null });
    }
    if (path === '/api/notes' && method === 'GET') {
      if (!loggedIn) return json(401, { error: 'UNAUTHORIZED' });
      return json(200, {
        notes: notes
          .filter((n) => n.owner === loggedIn)
          .map((n) => ({ id: n.id, sizeBytes: 300, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + n.ttl * 86_400_000).toISOString() })),
      });
    }
    const id = path.split('/').pop() ?? '';
    const note = notes.find((n) => n.id === id);
    if (method === 'DELETE') {
      if (!loggedIn) return json(401, { error: 'UNAUTHORIZED' });
      if (!note) return json(404, { error: 'NOT_FOUND' });
      if (note.owner !== loggedIn) return json(403, { error: 'FORBIDDEN' });
      notes = notes.filter((n) => n !== note);
      return json(204);
    }
    return note ? new Response(note.body, { status: 200 }) : json(404, { error: 'NOT_FOUND' });
  });
}

beforeEach(() => {
  loggedIn = null;
  accounts = new Map([['alice', 'account-pass-1']]);
  notes = [];
  requests = [];
  vi.stubGlobal('fetch', fakeServer());
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signInAsAlice(user: ReturnType<typeof userEvent.setup>) {
  // кнопка «Войти» в шапке (на странице «Мои заметки» есть ещё одна)
  await user.click((await screen.findAllByRole('button', { name: 'Войти' }))[0]!);
  await user.type(await screen.findByLabelText('Логин'), 'alice');
  await user.type(screen.getByLabelText('Пароль учётной записи'), 'account-pass-1');
  await user.click(screen.getByRole('button', { name: 'Войти' }));
  await screen.findByRole('heading', { name: 'Мои заметки' });
}

async function writeNote(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('Текст'), text);
  await user.type(screen.getByLabelText('Пароль'), NOTE_PASSWORD);
  await user.type(screen.getByLabelText('Пароль ещё раз'), NOTE_PASSWORD);
}

describe('FR-01: вход и регистрация', () => {
  it('неверный пароль — общее сообщение, вход не выполнен', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/login');
    render(<App />);
    await user.type(screen.getByLabelText('Логин'), 'alice');
    await user.type(screen.getByLabelText('Пароль учётной записи'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
    expect(loggedIn).toBeNull();
  });

  it('регистрация: пароли должны совпадать; после регистрации — «Мои заметки»', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/login');
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Логин'), 'bob');
    await user.type(screen.getByLabelText('Пароль учётной записи'), 'bob-password-1');
    await user.type(screen.getByLabelText('Пароль ещё раз'), 'bob-password-2');
    await user.click(screen.getByRole('button', { name: 'Создать учётную запись' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Пароли не совпадают');
    expect(accounts.has('bob')).toBe(false);

    await user.clear(screen.getByLabelText('Пароль ещё раз'));
    await user.type(screen.getByLabelText('Пароль ещё раз'), 'bob-password-1');
    await user.click(screen.getByRole('button', { name: 'Создать учётную запись' }));
    expect(await screen.findByRole('heading', { name: 'Мои заметки' })).toBeInTheDocument();
    expect(screen.getByText('Заметок пока нет')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('пароль учётной записи не сохраняется в localStorage и sessionStorage', async () => {
    const user = userEvent.setup();
    render(<App />);
    await signInAsAlice(user);
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain('account-pass-1');
  });
});

describe('FR-06, FR-09: мои заметки', () => {
  it('заметка после входа: выбранный срок уходит на сервер, заметка появляется в списке', async () => {
    const user = userEvent.setup();
    render(<App />);
    await signInAsAlice(user);
    await user.click(screen.getByRole('link', { name: 'Новая заметка' }));

    expect(await screen.findByText(/заметка появится в «Моих заметках»/)).toBeInTheDocument();
    await writeNote(user, 'личная заметка');
    await user.click(screen.getByLabelText('7 дней'));
    await user.click(screen.getByRole('button', { name: 'Зашифровать и сохранить' }));
    await screen.findByLabelText('Ссылка на заметку', {}, { timeout: 10_000 });

    const post = requests.find((r) => r.method === 'POST' && r.url.startsWith('/api/notes'));
    expect(post?.url).toBe('/api/notes?ttl=7');
    expect(post?.body).not.toContain('личная');
    expect(notes[0]).toMatchObject({ owner: 'alice', ttl: 7 });

    await user.click(screen.getByRole('button', { name: 'Мои заметки' }));
    const list = await screen.findByRole('list', { name: 'Список заметок' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText(/удалится через 7 дней/)).toBeInTheDocument();
  });

  it('удаление требует подтверждения и убирает заметку', async () => {
    notes = [
      { id: '11111111-1111-4111-8111-111111111111', owner: 'alice', body: '{}', ttl: 30 },
      { id: '22222222-2222-4222-8222-222222222222', owner: 'alice', body: '{}', ttl: 1 },
      { id: '33333333-3333-4333-8333-333333333333', owner: 'bob', body: '{}', ttl: 30 },
    ];
    const user = userEvent.setup();
    render(<App />);
    await signInAsAlice(user);

    const list = await screen.findByRole('list', { name: 'Список заметок' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2); // чужая не видна
    await user.click(within(list).getByRole('button', { name: 'Удалить заметку 11111111' }));
    expect(notes).toHaveLength(3); // пока только подтверждение
    await user.click(within(list).getByRole('button', { name: 'Удалить навсегда' }));

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(notes.map((n) => n.id)).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('без входа «Мои заметки» предлагают войти; выход возвращает на главную', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/notes');
    render(<App />);
    expect(await screen.findByText(/войдите в учётную запись/i)).toBeInTheDocument();

    await signInAsAlice(user);
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(loggedIn).toBeNull();
    expect(screen.queryByRole('link', { name: 'Мои заметки' })).toBeNull();
  });
});
