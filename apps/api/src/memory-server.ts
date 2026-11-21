import { buildApp } from './app.js';
import { AuthService } from './auth.js';
import { NotesService } from './notes.js';
import { MemoryBlobStore, MemoryMetadataStore, MemoryUserStore } from './stores/memory.js';
import { SecurityLog } from './security/audit.js';
import { DEFAULT_GUARD, SecurityGuard } from './security/guard.js';
import { MemoryIpBlockStore, MemoryRevokedTokenStore, MemorySecurityEventStore } from './security/memory.js';
import { BackupService, MemoryBackupStorage } from './admin/backup.js';
import { MemoryAuditReportStore, MemorySnapshotSource } from './admin/memory.js';
import { reconcile } from './admin/reconcile.js';
import { MemorySettingsStore, SettingsService } from './admin/settings.js';

/**
 * Сервер API на хранилищах в памяти — для e2e-тестов в браузерах (этап 7).
 * Без PostgreSQL и MinIO: каждый запуск начинается с чистого листа.
 * Лимиты запросов по умолчанию щедрые: все тесты идут с одного адреса 127.0.0.1.
 * Не для продакшена: данные пропадают при остановке.
 */
const env = process.env;
const port = Number(env.API_PORT ?? 8788);
const log = { error: (obj: object, msg: string) => console.error(msg, obj) };

const metadata = new MemoryMetadataStore();
const blobs = new MemoryBlobStore();
const users = new MemoryUserStore();
const settingsStore = new MemorySettingsStore();
const settings = new SettingsService(settingsStore);
const notes = new NotesService(metadata, blobs, { ttlDays: 30, log, quotas: () => settings.quotas() });
const backups = new BackupService(new MemorySnapshotSource(metadata, users, settingsStore), blobs, new MemoryBackupStorage(), { keep: 3, log });
const events = new MemorySecurityEventStore();
const revoked = new MemoryRevokedTokenStore();
const audit = new SecurityLog(events, log);
const guard = new SecurityGuard(new MemoryIpBlockStore(), audit, {
  ...DEFAULT_GUARD,
  perMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 100_000),
  authPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 100_000),
});

const app = buildApp(
  {
    notes,
    auth: new AuthService(users),
    checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
    jwtSecret: env.JWT_SECRET || 'memory-server-secret-not-for-production',
    security: { guard, audit, revoked },
    admin: { settings, backups, reconcile: () => reconcile(metadata, blobs), metadata, users, events, reports: new MemoryAuditReportStore() },
  },
  { level: env.LOG_LEVEL ?? 'warn' },
);

await app.listen({ host: '127.0.0.1', port });
console.log(`API в памяти: http://127.0.0.1:${port}`);
