import { ApiError } from '../notes.js';

/**
 * FR-10 «Управление квотами»: максимальный размер заметки и объём на пользователя.
 * Хранятся в таблице settings; сервис держит копию в памяти (читается при каждом сохранении заметки).
 */
export interface Quotas {
  /** Максимальный размер одной заметки (текст, без тега GCM), байт. FR-10: 1–10 МБ. */
  maxNoteBytes: number;
  /** Сколько байт могут занимать все заметки одного пользователя. */
  userQuotaBytes: number;
}

export const MB = 1024 * 1024;
export const LIMITS = {
  maxNoteBytes: { min: 1 * MB, max: 10 * MB },
  userQuotaBytes: { min: 1 * MB, max: 10 * 1024 * MB },
} as const;

export const DEFAULT_QUOTAS: Quotas = { maxNoteBytes: 10 * MB, userQuotaBytes: 100 * MB };

/** Проверка значений, введённых администратором (FR-10: вне диапазона — отказ с причиной). */
export function validateQuotas(input: unknown): Quotas {
  const q = input as Partial<Record<keyof Quotas, unknown>> | null;
  const out = {} as Quotas;
  for (const key of ['maxNoteBytes', 'userQuotaBytes'] as const) {
    const v = q?.[key];
    const { min, max } = LIMITS[key];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new ApiError(400, 'BAD_QUOTA', `${key}: нужно целое число байт.`);
    }
    if (v < min || v > max) {
      throw new ApiError(400, 'BAD_QUOTA', `${key}: допустимо от ${min / MB} до ${max / MB} МБ.`);
    }
    out[key] = v;
  }
  return out;
}

export interface ISettingsStore {
  getQuotas(): Promise<Quotas | null>;
  setQuotas(q: Quotas): Promise<void>;
}

export class MemorySettingsStore implements ISettingsStore {
  quotas: Quotas | null = null;
  async getQuotas(): Promise<Quotas | null> {
    return this.quotas ? { ...this.quotas } : null;
  }
  async setQuotas(q: Quotas): Promise<void> {
    this.quotas = { ...q };
  }
}

export class SettingsService {
  private cache: Quotas | null = null;

  constructor(private readonly store: ISettingsStore) {}

  async quotas(): Promise<Quotas> {
    this.cache ??= (await this.store.getQuotas()) ?? DEFAULT_QUOTAS;
    return this.cache;
  }

  /** Сбросить копию в памяти (после восстановления из резервной копии квоты могли измениться). */
  invalidate(): void {
    this.cache = null;
  }

  async setQuotas(input: unknown): Promise<Quotas> {
    const q = validateQuotas(input);
    await this.store.setQuotas(q);
    this.cache = q;
    return q;
  }
}
