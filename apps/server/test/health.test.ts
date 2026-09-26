import { afterAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@clipboard/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const app = buildApp(loadConfig({ NODE_ENV: 'test' }));

afterAll(() => app.close());

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json()).status).toBe('ok');
  });
});
