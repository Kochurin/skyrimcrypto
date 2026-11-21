/**
 * Интерфейсы хранилищ из компонентной диаграммы ЛР7.
 * IF3 IMetadataStore — реализует K3 (PostgreSQL), IF4 IBlobStore — реализует K4 (MinIO / S3).
 * Сервис заметок зависит только от этих интерфейсов, поэтому хранилище можно заменить,
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
}

/** IF3 IMetadataStore (хранилище D2). */
export interface IMetadataStore {
  insert(meta: NoteMetadata): Promise<void>;
  /** Заметка, срок хранения которой ещё не истёк; иначе null. */
  findActive(id: string, now: Date): Promise<NoteMetadata | null>;
  ping(): Promise<void>;
}

/** IF4 IBlobStore (хранилище D1): зашифрованные блобы. */
export interface IBlobStore {
  put(id: string, data: Uint8Array): Promise<void>;
  /** null, если объекта нет. */
  get(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
  ping(): Promise<void>;
}
