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
  /** Срок хранения заметки (TTL), дней. */
  noteTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
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
  };
}
