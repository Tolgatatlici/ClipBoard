import { describe, expect, it } from 'vitest';
import { extractClipId, ReportStore } from '../src/services/report-store.js';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();

describe('POST /api/reports', () => {
  it('stores a report with the clip id extracted from the link', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {
        target: 'https://clip.example.com/c/ABCD#s=EFGH',
        reason: 'phishing',
        details: 'sahte banka sayfası',
      },
    });
    expect(res.statusCode).toBe(202);
    const [report] = await new ReportStore(ctx.redis).list();
    expect(report).toMatchObject({
      clipId: 'ABCD',
      reason: 'phishing',
      details: 'sahte banka sayfası',
      contact: '',
    });
  });

  it('validates the report', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { target: 'x', reason: 'spam' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('is rate limited', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/reports',
        payload: { target: 'ABCD-EFGH', reason: 'other' },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('extractClipId', () => {
  it.each([
    ['https://clip.example.com/c/ABCD#k=xyz', 'ABCD'],
    ['https://clip.example.com/c/ABCDEFGHJKMN', 'ABCDEFGHJKMN'],
    ['abcd-efgh', 'ABCD'],
    ['merhaba', null],
  ])('%s → %s', (target, expected) => {
    expect(extractClipId(target)).toBe(expected);
  });
});
