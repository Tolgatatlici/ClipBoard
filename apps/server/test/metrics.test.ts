import { describe, expect, it } from 'vitest';
import { linkAccess, sealClip } from '@clipboard/shared';
import { useTestApp } from './helpers.js';

const TOKEN = 'metrics-token-1234567890';

describe('metrics', () => {
  const ctx = useTestApp({ METRICS_TOKEN: TOKEN });

  async function scrape() {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    return res.body;
  }

  it('requires the token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
    const wrong = await ctx.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('counts clips and opens without leaking ids', async () => {
    const sealed = await sealClip(
      { kind: 'text', format: 'plain', text: 'x' },
      { withCode: false },
    );
    await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      payload: { ...sealed.request, ttl: '1h', burnAfterRead: true },
    });
    const access = await linkAccess(sealed.key);
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${sealed.id}/open`,
      payload: { method: 'link', token: access.token },
    });

    const body = await scrape();
    expect(body).toContain(
      'clipboard_clips_created_total{kind="text",code="false",password="false",burn="true"} 1',
    );
    expect(body).toContain('clipboard_clip_opens_total{method="link",result="ok"} 1');
    expect(body).toContain('route="/api/clips/:id/open"');
    expect(body).not.toContain(sealed.id);
    expect(body).toContain('clipboard_process_');
  });
});

describe('metrics disabled', () => {
  const ctx = useTestApp();

  it('does not expose /metrics without a token configured', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Sentry scrubbing', () => {
  it('removes request, user and breadcrumb data', async () => {
    const { scrubEvent } = await import('../src/plugins/observability.js');
    const event = scrubEvent({
      type: undefined,
      message: 'boom',
      request: { url: 'https://clip.example.com/api/clips/ABCD/open', data: '{"token":"x"}' },
      user: { ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'GET /c/ABCD' }],
    });
    expect(event).toEqual({ type: undefined, message: 'boom' });
  });
});
