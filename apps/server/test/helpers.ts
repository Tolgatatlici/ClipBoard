import { Redis } from 'ioredis';
import { afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** Testler ayrı bir Redis veritabanı (15) kullanır ve her testten önce onu temizler. */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export function useTestApp(env: Record<string, string> = {}) {
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  let app: FastifyInstance;
  const ready = buildApp(loadConfig({ NODE_ENV: 'test', ...env }), { redis }).then((built) => {
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
  });

  return {
    redis,
    get app() {
      return app;
    },
  };
}
