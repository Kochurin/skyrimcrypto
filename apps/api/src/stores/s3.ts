import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Config } from '../config.js';
import type { IBlobStore } from './types.js';

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
    const client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      forcePathStyle: true, // MinIO: http://host:9000/<bucket>/<key>
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new S3BlobStore(client, s3.bucket);
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
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(id) }));
      if (!res.Body) return null;
      return await res.Body.transformToByteArray();
    } catch (e) {
      if (e instanceof Error && (e.name === 'NoSuchKey' || e.name === 'NotFound')) return null;
      throw e;
    }
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
