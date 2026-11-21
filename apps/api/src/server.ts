import { buildApp } from './app.js';
import { AuthService } from './auth.js';
import { loadConfig } from './config.js';
import { NotesService } from './notes.js';
import { PostgresMetadataStore } from './stores/postgres.js';
import { S3BlobStore } from './stores/s3.js';

const config = loadConfig();

const db = PostgresMetadataStore.connect(config.databaseUrl);
const blobs = S3BlobStore.fromConfig(config.s3);
const notes = new NotesService(db, blobs, {
  ttlDays: config.noteTtlDays,
  log: { error: (o, m) => app.log.error(o, m) },
});

const app = buildApp(
  {
    notes,
    auth: new AuthService(db),
    checks: { db: () => db.ping(), s3: () => blobs.ping() },
    jwtSecret: config.jwtSecret,
    cookieSecure: config.cookieSecure,
  },
  { level: 'info' },
);

if (config.jwtSecretGenerated) {
  app.log.warn('JWT_SECRET не задан: используется случайный секрет, после перезапуска сессии сбросятся');
}

const applied = await db.migrate();
if (applied.length) app.log.info({ applied }, 'миграции применены');

// FR-09: планировщик удаляет просроченные и помеченные заметки (блоб + метаданные).
async function purge() {
  try {
    const removed = await notes.purge();
    if (removed) app.log.info({ removed }, 'очистка заметок');
  } catch (err) {
    app.log.error({ err }, 'очистка заметок не удалась');
  }
}
await purge();
const purgeTimer = setInterval(() => void purge(), config.purgeIntervalMinutes * 60_000);
purgeTimer.unref();

await app.listen({ host: config.host, port: config.port });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'остановка');
  clearInterval(purgeTimer);
  await app.close();
  await db.close();
  blobs.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
