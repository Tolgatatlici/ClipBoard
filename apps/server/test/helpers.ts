import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalFileStorage } from '../src/services/storage/index.js';

/** Testler ayrı bir Redis veritabanı (15) kullanır ve her testten önce onu temizler. */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export function useTestApp(env: Record<string, string> = {}) {
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  const storageDir = mkdtempSync(join(tmpdir(), 'clipboard-test-'));
  const storage = new LocalFileStorage(storageDir, 'test-secret-'.padEnd(40, 'x'));
  let app: FastifyInstance;
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  const ready = buildApp(config, { redis, storage }).then((built) => {
    app = built;
    return built;
  });

  beforeEach(async () => {
    await ready;
    await redis.flushdb();
  });

  afterAll(async () => {
    await (await ready).close();
    await redis.quit();
    rmSync(storageDir, { recursive: true, force: true });
  });

  return {
    redis,
    storage,
    get app() {
      return app;
    },
  };
}
