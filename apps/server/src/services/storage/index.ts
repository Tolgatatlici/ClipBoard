import { randomBytes } from 'node:crypto';
import type { Config } from '../../config.js';
import { LocalFileStorage } from './local.js';
import { S3FileStorage } from './s3.js';
import type { FileStorage } from './types.js';

export function createStorage(config: Config): FileStorage {
  if (config.STORAGE_DRIVER === 's3') {
    return new S3FileStorage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  }
  return new LocalFileStorage(
    config.STORAGE_DIR,
    config.FILE_SIGNING_SECRET ?? randomBytes(32).toString('base64url'),
  );
}

export { LocalFileStorage } from './local.js';
export { S3FileStorage } from './s3.js';
export type { FileStorage, UploadTarget } from './types.js';
