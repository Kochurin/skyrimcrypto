import { buildApp } from './app.js';
import { AuthService } from './auth.js';
import { loadConfig } from './config.js';
import { NotesService } from './notes.js';
import { SecurityLog } from './security/audit.js';
import { SecurityGuard } from './security/guard.js';
import { PostgresMetadataStore } from './stores/postgres.js';
import { S3BackupStorage, S3BlobStore } from './stores/s3.js';
import { BackupService } from './admin/backup.js';
import { reconcile } from './admin/reconcile.js';
import { SettingsService } from './admin/settings.js';

const config = loadConfig();

const db = PostgresMetadataStore.connect(config.databaseUrl);
const securityStore = db.security();
const blobs = S3BlobStore.fromConfig(config.s3);
const errorLog = { error: (o: object, m: string) => app.log.error(o, m) };
const settings = new SettingsService(db);
const notes = new NotesService(db, blobs, { ttlDays: config.noteTtlDays, log: errorLog, quotas: () => settings.quotas() });
const backupStorage = S3BackupStorage.fromConfig(config.s3, config.backup.bucket);
const backups = new BackupService(db, blobs, backupStorage, { keep: config.backup.keep, log: errorLog });
const audit = new SecurityLog(securityStore, errorLog);
const guard = new SecurityGuard(securityStore, audit, config.guard);

const app = buildApp(
  {
    notes,
    auth: new AuthService(db),
    checks: { db: () => db.ping(), s3: () => blobs.ping() },
    jwtSecret: config.jwtSecret,
    cookieSecure: config.cookieSecure,
    trustProxy: config.trustProxy,
    security: { guard, audit, revoked: securityStore },
    admin: {
      settings,
      backups,
      reconcile: () => reconcile(db, blobs),
      metadata: db,
      users: db,
      events: securityStore,
      reports: securityStore,
    },
  },
  { level: 'info' },
);

if (config.jwtSecretGenerated) {
  app.log.warn('JWT_SECRET не задан: используется случайный секрет, после перезапуска сессии сбросятся');
}

const applied = await db.migrate();
if (applied.length) app.log.info({ applied }, 'миграции применены');
await guard.init();

// FR-09: планировщик удаляет просроченные и помеченные заметки (блоб + метаданные);
// заодно чистит отозванные токены с истёкшим сроком и старые записи журнала (FR-13, ротация).
async function housekeeping() {
  try {
    const removed = await notes.purge();
    if (removed) app.log.info({ removed }, 'очистка заметок');
    await securityStore.purgeExpired(new Date());
    await securityStore.purgeBefore(new Date(Date.now() - config.securityLogDays * 86_400_000));
    guard.sweep();
  } catch (err) {
    app.log.error({ err }, 'плановая очистка не удалась');
  }
  // FR-11 / NFR-07: копия не реже раза в BACKUP_INTERVAL_HOURS (RPO 24 ч); сверка блобов — вместе с ней
  try {
    const last = await backups.lastOk();
    if (!last || Date.now() - last.getTime() >= config.backup.intervalHours * 3_600_000) {
      const manifest = await backups.create();
      audit.record({ type: manifest.status === 'ok' ? 'backup.created' : 'backup.failed', ip: 'scheduler', details: { reason: manifest.id } });
      const report = await reconcile(db, blobs);
      if (report.orphanBlobs.length || report.missingBlobs.length) {
        audit.record({ type: 'admin.reconcile', ip: 'scheduler', details: { reason: `сирот ${report.orphanBlobs.length}, потеряно ${report.missingBlobs.length}` } });
      }
    }
  } catch (err) {
    audit.record({ type: 'backup.failed', ip: 'scheduler', details: { reason: err instanceof Error ? err.message : 'ошибка' } });
    app.log.error({ err }, 'резервное копирование не удалось');
  }
}
await housekeeping();
const timer = setInterval(() => void housekeeping(), config.purgeIntervalMinutes * 60_000);
timer.unref();
const sweepTimer = setInterval(() => guard.sweep(), 60_000);
sweepTimer.unref();

await app.listen({ host: config.host, port: config.port });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'остановка');
  clearInterval(timer);
  clearInterval(sweepTimer);
  await app.close();
  await audit.flush(); // не терять события журнала при остановке
  await db.close();
  blobs.close();
  backupStorage.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
