import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

const root = mkdtempSync(join(tmpdir(), 'clipboard-static-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<!doctype html><title>ClipBoard</title>');
writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(join(root, 'robots.txt'), 'User-agent: *');
afterAll(() => rmSync(root, { recursive: true, force: true }));

const html = { accept: 'text/html,application/xhtml+xml' };

function csp(header: string | string[] | number | undefined) {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .map(([name, ...values]) => [name, values]),
  );
}

describe('static site', () => {
  const ctx = useTestApp({ STATIC_DIR: root });

  it('serves the app shell for page routes', async () => {
    for (const url of ['/', '/c/ABCD', '/r', '/gizlilik']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: html });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toContain('<title>ClipBoard</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('keeps share and room pages out of search engines', async () => {
    for (const url of ['/c/ABCD', '/r', '/bildir']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: html });
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow');
    }
    for (const url of ['/', '/gizlilik', '/robots-like']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: html });
      expect(res.headers['x-robots-tag'], url).toBeUndefined();
    }
  });

  it('caches hashed assets forever', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves other static files', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.body).toBe('User-agent: *');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('keeps JSON 404s for the API and non-page requests', async () => {
    const api = await ctx.app.inject({ method: 'GET', url: '/api/nope', headers: html });
    expect(api.json()).toEqual({ error: 'not_found' });
    const asset = await ctx.app.inject({ method: 'GET', url: '/assets/missing.js' });
    expect(asset.statusCode).toBe(404);
  });

  it('sends a strict content security policy', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/c/ABCD',
      headers: { ...html, host: 'clip.example.com' },
    });
    const policy = csp(res.headers['content-security-policy']);
    expect(policy['script-src']).toEqual(["'self'"]);
    expect(policy['style-src']).toEqual(["'self'"]);
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'none'"]);
    expect(policy['connect-src']).toContain('wss://clip.example.com');
    expect(policy['img-src']).toEqual(["'self'", 'data:', 'blob:']);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });
});

describe('content security policy with S3 storage', () => {
  const ctx = useTestApp({
    NODE_ENV: 'production',
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: 'https://files.example.com',
  });

  it('allows the storage origin and only secure sockets in production', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'clip.example.com' },
    });
    const policy = csp(res.headers['content-security-policy']);
    expect(policy['connect-src']).toEqual([
      "'self'",
      'wss://clip.example.com',
      'https://files.example.com',
    ]);
    expect(policy['upgrade-insecure-requests']).toBeDefined();
  });
});
