import { createHash, randomUUID } from 'node:crypto';
import type { Quotas } from './settings.js';
import type { IBlobStore } from '../stores/types.js';

/**
 * FR-11 «Резервное копирование», NFR-07 (RPO 24 ч), US-04.
 * Копия = снимок таблиц (заметки, пользователи, квоты) + копии всех блобов + манифест с SHA-256.
 * После записи каждый объект перечитывается и сверяется с контрольной суммой; при расхождении —
 * одна повторная запись, затем копия помечается failed (и администратору уходит событие в журнал).
 * Восстановление сначала проверяет все контрольные суммы и только потом меняет живые данные.
 * Шифротекст копируется как есть — копии так же бесполезны без паролей, как и основное хранилище.
 */

/** Снимок БД: строки как в таблицах, даты строками ISO. */
export interface Snapshot {
  notes: Record<string, unknown>[];
  users: Record<string, unknown>[];
  quotas: Quotas | null;
}

export interface ISnapshotSource {
  exportSnapshot(): Promise<Snapshot>;
  /** Заменить заметки, пользователей и квоты содержимым снимка (одной транзакцией). */
  importSnapshot(s: Snapshot): Promise<void>;
}

/** Куда складываются копии (отдельный бакет S3). */
export interface IBackupStorage {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Ключи с префиксом. */
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  status: 'ok' | 'failed';
  notes: number;
  users: number;
  bytes: number;
  db: { sha256: string };
  blobs: Record<string, string>;
  /** Объекты, не прошедшие проверку даже после повтора. */
  failed: string[];
}

export interface RestoreReport {
  id: string;
  notes: number;
  users: number;
  blobs: number;
}

const sha256 = (d: Uint8Array) => createHash('sha256').update(d).digest('hex');
const enc = new TextEncoder();
const dec = new TextDecoder();

export class BackupService {
  constructor(
    private readonly source: ISnapshotSource,
    private readonly blobs: IBlobStore,
    private readonly storage: IBackupStorage,
    private readonly options: { keep: number; now?: () => Date; log: { error(o: object, m: string): void } },
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Записать объект и убедиться, что он читается обратно с той же суммой (до двух попыток). */
  private async putVerified(key: string, data: Uint8Array, sum: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.storage.put(key, data);
        const back = await this.storage.get(key);
        if (back && sha256(back) === sum) return true;
      } catch (err) {
        this.options.log.error({ key, err, attempt }, 'резервная копия: запись объекта не удалась');
      }
    }
    return false;
  }

  async create(): Promise<BackupManifest> {
    const createdAt = this.now();
    const id = `${createdAt.toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
    const snapshot = await this.source.exportSnapshot();
    const dbBytes = enc.encode(JSON.stringify(snapshot));
    const manifest: BackupManifest = {
      id,
      createdAt: createdAt.toISOString(),
      status: 'ok',
      notes: snapshot.notes.length,
      users: snapshot.users.length,
      bytes: dbBytes.byteLength,
      db: { sha256: sha256(dbBytes) },
      blobs: {},
      failed: [],
    };

    if (!(await this.putVerified(`${id}/db.json`, dbBytes, manifest.db.sha256))) manifest.failed.push('db.json');

    for (const row of snapshot.notes) {
      const noteId = String(row.id);
      const data = await this.blobs.get(noteId);
      if (!data) continue; // строки без блоба — дело сверки, не копии
      const sum = sha256(data);
      if (await this.putVerified(`${id}/blobs/${noteId}`, data, sum)) {
        manifest.blobs[noteId] = sum;
        manifest.bytes += data.byteLength;
      } else {
        manifest.failed.push(noteId);
      }
    }

    if (manifest.failed.length) manifest.status = 'failed';
    await this.storage.put(`${id}/manifest.json`, enc.encode(JSON.stringify(manifest)));
    await this.prune();
    return manifest;
  }

  async list(): Promise<BackupManifest[]> {
    const keys = (await this.storage.list('')).filter((k) => k.endsWith('/manifest.json'));
    const out: BackupManifest[] = [];
    for (const key of keys) {
      const data = await this.storage.get(key);
      if (data) out.push(JSON.parse(dec.decode(data)) as BackupManifest);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Хранить только `keep` последних удачных копий. */
  private async prune(): Promise<void> {
    const all = await this.list();
    const ok = all.filter((m) => m.status === 'ok');
    for (const old of ok.slice(this.options.keep)) await this.storage.deletePrefix(`${old.id}/`);
  }

  async restore(id: string): Promise<RestoreReport> {
    const manifestBytes = await this.storage.get(`${id}/manifest.json`);
    if (!manifestBytes) throw new Error('Копия не найдена');
    const manifest = JSON.parse(dec.decode(manifestBytes)) as BackupManifest;
    if (manifest.status !== 'ok') throw new Error('Копия помечена как неудачная — восстанавливать из неё нельзя');

    // 1. Всё проверяем ДО изменения живых данных
    const dbBytes = await this.storage.get(`${id}/db.json`);
    if (!dbBytes || sha256(dbBytes) !== manifest.db.sha256) throw new Error('Снимок БД повреждён (контрольная сумма не сошлась)');
    const blobs = new Map<string, Uint8Array>();
    for (const [noteId, sum] of Object.entries(manifest.blobs)) {
      const data = await this.storage.get(`${id}/blobs/${noteId}`);
      if (!data || sha256(data) !== sum) throw new Error(`Блоб ${noteId} в копии повреждён`);
      blobs.set(noteId, data);
    }

    // 2. Сначала блобы, потом строки (как при обычном сохранении): строк без блобов не появится
    for (const [noteId, data] of blobs) await this.blobs.put(noteId, data);
    const snapshot = JSON.parse(dec.decode(dbBytes)) as Snapshot;
    await this.source.importSnapshot(snapshot);
    return { id, notes: snapshot.notes.length, users: snapshot.users.length, blobs: blobs.size };
  }

  /** Время последней удачной копии (для планировщика: RPO 24 ч). */
  async lastOk(): Promise<Date | null> {
    const ok = (await this.list()).find((m) => m.status === 'ok');
    return ok ? new Date(ok.createdAt) : null;
  }
}

export class MemoryBackupStorage implements IBackupStorage {
  readonly objects = new Map<string, Uint8Array>();
  corrupt = new Set<string>();

  async put(key: string, data: Uint8Array): Promise<void> {
    const copy = data.slice();
    if (this.corrupt.has(key) && copy.length) copy[0] = copy[0]! ^ 0xff; // имитация битой записи
    this.objects.set(key, copy);
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.slice() ?? null;
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }
  async deletePrefix(prefix: string): Promise<void> {
    for (const k of [...this.objects.keys()]) if (k.startsWith(prefix)) this.objects.delete(k);
  }
}
