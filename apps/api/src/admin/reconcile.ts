import type { IBlobStore, IMetadataStore } from '../stores/types.js';

/**
 * Сверка блобов (этап 6, US-04): хранилище D1 (S3) против D2 (PostgreSQL).
 *  - «сироты» — объекты в S3 без строки в БД (например, сбой компенсации при сохранении):
 *    удаляются, но только если старше GRACE — объект, который прямо сейчас сохраняется,
 *    ещё не успел получить строку в БД (сначала пишется блоб, потом метаданные);
 *  - «потерянные» — строки без объекта: восстановить нельзя (шифротекста нет), их помечаем удалёнными,
 *    чтобы список «Мои заметки» не показывал нерабочие ссылки.
 */
export const GRACE_MS = 60 * 60 * 1000;

export interface ReconcileReport {
  at: string;
  blobs: number;
  rows: number;
  orphanBlobs: string[];
  removedOrphans: number;
  youngOrphans: number;
  missingBlobs: string[];
}

export async function reconcile(metadata: IMetadataStore, blobs: IBlobStore, now = new Date()): Promise<ReconcileReport> {
  const [objects, ids] = await Promise.all([blobs.list(), metadata.allIds()]);
  const rowIds = new Set(ids);
  const blobIds = new Set(objects.map((o) => o.id));

  const orphans = objects.filter((o) => !rowIds.has(o.id));
  let removed = 0;
  let young = 0;
  for (const o of orphans) {
    if (now.getTime() - o.lastModified.getTime() < GRACE_MS) {
      young++;
      continue;
    }
    await blobs.delete(o.id);
    removed++;
  }

  const missing = ids.filter((id) => !blobIds.has(id));
  for (const id of missing) await metadata.markDeleted(id, now);

  return {
    at: now.toISOString(),
    blobs: objects.length,
    rows: ids.length,
    orphanBlobs: orphans.map((o) => o.id),
    removedOrphans: removed,
    youngOrphans: young,
    missingBlobs: missing,
  };
}
