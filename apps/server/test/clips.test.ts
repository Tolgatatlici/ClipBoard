import { describe, expect, it } from 'vitest';
import {
  codeAccess,
  createClipResponseSchema,
  linkAccess,
  MAX_CODE_ATTEMPTS,
  openClip,
  openClipResponseSchema,
  sealClip,
  type ClipAccess,
  type ClipContent,
  type TtlOption,
} from '@clipboard/shared';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();

const content = (text: string): ClipContent => ({ kind: 'text', format: 'plain', text });
const sealText = (text: string, options: { withCode: boolean; password?: string }) =>
  sealClip(content(text), options);

async function createClip(
  text: string,
  options: { withCode?: boolean; ttl?: TtlOption; burnAfterRead?: boolean; password?: string } = {},
) {
  const sealed = await sealText(text, {
    withCode: options.withCode ?? true,
    password: options.password,
  });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/clips',
    payload: {
      ...sealed.request,
      ttl: options.ttl ?? '1h',
      burnAfterRead: options.burnAfterRead ?? false,
    },
  });
  expect(res.statusCode).toBe(201);
  return { sealed, created: createClipResponseSchema.parse(res.json()) };
}

function open(id: string, access: Pick<ClipAccess, 'method' | 'token'>) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/clips/${id}/open`,
    payload: { method: access.method, token: access.token },
  });
}

const wrongToken = (method: 'link' | 'code') => ({ method, token: 'A'.repeat(43) });

describe('POST /api/clips', () => {
  it('stores only ciphertext and hashed tokens', async () => {
    const { sealed, created } = await createClip('super secret text');
    expect(created.id).toBe(sealed.id);

    const stored = await ctx.redis.hgetall(`clip:${sealed.id}`);
    const dump = JSON.stringify(stored);
    expect(dump).not.toContain('super secret');
    expect(dump).not.toContain(sealed.key);
    expect(dump).not.toContain(sealed.request.linkToken);
    expect(dump).not.toContain(sealed.request.code!.token);
    expect(dump).not.toContain(created.deleteToken);
  });

  it('sets the TTL in Redis', async () => {
    const { sealed, created } = await createClip('x', { ttl: '5m' });
    const ttl = await ctx.redis.ttl(`clip:${sealed.id}`);
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
    expect(created.expiresAt).toBeGreaterThan(Date.now() + 290_000);
  });

  it('rejects an id that is already taken', async () => {
    const { sealed } = await createClip('first');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      payload: { ...sealed.request, ttl: '1h', burnAfterRead: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'id_taken' });
  });

  it('rejects invalid requests', async () => {
    const withCode = await sealText('x', { withCode: true });
    const linkOnly = await sealText('x', { withCode: false });
    const cases = [
      { ...withCode.request, ttl: '30d', burnAfterRead: false },
      { ...withCode.request, ttl: '7d', burnAfterRead: false },
      { ...withCode.request, id: linkOnly.id, ttl: '1h', burnAfterRead: false },
      { ...linkOnly.request, id: withCode.id, ttl: '1h', burnAfterRead: false },
      { ...linkOnly.request, ciphertext: 'not base64!', ttl: '1h', burnAfterRead: false },
      { ...linkOnly.request, ttl: '1h' },
    ];
    for (const payload of cases) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/clips', payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toBe('invalid_request');
    }
  });

  it('allows long TTLs for link-only clips', async () => {
    await createClip('x', { withCode: false, ttl: '7d' });
  });

  it('rejects content over the size limit', async () => {
    const sealed = await sealText('x'.repeat(100 * 1024 + 2048), { withCode: false });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      payload: { ...sealed.request, ttl: '1h', burnAfterRead: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts content at the size limit', async () => {
    await createClip('x'.repeat(100 * 1024), { withCode: false });
  });

  it('rejects malformed JSON', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });
});

describe('password protected clips', () => {
  it('stores the password wrap and returns it on open', async () => {
    const { sealed } = await createClip('parolalı', { withCode: false, password: 'gizli' });
    const meta = await ctx.app.inject({ method: 'GET', url: `/api/clips/${sealed.id}` });
    expect(meta.json().hasPassword).toBe(true);

    const access = await linkAccess(sealed.key);
    const res = await open(sealed.id, access);
    const payload = openClipResponseSchema.parse(res.json());
    expect(payload.passwordWrap).toEqual(sealed.request.passwordWrap);
    expect((await openClip(sealed.id, access, payload, 'gizli')).content).toEqual(
      content('parolalı'),
    );
  });

  it('rejects password clips that also carry a short code', async () => {
    const withCode = await sealText('x', { withCode: true });
    const withPassword = await sealText('x', { withCode: false, password: 'p' });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      payload: {
        ...withCode.request,
        passwordWrap: withPassword.request.passwordWrap,
        ttl: '1h',
        burnAfterRead: false,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/clips/:id', () => {
  it('returns metadata without content', async () => {
    const { sealed, created } = await createClip('x', { burnAfterRead: true });
    const res = await ctx.app.inject({ method: 'GET', url: `/api/clips/${sealed.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({
      expiresAt: created.expiresAt,
      burnAfterRead: true,
      hasCode: true,
      hasPassword: false,
    });
  });

  it('returns 404 for unknown or invalid ids', async () => {
    for (const id of ['ZZZZ', 'bad!', 'ZZZZZZZZZZZZ']) {
      const res = await ctx.app.inject({ method: 'GET', url: `/api/clips/${id}` });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe('POST /api/clips/:id/open', () => {
  it('opens a clip with the link key', async () => {
    const { sealed } = await createClip('link ile açıldı 🎉', { withCode: false });
    const access = await linkAccess(sealed.key);
    const res = await open(sealed.id, access);
    expect(res.statusCode).toBe(200);
    const payload = openClipResponseSchema.parse(res.json());
    expect((await openClip(sealed.id, access, payload)).content).toEqual(
      content('link ile açıldı 🎉'),
    );
  });

  it('opens a clip with the short code', async () => {
    const { sealed } = await createClip('kod ile açıldı');
    const access = await codeAccess(sealed.id, sealed.secret!);
    const res = await open(sealed.id, access);
    expect(res.statusCode).toBe(200);
    const payload = openClipResponseSchema.parse(res.json());
    expect((await openClip(sealed.id, access, payload)).content).toEqual(content('kod ile açıldı'));
  });

  it('rejects a wrong link token without counting attempts', async () => {
    const { sealed } = await createClip('x');
    for (let i = 0; i < MAX_CODE_ATTEMPTS + 1; i++) {
      const res = await open(sealed.id, wrongToken('link'));
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'invalid_token' });
    }
    const access = await codeAccess(sealed.id, sealed.secret!);
    expect((await open(sealed.id, access)).statusCode).toBe(200);
  });

  it('locks code access after too many wrong codes but keeps the link working', async () => {
    const { sealed } = await createClip('x');
    for (let i = 1; i <= MAX_CODE_ATTEMPTS; i++) {
      const res = await open(sealed.id, wrongToken('code'));
      expect(res.statusCode).toBe(401);
      expect(res.json().remainingAttempts).toBe(MAX_CODE_ATTEMPTS - i);
    }

    const correct = await codeAccess(sealed.id, sealed.secret!);
    const locked = await open(sealed.id, correct);
    expect(locked.statusCode).toBe(423);
    expect(locked.json()).toEqual({ error: 'code_locked' });

    const link = await linkAccess(sealed.key);
    expect((await open(sealed.id, link)).statusCode).toBe(200);
  });

  it('does not allow code access to link-only clips', async () => {
    const { sealed } = await createClip('x', { withCode: false });
    const res = await open(sealed.id, wrongToken('code'));
    expect(res.statusCode).toBe(404);
  });

  it('deletes burn-after-read clips on first open', async () => {
    const { sealed } = await createClip('bir kez', { burnAfterRead: true });
    const access = await linkAccess(sealed.key);
    const first = await open(sealed.id, access);
    expect(first.statusCode).toBe(200);
    expect(first.json().burnAfterRead).toBe(true);
    expect((await open(sealed.id, access)).statusCode).toBe(404);
    expect(await ctx.redis.exists(`clip:${sealed.id}`)).toBe(0);
  });

  it('serves a burn-after-read clip only once under concurrency', async () => {
    const { sealed } = await createClip('race', { burnAfterRead: true });
    const access = await linkAccess(sealed.key);
    const results = await Promise.all(Array.from({ length: 10 }, () => open(sealed.id, access)));
    expect(results.filter((res) => res.statusCode === 200)).toHaveLength(1);
  });

  it('does not delete a burn-after-read clip on a failed attempt', async () => {
    const { sealed } = await createClip('x', { burnAfterRead: true });
    await open(sealed.id, wrongToken('link'));
    expect(await ctx.redis.exists(`clip:${sealed.id}`)).toBe(1);
  });

  it('validates the request body', async () => {
    const { sealed } = await createClip('x');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${sealed.id}/open`,
      payload: { method: 'magic', token: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/clips/:id', () => {
  it('deletes a clip with the delete token', async () => {
    const { sealed, created } = await createClip('x');
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/clips/${sealed.id}`,
      headers: { authorization: `Bearer ${created.deleteToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await ctx.redis.exists(`clip:${sealed.id}`)).toBe(0);
  });

  it('refuses a wrong or missing delete token', async () => {
    const { sealed } = await createClip('x');
    const wrong = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/clips/${sealed.id}`,
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(403);
    const missing = await ctx.app.inject({ method: 'DELETE', url: `/api/clips/${sealed.id}` });
    expect(missing.statusCode).toBe(401);
    expect(await ctx.redis.exists(`clip:${sealed.id}`)).toBe(1);
  });

  it('returns 404 for unknown clips', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/clips/ZZZZ',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
  });
});
