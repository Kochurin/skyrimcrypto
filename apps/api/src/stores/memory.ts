import type { IBlobStore, IMetadataStore, NoteMetadata } from './types.js';

/** Хранилища в памяти — для модульных тестов. */

export class MemoryMetadataStore implements IMetadataStore {
  readonly rows = new Map<string, NoteMetadata>();

  async insert(meta: NoteMetadata): Promise<void> {
    if (this.rows.has(meta.id)) throw new Error(`duplicate id ${meta.id}`);
    this.rows.set(meta.id, { ...meta });
  }

  async findActive(id: string, now: Date): Promise<NoteMetadata | null> {
    const row = this.rows.get(id);
    return row && row.expiresAt > now ? { ...row } : null;
  }

  async ping(): Promise<void> {}
}

export class MemoryBlobStore implements IBlobStore {
  readonly objects = new Map<string, Uint8Array>();

  async put(id: string, data: Uint8Array): Promise<void> {
    this.objects.set(id, data.slice());
  }

  async get(id: string): Promise<Uint8Array | null> {
    const data = this.objects.get(id);
    return data ? data.slice() : null;
  }

  async delete(id: string): Promise<void> {
    this.objects.delete(id);
  }

  async ping(): Promise<void> {}
}
