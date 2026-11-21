/**
 * Счётчик в скользящем окне (FR-12, NFR-11): для каждого ключа (IP) хранит время
 * последних событий и пропускает не больше `max` за `windowMs`.
 * Хранится в памяти процесса: при нескольких серверах лимит действует на каждый отдельно
 * (для учебного монолита Sol_5 этого достаточно; общий счётчик — Redis, вне рамок проекта).
 */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly windowMs: number,
    readonly max: number,
  ) {}

  private recentHits(key: string, now: number): number[] {
    const from = now - this.windowMs;
    const list = this.hits.get(key);
    if (!list) return [];
    let i = 0;
    while (i < list.length && list[i]! <= from) i++;
    if (i > 0) list.splice(0, i);
    if (list.length === 0) this.hits.delete(key);
    return list;
  }

  /** Учесть событие. allowed=false — лимит исчерпан; retryAfterMs — когда освободится место. */
  hit(key: string, now: number): { allowed: boolean; count: number; retryAfterMs: number } {
    const list = this.recentHits(key, now);
    if (list.length >= this.max) {
      return { allowed: false, count: list.length, retryAfterMs: Math.max(0, list[0]! + this.windowMs - now) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, count: list.length, retryAfterMs: 0 };
  }

  /** Сколько событий сейчас в окне (без учёта нового). */
  count(key: string, now: number): number {
    return this.recentHits(key, now).length;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Убрать пустые и устаревшие ключи (вызывается периодически). */
  sweep(now: number): void {
    for (const key of [...this.hits.keys()]) this.recentHits(key, now);
  }

  get size(): number {
    return this.hits.size;
  }
}
