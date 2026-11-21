import type { ISnapshotSource, Snapshot } from './backup.js';
import type { MemorySettingsStore } from './settings.js';
import type { AuditReport, IAuditReportStore } from './audit-reports.js';
import type { MemoryMetadataStore, MemoryUserStore } from '../stores/memory.js';
import type { Role, User } from '../stores/types.js';

/** Снимок хранилищ в памяти — для модульных тестов резервного копирования. */
export class MemorySnapshotSource implements ISnapshotSource {
  constructor(
    private readonly metadata: MemoryMetadataStore,
    private readonly users: MemoryUserStore,
    private readonly settings: MemorySettingsStore,
  ) {}

  async exportSnapshot(): Promise<Snapshot> {
    return JSON.parse(
      JSON.stringify({
        notes: [...this.metadata.rows.values()],
        users: [...this.users.users.values()],
        quotas: this.settings.quotas,
      }),
    ) as Snapshot;
  }

  async importSnapshot(s: Snapshot): Promise<void> {
    const date = (v: unknown) => (v ? new Date(String(v)) : null);
    this.metadata.rows.clear();
    for (const r of s.notes) {
      this.metadata.rows.set(String(r.id), {
        ...(r as unknown as Parameters<MemoryMetadataStore['insert']>[0]),
        createdAt: date(r.createdAt)!,
        expiresAt: date(r.expiresAt)!,
        deletedAt: date(r.deletedAt),
      });
    }
    this.users.users.clear();
    for (const u of s.users) {
      this.users.users.set(String(u.id), {
        ...(u as unknown as User),
        role: u.role as Role,
        lockedUntil: date(u.lockedUntil),
        createdAt: date(u.createdAt)!,
      });
    }
    this.settings.quotas = s.quotas;
  }
}

export class MemoryAuditReportStore implements IAuditReportStore {
  readonly reports: AuditReport[] = [];
  async insert(r: AuditReport): Promise<void> {
    this.reports.push(r);
  }
  async list(limit: number): Promise<AuditReport[]> {
    return this.reports.slice(-limit).reverse();
  }
}
