import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// .env в корне репозитория (необязателен: по умолчанию значения совпадают с .env.example)
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Срок хранения заметки по умолчанию (TTL), дней. */
  noteTtlDays: number;
  /** Секрет подписи JWT. Если не задан — случайный на время работы процесса. */
  jwtSecret: string;
  jwtSecretGenerated: boolean;
  /** Cookie сессии только по HTTPS. */
  cookieSecure: boolean;
  /** Как часто удалять просроченные и помеченные заметки (FR-09), минут. */
  purgeIntervalMinutes: number;
  /**
   * Сколько прокси перед сервером (Caddy — 1). IP клиента берётся из X-Forwarded-For,
   * но только из записи, добавленной этими прокси: подделанный клиентом заголовок не поможет обойти лимиты.
   */
  trustProxy: number;
  /** FR-12 / NFR-11: лимиты и блокировки. */
  guard: {
    perMinute: number;
    authPerMinute: number;
    notFoundMax: number;
    notFoundWindowMin: number;
    blockHours: number;
    allowlist: string[];
  };
  /** Сколько дней хранить журнал безопасности (FR-13, ротация). */
  securityLogDays: number;
  /** FR-11, NFR-07: бакет копий, как часто делать (RPO 24 ч) и сколько хранить. */
  backup: { bucket: string; intervalHours: number; keep: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // В продакшене случайный секрет недопустим: при каждом перезапуске все сессии бы сбрасывались,
  // а при нескольких экземплярах токены одного не принимал бы другой.
  if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET обязателен в продакшене (не короче 32 символов)');
  }
  return {
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.API_PORT ?? 8787),
    databaseUrl: env.DATABASE_URL ?? 'postgres://notepad:change-me-local@localhost:5432/notepad',
    s3: {
      endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: env.S3_REGION ?? 'us-east-1',
      bucket: env.S3_BUCKET ?? 'notes',
      accessKeyId: env.S3_ACCESS_KEY ?? env.MINIO_ROOT_USER ?? 'notepad',
      secretAccessKey: env.S3_SECRET_KEY ?? env.MINIO_ROOT_PASSWORD ?? 'change-me-local-minio',
    },
    noteTtlDays: Number(env.NOTE_TTL_DAYS ?? 30),
    jwtSecret: env.JWT_SECRET || randomBytes(32).toString('base64url'),
    jwtSecretGenerated: !env.JWT_SECRET,
    cookieSecure: env.COOKIE_SECURE === 'true',
    purgeIntervalMinutes: Number(env.PURGE_INTERVAL_MINUTES ?? 60),
    trustProxy: Number(env.TRUST_PROXY_HOPS ?? 0),
    guard: {
      perMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 60),
      authPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 20),
      notFoundMax: Number(env.NOT_FOUND_MAX ?? 100),
      notFoundWindowMin: Number(env.NOT_FOUND_WINDOW_MIN ?? 10),
      blockHours: Number(env.BLOCK_HOURS ?? 24),
      allowlist: (env.IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    securityLogDays: Number(env.SECURITY_LOG_DAYS ?? 180),
    backup: {
      bucket: env.BACKUP_BUCKET ?? 'notes-backups',
      intervalHours: Number(env.BACKUP_INTERVAL_HOURS ?? 24),
      keep: Number(env.BACKUP_KEEP ?? 7),
    },
  };
}
