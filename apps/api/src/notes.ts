import { randomUUID } from 'node:crypto';
import {
  CIPHER_ALGORITHM,
  FORMAT_VERSION,
  KDF_ALGORITHM,
  MAX_PLAINTEXT_BYTES,
  TAG_BYTES,
  decodePackage,
  toBase64Url,
  type EncryptedPackage,
} from '@cn/crypto';
import type { IBlobStore, IMetadataStore } from './stores/types.js';

/**
 * K2.2 Сервис заметок — процесс P3 «Сохранить и выдать зашифрованную заметку» (ЛР5, ЛР7).
 * Сервер никогда не расшифровывает: он лишь проверяет структуру пакета,
 * кладёт шифротекст в D1 (S3), заголовок — в D2 (PostgreSQL) и отдаёт обратно.
 */

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + TAG_BYTES;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Logger {
  error(obj: object, msg: string): void;
}

export interface CreatedNote {
  id: string;
  expiresAt: Date;
}

export class NotesService {
  constructor(
    private readonly metadata: IMetadataStore,
    private readonly blobs: IBlobStore,
    private readonly options: { ttlDays: number; log: Logger; now?: () => Date },
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** FR-05. Сохранение. Бросает CryptoError(INVALID_PACKAGE) на кривой пакет. */
  async create(input: unknown): Promise<CreatedNote> {
    const pkg = decodePackage(input); // строгая проверка формата, без расшифровки
    if (pkg.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      throw new ApiError(413, 'TOO_LARGE', 'Заметка больше 10 МБ.');
    }

    const id = randomUUID(); // UUID v4: 122 случайных бита, угадать нельзя
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.options.ttlDays * DAY_MS);

    // NFR-05, атомарность. Порядок: сначала блоб (F7), потом метаданные (F8).
    // Если упадёт запись блоба — в БД ничего нет, заметки не существует.
    // Если упадёт запись метаданных — удаляем уже записанный блоб.
    await this.blobs.put(id, pkg.ciphertext);
    try {
      await this.metadata.insert({
        id,
        formatVersion: FORMAT_VERSION,
        kdfAlg: pkg.header.kdf.alg,
        kdfIterations: pkg.header.kdf.iterations,
        salt: pkg.header.kdf.salt,
        cipherAlg: pkg.header.cipher.alg,
        iv: pkg.header.cipher.iv,
        sizeBytes: pkg.ciphertext.length,
        createdAt,
        expiresAt,
      });
    } catch (e) {
      await this.blobs.delete(id).catch((cleanupErr: unknown) => {
        // Блоб без метаданных недоступен читателю; его уберёт ежедневная сверка (этап 6).
        this.options.log.error({ id, err: cleanupErr }, 'не удалось удалить блоб после сбоя записи метаданных');
      });
      throw e;
    }
    return { id, expiresAt };
  }

  /** FR-07. Выдача по file_id. null — заметки нет, она удалена или истёк срок хранения. */
  async get(id: string): Promise<EncryptedPackage | null> {
    if (!UUID_RE.test(id)) return null;
    const meta = await this.metadata.findActive(id, this.now());
    if (!meta) return null;
    const blob = await this.blobs.get(id);
    if (!blob) {
      this.options.log.error({ id }, 'есть метаданные, но нет блоба');
      return null;
    }
    return {
      v: FORMAT_VERSION,
      kdf: { alg: KDF_ALGORITHM, iterations: meta.kdfIterations, salt: meta.salt },
      cipher: { alg: CIPHER_ALGORITHM, iv: meta.iv },
      ciphertext: toBase64Url(blob),
    };
  }
}
