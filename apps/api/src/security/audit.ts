import type { EventDetails, ISecurityEventStore, SecurityEvent } from './types.js';

/**
 * FR-13 «Журналирование событий без содержимого».
 * В журнал попадают время, тип, пользователь, IP и код ответа. Детали — только ключи из белого
 * списка и только короткие значения: тела запросов, пароли, токены и шифротекст сюда попасть не могут
 * даже по ошибке вызывающего кода (маскирование на входе).
 * Запись асинхронная, пачками; если БД недоступна — события остаются в буфере и пишутся повторно.
 */

/** Разрешённые ключи деталей. Всё остальное отбрасывается. */
const ALLOWED_KEYS = new Set(['login', 'noteId', 'sizeBytes', 'ttlDays', 'reason', 'until', 'path', 'method', 'role', 'retryAfterSec', 'error']);
const MAX_VALUE_LENGTH = 120;
/** Значения, похожие на секреты, не пишем даже под разрешённым ключом. */
const SECRET_LIKE = /password|passwd|secret|token|ciphertext|eyJ[A-Za-z0-9_-]{10,}/i;
const MAX_BUFFER = 10_000;

export function maskDetails(input: Record<string, unknown>): EventDetails {
  const out: EventDetails = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      if (SECRET_LIKE.test(value)) out[key] = '[скрыто]';
      else out[key] = value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
    }
  }
  return out;
}

export interface AuditLogger {
  error(obj: object, msg: string): void;
}

export class SecurityLog {
  private buffer: SecurityEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  dropped = 0;

  constructor(
    private readonly store: ISecurityEventStore,
    private readonly log: AuditLogger,
    private readonly options: { now?: () => Date; flushDelayMs?: number } = {},
  ) {}

  record(event: { type: string; ip: string; userId?: string | null; status?: number | null; details?: Record<string, unknown> }): void {
    if (this.buffer.length >= MAX_BUFFER) {
      // Переполнение (БД долго недоступна): самые старые события выбрасываем, но считаем
      this.buffer.shift();
      this.dropped++;
    }
    this.buffer.push({
      at: this.options.now?.() ?? new Date(),
      type: event.type,
      ip: event.ip,
      userId: event.userId ?? null,
      status: event.status ?? null,
      details: maskDetails(event.details ?? {}),
    });
    this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.flushDelayMs ?? 500);
    this.timer.unref?.();
  }

  /** Записать накопленное. При ошибке события возвращаются в буфер и будут записаны позже. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.flushing = this.store
      .insertMany(batch)
      .catch((err: unknown) => {
        this.buffer = [...batch, ...this.buffer].slice(-MAX_BUFFER);
        this.log.error({ err, pending: this.buffer.length }, 'журнал безопасности: запись не удалась, повтор позже');
        this.schedule();
      })
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  get pending(): number {
    return this.buffer.length;
  }
}
