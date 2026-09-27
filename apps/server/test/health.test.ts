import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@clipboard/shared';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json()).status).toBe('ok');
  });

  it('sets security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});

describe('GET /api/health without Redis', () => {
  it('returns 503 when Redis is unreachable', async () => {
    const { Redis } = await import('ioredis');
    const { buildApp } = await import('../src/app.js');
    const { loadConfig } = await import('../src/config.js');
    const redis = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    const app = await buildApp(loadConfig({ NODE_ENV: 'test' }), { redis });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    await app.close();
    redis.disconnect();
  });
});
