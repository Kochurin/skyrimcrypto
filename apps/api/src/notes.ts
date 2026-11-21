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
import type { IBlobStore, IMetadataStore, NoteSummary } from './stores/types.js';

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
/** Допустимые сроки хранения, дней (FR-09, параметр TTL). */
export const TTL_OPTIONS = [1, 7, 30] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_BATCH = 500;

export interface Logger {
  error(obj: object, msg: string): void;
}

export interface CreatedNote {
  id: string;
  expiresAt: Date;
}

export interface CreateOptions {
  /** Владелец (FR-05); без входа — null. */
  ownerId?: string | null;
  /** Срок хранения, дней; по умолчанию — из конфигурации. */
  ttlDays?: number;
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
  async create(input: unknown, opts: CreateOptions = {}): Promise<CreatedNote> {
    const ttlDays = opts.ttlDays ?? this.options.ttlDays;
    if (!(TTL_OPTIONS as readonly number[]).includes(ttlDays)) {
      throw new ApiError(400, 'BAD_TTL', `Срок хранения: ${TTL_OPTIONS.join(', ')} дней.`);
    }
    const pkg = decodePackage(input); // строгая проверка формата, без расшифровки
    if (pkg.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      throw new ApiError(413, 'TOO_LARGE', 'Заметка больше 10 МБ.');
    }

    const id = randomUUID(); // UUID v4: 122 случайных бита, угадать нельзя
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + ttlDays * DAY_MS);

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
        ownerId: opts.ownerId ?? null,
      });
    } catch (e) {
      await this.blobs.delete(id).catch((cleanupErr: unknown) => {
        // Блоб без метаданных недоступен читателю; его уберёт сверка блобов (этап 6).
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

  /** FR-06. Заметки владельца: только метаданные, содержимое не передаётся. */
  async list(ownerId: string): Promise<NoteSummary[]> {
    return this.metadata.listByOwner(ownerId, this.now());
  }

  /**
   * FR-09. Удаление владельцем. Сначала пометка (ссылка сразу даёт 404),
   * затем блоб, затем строка. Если S3 недоступен, строка остаётся помеченной
   * и удаление повторит очистка (purge).
   */
  async delete(id: string, userId: string): Promise<void> {
    const meta = UUID_RE.test(id) ? await this.metadata.findActive(id, this.now()) : null;
    if (!meta) throw new ApiError(404, 'NOT_FOUND', 'Заметка не найдена.');
    if (meta.ownerId !== userId) throw new ApiError(403, 'FORBIDDEN', 'Удалить можно только свою заметку.');
    await this.metadata.markDeleted(id, this.now());
    await this.removeFully(id);
  }

  /** FR-09. Очистка: удалённые и просроченные заметки. Возвращает число удалённых. */
  async purge(): Promise<number> {
    const ids = await this.metadata.listPurgeable(this.now(), PURGE_BATCH);
    let removed = 0;
    for (const id of ids) {
      if (await this.removeFully(id)) removed++;
    }
    return removed;
  }

  /** Блоб, затем строка: так не остаётся блобов без метаданных. */
  private async removeFully(id: string): Promise<boolean> {
    try {
      await this.blobs.delete(id);
    } catch (err) {
      this.options.log.error({ id, err }, 'не удалось удалить блоб; повтор при следующей очистке');
      return false;
    }
    await this.metadata.remove(id);
    return true;
  }
}
