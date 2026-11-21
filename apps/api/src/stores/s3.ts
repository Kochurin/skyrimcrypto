import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { IBackupStorage } from '../admin/backup.js';
import type { Config } from '../config.js';
import type { BlobInfo, IBlobStore } from './types.js';

/** Все ключи с префиксом (постранично, по 1000). */
async function listAll(client: S3Client, bucket: string, prefix: string): Promise<{ key: string; size: number; modified: Date }[]> {
  const out: { key: string; size: number; modified: Date }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified ?? new Date(0) });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

function makeClient(s3: Config['s3']): S3Client {
  return new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: true, // MinIO: http://host:9000/<bucket>/<key>
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function getBytes(client: S3Client, bucket: string, key: string): Promise<Uint8Array | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToByteArray();
  } catch (e) {
    if (e instanceof Error && (e.name === 'NoSuchKey' || e.name === 'NotFound')) return null;
    throw e;
  }
}

/**
 * K4 Файловое хранилище (MinIO или любой S3), реализует IF4 IBlobStore.
 * Хранит только шифротекст; ключ объекта — notes/<file_id>.
 */
export class S3BlobStore implements IBlobStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromConfig(s3: Config['s3']): S3BlobStore {
    return new S3BlobStore(makeClient(s3), s3.bucket);
  }

  private key(id: string): string {
    return `notes/${id}`;
  }

  async put(id: string, data: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(id),
        Body: data,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async get(id: string): Promise<Uint8Array | null> {
    return getBytes(this.client, this.bucket, this.key(id));
  }

  async list(): Promise<BlobInfo[]> {
    return (await listAll(this.client, this.bucket, 'notes/')).map((o) => ({
      id: o.key.slice('notes/'.length),
      size: o.size,
      lastModified: o.modified,
    }));
  }

  async delete(id: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(id) }));
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  close(): void {
    this.client.destroy();
  }
}

/**
 * FR-11: резервные копии — в отдельном бакете (BACKUP_BUCKET). В продакшене это должен быть
 * другой сервер или облако: копия на том же диске не спасёт от его потери.
 */
export class S3BackupStorage implements IBackupStorage {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromConfig(s3: Config['s3'], bucket: string): S3BackupStorage {
    return new S3BackupStorage(makeClient(s3), bucket);
  }

  /** Создать бакет при первом обращении, если его нет. */
  private ensureBucket(): Promise<void> {
    this.ready ??= this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => undefined)
      .catch(async () => {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      })
      .catch((e: unknown) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'application/octet-stream' }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    await this.ensureBucket();
    return getBytes(this.client, this.bucket, key);
  }

  async list(prefix: string): Promise<string[]> {
    await this.ensureBucket();
    return (await listAll(this.client, this.bucket, prefix)).map((o) => o.key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }),
      );
    }
  }

  close(): void {
    this.client.destroy();
  }
}
