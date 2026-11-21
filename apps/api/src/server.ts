import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { NotesService } from './notes.js';
import { PostgresMetadataStore } from './stores/postgres.js';
import { S3BlobStore } from './stores/s3.js';

const config = loadConfig();

const metadata = PostgresMetadataStore.connect(config.databaseUrl);
const blobs = S3BlobStore.fromConfig(config.s3);

const app = buildApp(
  {
    notes: new NotesService(metadata, blobs, { ttlDays: config.noteTtlDays, log: { error: (o, m) => app.log.error(o, m) } }),
    checks: { db: () => metadata.ping(), s3: () => blobs.ping() },
  },
  { level: 'info' },
);

const applied = await metadata.migrate();
if (applied.length) app.log.info({ applied }, 'миграции применены');

await app.listen({ host: config.host, port: config.port });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'остановка');
  await app.close();
  await metadata.close();
  blobs.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
