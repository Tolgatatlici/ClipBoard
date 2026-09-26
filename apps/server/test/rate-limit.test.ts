import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

const ctx = useTestApp({ RATE_LIMIT_MAX: '3' });

describe('rate limiting', () => {
  it('returns 429 after the limit is reached', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/clips/ZZZZ' });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) expect(res.json()).toEqual({ error: 'rate_limited' });
    }
    expect(statuses).toEqual([404, 404, 404, 429]);
  });
});
