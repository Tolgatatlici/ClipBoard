import { describe, expect, it } from 'vitest';
import {
  ClientApiError,
  ClipboardClient,
  parseShareTarget,
  PasswordRequiredError,
  WrongPasswordError,
} from '@clipboard/shared';
import { injectFetch } from './inject-fetch.js';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();
const client = () =>
  new ClipboardClient(
    'http://clip.test/',
    injectFetch(() => ctx.app),
  );

describe('parseShareTarget', () => {
  it('parses links and codes', () => {
    expect(parseShareTarget('https://clip.example.com/c/ABCDEFGHJKMN#k=xyz')).toEqual({
      server: 'https://clip.example.com',
      id: 'ABCDEFGHJKMN',
      secret: { kind: 'key', value: 'xyz' },
    });
    expect(parseShareTarget('https://clip.example.com/c/ABCD#s=EFGH')).toMatchObject({
      id: 'ABCD',
      secret: { kind: 'code', value: 'EFGH' },
    });
    expect(parseShareTarget(' abcd-efgh ')).toEqual({
      server: null,
      id: 'ABCD',
      secret: { kind: 'code', value: 'EFGH' },
    });
    expect(parseShareTarget('https://clip.example.com/c/ABCD')).toBeNull();
    expect(parseShareTarget('merhaba')).toBeNull();
  });
});

describe('ClipboardClient', () => {
  it('shares and opens text with a code and a link', async () => {
    const share = await client().shareText('istemciden merhaba', { format: 'code' });
    expect(share.link).toMatch(/^http:\/\/clip\.test\/c\/[0-9A-Z]{4}#k=/);

    for (const input of [share.code!, share.link]) {
      const opened = await client().open(parseShareTarget(input)!);
      expect(opened.content).toEqual({
        kind: 'text',
        format: 'code',
        text: 'istemciden merhaba',
      });
    }
  });

  it('shares and opens files', async () => {
    const data = crypto.getRandomValues(new Uint8Array(3000));
    const share = await client().shareFile(
      data,
      { name: 'veri.bin', mime: '' },
      { withCode: false },
    );
    expect(share.code).toBeNull();
    const opened = await client().open(parseShareTarget(share.link)!);
    expect(opened.content).toMatchObject({ kind: 'file', name: 'veri.bin', size: 3000 });
    expect(opened.file).toEqual(data);
  });

  it('retries wrong passwords locally without refetching burn-after-read content', async () => {
    const share = await client().shareText('gizli', {
      password: 'doğru',
      burnAfterRead: true,
      withCode: false,
    });
    const answers = ['yanlış', 'doğru'];
    const opened = await client().open(parseShareTarget(share.link)!, {
      password: async () => answers.shift()!,
    });
    expect(opened.content).toMatchObject({ text: 'gizli' });
    expect(opened.burnAfterRead).toBe(true);
    await expect(client().open(parseShareTarget(share.link)!)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('gives up after the allowed password attempts', async () => {
    const share = await client().shareText('x', { password: 'p', withCode: false });
    await expect(
      client().open(parseShareTarget(share.link)!, {
        password: async () => 'nope',
        passwordAttempts: 2,
      }),
    ).rejects.toThrow(WrongPasswordError);
    await expect(client().open(parseShareTarget(share.link)!)).rejects.toThrow(
      PasswordRequiredError,
    );
  });

  it('reports API errors and deletes shares', async () => {
    const share = await client().shareText('silinecek');
    await client().delete(share.id, share.deleteToken);
    const error = await client()
      .open(parseShareTarget(share.code!)!)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ClientApiError);
    expect((error as ClientApiError).body.error).toBe('not_found');
  });
});
