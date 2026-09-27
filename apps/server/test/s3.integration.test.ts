import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3FileStorage } from '../src/services/storage/index.js';

/**
 * Gerçek bir S3 uyumlu sunucuya karşı çalışır (ör. docker compose ile gelen SeaweedFS).
 * `S3_TEST_ENDPOINT` tanımlı değilse atlanır.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const options = {
  endpoint: endpoint ?? '',
  region: 'us-east-1',
  bucket: `clipboard-test-${Date.now()}`,
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? 'clipboard',
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'clipboard-dev-secret',
};

describe.skipIf(!endpoint)('S3FileStorage against a real S3 server', () => {
  const storage = new S3FileStorage(options);

  beforeAll(async () => {
    const client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
    await client.send(new CreateBucketCommand({ Bucket: options.bucket }));
  });

  function put(url: string, headers: Record<string, string>, body: Uint8Array<ArrayBuffer>) {
    return fetch(url, { method: 'PUT', headers, body });
  }

  it('uploads through a presigned URL and downloads it again', async () => {
    const data = crypto.getRandomValues(new Uint8Array(1000));
    const target = await storage.uploadTarget('file-a', data.length, 60);
    const res = await put(target.url, target.headers, data);
    expect(res.status).toBe(200);
    expect(await storage.size('file-a')).toBe(1000);

    const download = await fetch(await storage.downloadUrl('file-a', 60));
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(data);
  });

  it('rejects uploads of a different size than signed', async () => {
    const target = await storage.uploadTarget('file-b', 10, 60);
    const res = await put(target.url, target.headers, new Uint8Array(11));
    expect(res.ok).toBe(false);
    expect(await storage.size('file-b')).toBeNull();
  });

  it('rejects tampered presigned URLs', async () => {
    const target = await storage.uploadTarget('file-c', 4, 60);
    const res = await put(
      target.url.replace('file-c', 'file-d'),
      target.headers,
      new Uint8Array(4),
    );
    expect(res.ok).toBe(false);
  });

  it('deletes files', async () => {
    const target = await storage.uploadTarget('file-e', 4, 60);
    await put(target.url, target.headers, new Uint8Array(4));
    await storage.delete('file-e');
    expect(await storage.size('file-e')).toBeNull();
  });

  it('reports missing files as null', async () => {
    expect(await storage.size('does-not-exist')).toBeNull();
  });
});
