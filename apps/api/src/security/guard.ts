import { ApiError } from '../notes.js';
import type { SecurityLog } from './audit.js';
import { SlidingWindow } from './limiter.js';
import type { IIpBlockStore } from './types.js';

/**
 * FR-12 «Ограничение частоты запросов и блокировка IP», NFR-11, US-05.
 *  - общий лимит: не больше `perMinute` запросов к API в минуту с одного IP (NFR-11: 60) → 429;
 *  - вход и регистрация — отдельный, более строгий лимит (перебор паролей);
 *  - больше `notFoundMax` ответов 404 на /api/notes/:id за `notFoundWindowMin` минут (перебор file_id)
 *    → адрес блокируется на `blockHours` часов (FR-12: 100 за 10 мин → 24 ч), ответ 403;
 *  - адреса из белого списка не блокируются (FR-12: «блокировка отклоняется»).
 */
export interface GuardOptions {
  perMinute: number;
  authPerMinute: number;
  notFoundMax: number;
  notFoundWindowMin: number;
  blockHours: number;
  allowlist: string[];
  now?: () => Date;
}

export const DEFAULT_GUARD: GuardOptions = {
  perMinute: 60,
  authPerMinute: 20,
  notFoundMax: 100,
  notFoundWindowMin: 10,
  blockHours: 24,
  allowlist: [],
};

const AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/register']);
const NOTE_ID_PATH = /^\/api\/notes\/[^/?]+/;

export class SecurityGuard {
  private readonly general: SlidingWindow;
  private readonly auth: SlidingWindow;
  private readonly notFound: SlidingWindow;
  /** Активные блокировки: ip → до какого времени. Копия таблицы ip_blocks в памяти. */
  private readonly blocked = new Map<string, Date>();
  private readonly allow: Set<string>;
  /** Когда для адреса последний раз писали rate.limited: не чаще раза в минуту (иначе атакующий заливает журнал). */
  private readonly lastLimitedLog = new Map<string, number>();

  constructor(
    private readonly store: IIpBlockStore,
    private readonly audit: SecurityLog,
    readonly options: GuardOptions = DEFAULT_GUARD,
  ) {
    this.general = new SlidingWindow(60_000, options.perMinute);
    this.auth = new SlidingWindow(60_000, options.authPerMinute);
    this.notFound = new SlidingWindow(options.notFoundWindowMin * 60_000, options.notFoundMax);
    this.allow = new Set(options.allowlist);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Загрузить действующие блокировки из БД (при старте сервера). */
  async init(): Promise<void> {
    for (const b of await this.store.listActive(this.now())) this.blocked.set(b.ip, b.until);
  }

  isBlocked(ip: string): boolean {
    const until = this.blocked.get(ip);
    if (!until) return false;
    if (until <= this.now()) {
      this.blocked.delete(ip);
      return false;
    }
    return true;
  }

  /** Проверка перед обработкой запроса. Бросает ApiError 403 / 429. */
  check(ip: string, method: string, path: string): void {
    if (!path.startsWith('/api/') || path === '/api/health') return;
    if (this.isBlocked(ip)) {
      throw new ApiError(403, 'BLOCKED', 'Доступ с вашего адреса временно ограничен.');
    }
    const now = this.now().getTime();
    const limiter = method === 'POST' && AUTH_PATHS.has(path) ? this.auth : this.general;
    const general = this.general.hit(ip, now);
    const result = limiter === this.general ? general : this.auth.hit(ip, now);
    if (!general.allowed || !result.allowed) {
      const retryAfterSec = Math.ceil(Math.max(general.retryAfterMs, result.retryAfterMs) / 1000) || 1;
      const last = this.lastLimitedLog.get(ip) ?? 0;
      if (now - last >= 60_000) {
        this.lastLimitedLog.set(ip, now);
        this.audit.record({ type: 'rate.limited', ip, status: 429, details: { path, method, retryAfterSec } });
      }
      const err = new ApiError(429, 'RATE_LIMITED', `Слишком много запросов. Повторите через ${retryAfterSec} с.`);
      (err as ApiError & { retryAfterSec?: number }).retryAfterSec = retryAfterSec;
      throw err;
    }
  }

  /** Учёт ответа: 404 на выдаче заметки считаются попыткой перебора file_id. */
  async observe(ip: string, method: string, path: string, status: number): Promise<void> {
    if (status !== 404 || method !== 'GET' || !NOTE_ID_PATH.test(path)) return;
    const now = this.now().getTime();
    const r = this.notFound.hit(ip, now);
    if (r.allowed) return;
    if (this.allow.has(ip)) {
      this.audit.record({ type: 'ip.block_skipped', ip, status, details: { reason: 'allowlist' } });
      this.notFound.reset(ip);
      return;
    }
    await this.block(ip, this.options.blockHours, `больше ${this.options.notFoundMax} ответов 404 за ${this.options.notFoundWindowMin} мин`);
    this.notFound.reset(ip);
  }

  /** Заблокировать адрес (автоматически или — на этапе 6 — администратором). */
  async block(ip: string, hours: number, reason: string): Promise<void> {
    if (this.allow.has(ip)) throw new ApiError(400, 'ALLOWLISTED', 'Адрес в белом списке — блокировка отклонена.');
    const now = this.now();
    const until = new Date(now.getTime() + hours * 3_600_000);
    this.blocked.set(ip, until);
    try {
      await this.store.upsert({ ip, until, reason, createdAt: now });
    } catch (err) {
      // FR-12: «ошибка записи правила — блокировка не применяется»
      this.blocked.delete(ip);
      throw err;
    }
    this.audit.record({ type: 'ip.blocked', ip, details: { reason, until: until.toISOString() } });
  }

  async unblock(ip: string): Promise<void> {
    await this.store.remove(ip);
    this.blocked.delete(ip);
    this.notFound.reset(ip);
    this.audit.record({ type: 'ip.unblocked', ip });
  }

  /** Периодическая уборка счётчиков (память не растёт от разовых посетителей). */
  sweep(): void {
    const now = this.now().getTime();
    this.general.sweep(now);
    this.auth.sweep(now);
    this.notFound.sweep(now);
    for (const [ip, at] of this.lastLimitedLog) if (now - at >= 60_000) this.lastLimitedLog.delete(ip);
  }
}
