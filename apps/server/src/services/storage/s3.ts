import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileStorage, UploadTarget } from './types.js';

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3 uyumlu depolama (Cloudflare R2, MinIO, AWS). Tarayıcı presigned URL ile doğrudan yükler. */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  private key(fileId: string) {
    return `files/${fileId}`;
  }

  async uploadTarget(fileId: string, size: number, expiresIn: number): Promise<UploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: this.key(fileId),
      ContentLength: size,
      ContentType: 'application/octet-stream',
    });
    // Content-Length imzaya dahil edilir; farklı boyutta yükleme reddedilir.
    const url = await getSignedUrl(this.client, command, {
      expiresIn,
      signableHeaders: new Set(['content-length', 'content-type']),
    });
    return { url, headers: { 'Content-Type': 'application/octet-stream' } };
  }

  async downloadUrl(fileId: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: this.key(fileId),
      ResponseContentType: 'application/octet-stream',
      ResponseContentDisposition: 'attachment',
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async size(fileId: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.key(fileId) }),
      );
      return head.ContentLength ?? null;
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async delete(fileId: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(fileId) }),
    );
  }
}
