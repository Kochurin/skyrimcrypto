/**
 * Интерфейсы хранилищ из компонентной диаграммы ЛР7.
 * IF3 IMetadataStore — реализует K3 (PostgreSQL), IF4 IBlobStore — реализует K4 (MinIO / S3).
 * Сервисы зависят только от этих интерфейсов, поэтому хранилище можно заменить,
 * не меняя логику (и подставить в тестах реализацию в памяти).
 */

/** Строка хранилища D2 «Метаданные заметок». Открытого текста здесь нет. */
export interface NoteMetadata {
  id: string;
  formatVersion: 1;
  kdfAlg: string;
  kdfIterations: number;
  /** base64url, 16 байт */
  salt: string;
  cipherAlg: string;
  /** base64url, 12 байт */
  iv: string;
  /** Размер шифротекста вместе с тегом, байт. */
  sizeBytes: number;
  createdAt: Date;
  expiresAt: Date;
  /** Владелец (FR-05); null — заметка создана без входа. */
  ownerId: string | null;
}

/** Элемент списка «Мои заметки» (FR-06): только метаданные, без содержимого. */
export interface NoteSummary {
  id: string;
  sizeBytes: number;
  createdAt: Date;
  expiresAt: Date;
}

/** IF3 IMetadataStore (хранилище D2). */
export interface IMetadataStore {
  insert(meta: NoteMetadata): Promise<void>;
  /** Заметка не удалена и её срок хранения не истёк; иначе null. */
  findActive(id: string, now: Date): Promise<NoteMetadata | null>;
  /** Активные заметки владельца, новые сверху (FR-06). */
  listByOwner(ownerId: string, now: Date): Promise<NoteSummary[]>;
  /**
   * FR-09. Пометить заметку удалённой (она сразу перестаёт выдаваться).
   * Строка остаётся, пока не удалён блоб: если S3 откажет, удаление повторит очистка.
   */
  markDeleted(id: string, now: Date): Promise<void>;
  /** Заметки, которые надо физически удалить: помеченные или с истёкшим TTL. */
  listPurgeable(now: Date, limit: number): Promise<string[]>;
  /** Окончательно удалить строку (после удаления блоба). */
  remove(id: string): Promise<void>;
  ping(): Promise<void>;
}

/** IF4 IBlobStore (хранилище D1): зашифрованные блобы. */
export interface IBlobStore {
  put(id: string, data: Uint8Array): Promise<void>;
  /** null, если объекта нет. */
  get(id: string): Promise<Uint8Array | null>;
  /** Удаление отсутствующего объекта — не ошибка. */
  delete(id: string): Promise<void>;
  ping(): Promise<void>;
}

/** Роли из FR-01. */
export const ROLES = ['author', 'auditor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Учётная запись (FR-01). Пароль учётной записи — не мастер-пароль заметок. */
export interface User {
  id: string;
  login: string;
  /** Argon2id в формате PHC ($argon2id$v=19$m=...). */
  passwordHash: string;
  role: Role;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

/** Хранилище учётных записей (часть K3). */
export interface IUserStore {
  /** Бросает LoginTakenError, если логин занят. */
  create(user: User): Promise<void>;
  findByLogin(login: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Сохранить счётчик неудачных попыток и блокировку. */
  updateLock(id: string, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
}

export class LoginTakenError extends Error {
  constructor() {
    super('login taken');
    this.name = 'LoginTakenError';
  }
}
