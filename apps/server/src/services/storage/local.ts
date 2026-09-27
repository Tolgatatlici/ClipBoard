import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { Readable } from 'node:stream';
import type { FileStorage, UploadTarget } from './types.js';

export type BlobOperation = 'put' | 'get';

export class UploadSizeError extends Error {}

/** Beklenenden büyük yüklemelerde en fazla bu kadar fazlalık tüketilir. */
const MAX_DISCARD_BYTES = 1024 * 1024;

/**
 * Dosyaları sunucu diskinde saklar. Yükleme ve indirme, sunucunun kendi
 * `/api/files/:id/blob` ucundan HMAC ile imzalanmış süreli linklerle yapılır.
 * Geliştirme ve tek sunuculu kurulumlar içindir; üretimde S3 önerilir.
 */
export class LocalFileStorage implements FileStorage {
  constructor(
    private readonly dir: string,
    private readonly secret: string,
  ) {}

  private path(fileId: string) {
    return join(this.dir, fileId);
  }

  private sign(op: BlobOperation, fileId: string, size: number, expires: number) {
    return createHmac('sha256', this.secret)
      .update(`${op}:${fileId}:${size}:${expires}`)
      .digest('base64url');
  }

  private signedUrl(op: BlobOperation, fileId: string, size: number, expiresIn: number) {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const params = new URLSearchParams({
      size: String(size),
      expires: String(expires),
      sig: this.sign(op, fileId, size, expires),
    });
    return `/api/files/${fileId}/blob?${params}`;
  }

  /** İmzalı linkin parametrelerini doğrular. */
  verify(op: BlobOperation, fileId: string, query: Record<string, string | undefined>): boolean {
    const size = Number(query.size);
    const expires = Number(query.expires);
    if (!Number.isInteger(size) || !Number.isInteger(expires) || !query.sig) return false;
    if (expires < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(op, fileId, size, expires));
    const actual = Buffer.from(query.sig);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async uploadTarget(fileId: string, size: number, expiresIn: number): Promise<UploadTarget> {
    return {
      url: this.signedUrl('put', fileId, size, expiresIn),
      headers: { 'Content-Type': 'application/octet-stream' },
    };
  }

  async downloadUrl(fileId: string, expiresIn: number): Promise<string> {
    const size = (await this.size(fileId)) ?? 0;
    return this.signedUrl('get', fileId, size, expiresIn);
  }

  /**
   * Gövdeyi tam olarak `size` bayt ise kaydeder; aksi halde `UploadSizeError` fırlatır.
   * Fazla gelen veri yazılmadan tüketilir ki sunucu bağlantıyı koparmadan 400 dönebilsin;
   * fazlalık da çok büyükse akış kesilir.
   */
  async write(fileId: string, body: Readable, size: number): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.path(fileId)}.${process.pid}.${Date.now()}.part`;
    const out = createWriteStream(tmp, { flags: 'wx' });
    let received = 0;
    try {
      for await (const chunk of body as AsyncIterable<Buffer>) {
        received += chunk.length;
        if (received > size + MAX_DISCARD_BYTES) {
          body.destroy();
          break;
        }
        if (received > size) continue;
        if (!out.write(chunk)) await once(out, 'drain');
      }
      out.end();
      await once(out, 'close');
      if (received !== size) throw new UploadSizeError('Upload size mismatch');
      await rename(tmp, this.path(fileId));
    } catch (err) {
      out.destroy();
      await rm(tmp, { force: true });
      throw err;
    }
  }

  read(fileId: string): Readable {
    return createReadStream(this.path(fileId));
  }

  async size(fileId: string): Promise<number | null> {
    try {
      return (await stat(this.path(fileId))).size;
    } catch {
      return null;
    }
  }

  async delete(fileId: string): Promise<void> {
    await rm(this.path(fileId), { force: true });
  }
}
