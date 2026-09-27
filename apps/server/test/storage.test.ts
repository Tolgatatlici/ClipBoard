import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalFileStorage, S3FileStorage } from '../src/services/storage/index.js';
import { UploadSizeError } from '../src/services/storage/local.js';

const dir = mkdtempSync(join(tmpdir(), 'clipboard-storage-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const chunks = (...sizes: number[]) => Readable.from(sizes.map((size) => Buffer.alloc(size, 7)));

describe('LocalFileStorage', () => {
  const storage = new LocalFileStorage(dir, 's'.repeat(32));

  it('writes a body of exactly the expected size', async () => {
    await storage.write('exact', chunks(3, 3), 6);
    expect(await storage.size('exact')).toBe(6);
  });

  it('discards oversized bodies without writing them', async () => {
    await expect(storage.write('big', chunks(4, 4), 6)).rejects.toThrow(UploadSizeError);
    expect(await storage.size('big')).toBeNull();
  });

  it('stops reading bodies far over the limit', async () => {
    const endless = Readable.from(
      (function* () {
        for (;;) yield Buffer.alloc(64 * 1024);
      })(),
    );
    await expect(storage.write('endless', endless, 10)).rejects.toThrow(UploadSizeError);
  });

  it('rejects short bodies', async () => {
    await expect(storage.write('short', chunks(2), 6)).rejects.toThrow(UploadSizeError);
    expect(await storage.size('short')).toBeNull();
  });

  it('signs links per operation', async () => {
    const target = await storage.uploadTarget('f', 6, 60);
    const query = Object.fromEntries(new URL(target.url, 'http://x').searchParams);
    expect(storage.verify('put', 'f', query)).toBe(true);
    expect(storage.verify('get', 'f', query)).toBe(false);
    expect(storage.verify('put', 'g', query)).toBe(false);
    expect(storage.verify('put', 'f', { ...query, expires: '1' })).toBe(false);
  });
});

describe('S3FileStorage', () => {
  const storage = new S3FileStorage({
    endpoint: 'https://s3.example.com',
    region: 'auto',
    bucket: 'bucket',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });

  it('presigns uploads locked to the file size', async () => {
    const target = await storage.uploadTarget('abc', 1234, 900);
    const url = new URL(target.url);
    expect(url.pathname).toBe('/bucket/files/abc');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });

  it('presigns downloads as attachments', async () => {
    const url = new URL(await storage.downloadUrl('abc', 600));
    expect(url.pathname).toBe('/bucket/files/abc');
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
});
