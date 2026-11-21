import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { ApiError } from './notes.js';
import { LoginTakenError, type IUserStore, type Role, type User } from './stores/types.js';

/**
 * FR-01 «Регистрация и аутентификация».
 * Пароль учётной записи — НЕ мастер-пароль заметок: он защищает только доступ к списку
 * и удалению своих заметок. Заметки по-прежнему шифруются отдельным паролем в браузере.
 * Хеш — Argon2id (параметры OWASP по умолчанию в @node-rs/argon2: m=19 МиБ, t=2, p=1).
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const MIN_ACCOUNT_PASSWORD = 8;
export const MAX_ACCOUNT_PASSWORD = 256;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Один и тот же ответ на «нет такого логина» и «неверный пароль» (FR-01). */
const INVALID = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль.');

export interface SessionUser {
  id: string;
  login: string;
  role: Role;
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

export class AuthService {
  /** Хеш для несуществующего логина: проверка занимает столько же времени, сколько настоящая. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: IUserStore,
    private readonly options: { now?: () => Date } = {},
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  async register(rawLogin: string, password: string): Promise<SessionUser> {
    const login = normalizeLogin(rawLogin);
    if (!LOGIN_RE.test(login)) {
      throw new ApiError(400, 'BAD_LOGIN', 'Логин: 3–32 символа, латинские буквы, цифры, точка, дефис или подчёркивание.');
    }
    const length = [...password].length;
    if (length < MIN_ACCOUNT_PASSWORD || length > MAX_ACCOUNT_PASSWORD) {
      throw new ApiError(400, 'WEAK_PASSWORD', `Пароль учётной записи — от ${MIN_ACCOUNT_PASSWORD} символов.`);
    }
    const user: User = {
      id: randomUUID(),
      login,
      passwordHash: await hash(password.normalize('NFC')),
      role: 'author',
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: this.now(),
    };
    try {
      await this.users.create(user);
    } catch (e) {
      if (e instanceof LoginTakenError) throw new ApiError(409, 'LOGIN_TAKEN', 'Этот логин уже занят.');
      throw e;
    }
    return { id: user.id, login: user.login, role: user.role };
  }

  async login(rawLogin: string, password: string): Promise<SessionUser> {
    const login = normalizeLogin(rawLogin);
    const user = LOGIN_RE.test(login) ? await this.users.findByLogin(login) : null;
    if (!user) {
      this.dummyHash ??= hash('dummy-password-for-timing');
      await verify(await this.dummyHash, password).catch(() => false);
      throw INVALID();
    }

    const now = this.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
      throw new ApiError(429, 'LOCKED', `Слишком много неудачных попыток. Вход ограничен ещё на ${minutes} мин.`);
    }

    const ok = await verify(user.passwordHash, password.normalize('NFC')).catch(() => false);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await this.users.updateLock(user.id, 0, new Date(now.getTime() + LOCK_MINUTES * 60_000));
      } else {
        await this.users.updateLock(user.id, attempts, null);
      }
      throw INVALID();
    }

    if (user.failedAttempts !== 0 || user.lockedUntil) await this.users.updateLock(user.id, 0, null);
    return { id: user.id, login: user.login, role: user.role };
  }

  /** Учётная запись из токена ещё существует? (роль берём из БД, а не из токена) */
  async current(id: string): Promise<SessionUser | null> {
    const user = await this.users.findById(id);
    return user ? { id: user.id, login: user.login, role: user.role } : null;
  }
}
