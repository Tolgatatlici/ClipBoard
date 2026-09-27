import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardClient, parseShareTarget } from '@clipboard/shared';
import { injectFetch } from '../../server/test/inject-fetch.js';
import { useTestApp } from '../../server/test/helpers.js';
import { installFakeChrome } from './fake-chrome.js';

const ctx = useTestApp();

let fake: ReturnType<typeof installFakeChrome>;
beforeEach(() => {
  fake = installFakeChrome();
  vi.stubGlobal(
    'fetch',
    injectFetch(() => ctx.app),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('settings', () => {
  it('normalizes server addresses', async () => {
    const { normalizeServer } = await import('../src/settings.js');
    expect(normalizeServer('https://clip.example.com/some/path')).toBe('https://clip.example.com');
    expect(normalizeServer(' http://localhost:3000 ')).toBe('http://localhost:3000');
    expect(normalizeServer('http://clip.example.com')).toBeNull();
    expect(normalizeServer('javascript:alert(1)')).toBeNull();
    expect(normalizeServer('merhaba')).toBeNull();
  });

  it('asks for permission only for non-default servers', async () => {
    const { getServer, setServer } = await import('../src/settings.js');
    expect(await getServer()).toBe('http://clip.test');
    expect(await setServer('http://clip.test')).toBe(true);
    expect(fake.chrome.permissions.request).not.toHaveBeenCalled();

    expect(await setServer('https://other.example.com')).toBe(true);
    expect(fake.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://other.example.com/*'],
    });
    expect(await getServer()).toBe('https://other.example.com');
  });

  it('keeps the old server when permission is denied', async () => {
    fake = installFakeChrome({ grantPermissions: false });
    const { getServer, setServer } = await import('../src/settings.js');
    expect(await setServer('https://other.example.com')).toBe(false);
    expect(await getServer()).toBe('http://clip.test');
  });
});

describe('sharing', () => {
  it('creates a share that the web app and CLI can open', async () => {
    const { createShare } = await import('../src/share.js');
    const share = await createShare({
      text: 'eklentiden merhaba',
      ttl: '1h',
      burnAfterRead: false,
    });
    expect(share.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(share.link.startsWith('http://clip.test/c/')).toBe(true);

    const client = new ClipboardClient(
      'http://clip.test',
      injectFetch(() => ctx.app),
    );
    const opened = await client.open(parseShareTarget(share.code!)!);
    expect(opened.content).toMatchObject({ text: 'eklentiden merhaba' });
  });

  it('rejects oversized text before contacting the server', async () => {
    const { createShare, TextTooLargeError } = await import('../src/share.js');
    await expect(
      createShare({ text: 'x'.repeat(100 * 1024 + 1), ttl: '1h', burnAfterRead: false }),
    ).rejects.toThrow(TextTooLargeError);
  });
});

describe('context menu', () => {
  it('registers the menu and shares the selection into a result tab', async () => {
    const { shareSelection } = await import('../src/background.js');
    fake.listeners.installed.forEach((fn) => fn());
    expect(fake.chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'share-selection', contexts: ['selection'] }),
    );

    await shareSelection('seçili metin');
    const url = fake.chrome.tabs.create.mock.calls[0]![0].url as string;
    expect(url).toMatch(/^chrome-extension:\/\/test\/result\.html#/);

    const { takeResult } = await import('../src/share.js');
    const result = await takeResult(url.split('#')[1]!);
    expect(result).toMatchObject({ ok: true, share: { code: expect.any(String) } });
  });

  it('stores an error result when sharing fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    const { shareSelection } = await import('../src/background.js');
    await shareSelection('x');
    const url = fake.chrome.tabs.create.mock.calls[0]![0].url as string;
    const { takeResult } = await import('../src/share.js');
    expect(await takeResult(url.split('#')[1]!)).toEqual({ ok: false, error: 'errorNetwork' });
  });
});
