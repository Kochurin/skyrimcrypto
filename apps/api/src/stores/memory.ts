import {
  LoginTakenError,
  type IBlobStore,
  type IMetadataStore,
  type IUserStore,
  type NoteMetadata,
  type NoteSummary,
  type User,
} from './types.js';

/** Хранилища в памяти — для модульных тестов. */

interface Row extends NoteMetadata {
  deletedAt: Date | null;
}

export class MemoryMetadataStore implements IMetadataStore {
  readonly rows = new Map<string, Row>();

  async insert(meta: NoteMetadata): Promise<void> {
    if (this.rows.has(meta.id)) throw new Error(`duplicate id ${meta.id}`);
    this.rows.set(meta.id, { ...meta, deletedAt: null });
  }

  private active(row: Row | undefined, now: Date): row is Row {
    return !!row && row.deletedAt === null && row.expiresAt > now;
  }

  async findActive(id: string, now: Date): Promise<NoteMetadata | null> {
    const row = this.rows.get(id);
    if (!this.active(row, now)) return null;
    const { deletedAt: _, ...meta } = row;
    return meta;
  }

  async listByOwner(ownerId: string, now: Date): Promise<NoteSummary[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId && this.active(r, now))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ id, sizeBytes, createdAt, expiresAt }) => ({ id, sizeBytes, createdAt, expiresAt }));
  }

  async markDeleted(id: string, now: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.deletedAt === null) row.deletedAt = now;
  }

  async listPurgeable(now: Date, limit: number): Promise<string[]> {
    return [...this.rows.values()]
      .filter((r) => r.deletedAt !== null || r.expiresAt <= now)
      .slice(0, limit)
      .map((r) => r.id);
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
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

export class MemoryUserStore implements IUserStore {
  readonly users = new Map<string, User>();

  async create(user: User): Promise<void> {
    if ([...this.users.values()].some((u) => u.login === user.login)) throw new LoginTakenError();
    this.users.set(user.id, { ...user });
  }

  async findByLogin(login: string): Promise<User | null> {
    const u = [...this.users.values()].find((x) => x.login === login);
    return u ? { ...u } : null;
  }

  async findById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async updateLock(id: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    const u = this.users.get(id);
    if (u) Object.assign(u, { failedAttempts, lockedUntil });
  }
}
