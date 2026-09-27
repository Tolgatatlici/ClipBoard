import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { FILE_ID_BYTES } from '@clipboard/shared';
import type { FileStorage, UploadTarget } from './storage/types.js';

const fileKey = (id: string) => `file:${id}`;
const GC_KEY = 'files:gc';

/** Yükleme linkinin geçerlilik süresi. */
const UPLOAD_URL_TTL = 15 * 60;
/** İndirme linkinin geçerlilik süresi. */
const DOWNLOAD_URL_TTL = 10 * 60;
/** Tek okumalık clip açıldıktan sonra dosyanın indirilebileceği süre. */
export const BURN_DOWNLOAD_GRACE_MS = 15 * 60 * 1000;

/**
 * Dosya kayıtlarını (Redis) ve silme takvimini yönetir. Her dosya `files:gc`
 * sıralı kümesinde silinme zamanıyla durur; `sweep` vadesi gelenleri depodan siler.
 */
export class FileService {
  constructor(
    private readonly redis: Redis,
    readonly storage: FileStorage,
  ) {}

  async create(
    size: number,
    ttlSeconds: number,
  ): Promise<{ fileId: string; upload: UploadTarget }> {
    const fileId = randomBytes(FILE_ID_BYTES).toString('base64url');
    const deleteAt = Date.now() + ttlSeconds * 1000;
    await this.redis
      .multi()
      .hset(fileKey(fileId), { size: String(size), deleteAt: String(deleteAt) })
      .expireat(fileKey(fileId), Math.ceil(deleteAt / 1000))
      .zadd(GC_KEY, deleteAt, fileId)
      .exec();
    const upload = await this.storage.uploadTarget(fileId, size, UPLOAD_URL_TTL);
    return { fileId, upload };
  }

  /** Kayıtlı dosyanın beklenen boyutu; kayıt yoksa `null`. */
  async expectedSize(fileId: string): Promise<number | null> {
    const size = await this.redis.hget(fileKey(fileId), 'size');
    return size == null ? null : Number(size);
  }

  /** Dosya kayıtlı ve tamamen yüklenmişse `true`. */
  async isUploaded(fileId: string): Promise<boolean> {
    const expected = await this.expectedSize(fileId);
    return expected != null && (await this.storage.size(fileId)) === expected;
  }

  /** Dosyanın silinme zamanını ayarlar (öne ya da ileri). */
  async setDeleteAt(fileId: string, deleteAt: number): Promise<void> {
    await this.redis
      .multi()
      .hset(fileKey(fileId), 'deleteAt', String(deleteAt))
      .expireat(fileKey(fileId), Math.ceil(deleteAt / 1000))
      .zadd(GC_KEY, deleteAt, fileId)
      .exec();
  }

  /** Silinme zamanını yalnızca daha erkene çeker. */
  async deleteNoLaterThan(fileId: string, deleteAt: number): Promise<void> {
    const current = Number(await this.redis.hget(fileKey(fileId), 'deleteAt'));
    if (!current || deleteAt < current) await this.setDeleteAt(fileId, deleteAt);
  }

  async downloadUrl(fileId: string): Promise<string | null> {
    if (!(await this.redis.exists(fileKey(fileId)))) return null;
    return this.storage.downloadUrl(fileId, DOWNLOAD_URL_TTL);
  }

  /** Dosyayı hemen siler. */
  async deleteNow(fileId: string): Promise<void> {
    await this.storage.delete(fileId);
    await this.redis.multi().del(fileKey(fileId)).zrem(GC_KEY, fileId).exec();
  }

  /** Vadesi gelen dosyaları siler; silinen sayısını döner. */
  async sweep(now = Date.now()): Promise<number> {
    const due = await this.redis.zrangebyscore(GC_KEY, '-inf', now, 'LIMIT', 0, 100);
    for (const fileId of due) await this.deleteNow(fileId);
    return due.length;
  }
}
