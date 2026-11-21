/**
 * Этап 5 — защита (FR-12, FR-13, NFR-11). Хранилища: журнал событий, блокировки IP, отозванные токены.
 */

/** Детали события: только короткие несекретные значения из белого списка ключей (см. audit.ts). */
export type EventDetails = Record<string, string | number | boolean>;

/** Запись журнала безопасности (FR-13): без тел запросов, паролей, ключей и шифротекста. */
export interface SecurityEvent {
  at: Date;
  type: string;
  ip: string;
  userId: string | null;
  status: number | null;
  details: EventDetails;
}

export interface ISecurityEventStore {
  insertMany(events: SecurityEvent[]): Promise<void>;
  /** Последние события (для тестов и будущей панели аудитора). */
  recent(limit: number): Promise<SecurityEvent[]>;
  /** Удалить события старше даты (ротация журнала). Возвращает число удалённых. */
  purgeBefore(date: Date): Promise<number>;
}

/** Блокировка адреса (FR-12). */
export interface IpBlock {
  ip: string;
  until: Date;
  reason: string;
  createdAt: Date;
}

export interface IIpBlockStore {
  upsert(block: IpBlock): Promise<void>;
  remove(ip: string): Promise<void>;
  listActive(now: Date): Promise<IpBlock[]>;
}

/** Отозванные JWT (выход из учётной записи). Хранятся до истечения срока токена. */
export interface IRevokedTokenStore {
  revoke(jti: string, expiresAt: Date): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
  purgeExpired(now: Date): Promise<number>;
}
