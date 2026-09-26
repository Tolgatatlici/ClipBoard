import { describe, expect, it } from 'vitest';
import { codeAccess, DecryptionError, linkAccess, openText, sealText } from './crypto.js';
import { createClipRequestSchema, type OpenClipResponse } from './schemas.js';
import { fromBase64Url, toBase64Url } from './encoding.js';

function asStored(sealed: Awaited<ReturnType<typeof sealText>>): OpenClipResponse {
  return {
    kind: 'text',
    ciphertext: sealed.request.ciphertext,
    iv: sealed.request.iv,
    wrappedKey: sealed.request.code?.wrappedKey,
    wrapIv: sealed.request.code?.wrapIv,
    burnAfterRead: false,
    expiresAt: 0,
  };
}

describe('sealText', () => {
  it('produces a request accepted by the API schema', async () => {
    for (const withCode of [true, false]) {
      const sealed = await sealText('merhaba', { withCode });
      const parsed = createClipRequestSchema.safeParse({
        ...sealed.request,
        ttl: '1h',
        burnAfterRead: false,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('does not leak the plaintext or key into the request', async () => {
    const sealed = await sealText('gizli mesaj', { withCode: true });
    const serialized = JSON.stringify(sealed.request);
    expect(serialized).not.toContain('gizli');
    expect(serialized).not.toContain(sealed.key);
    expect(serialized).not.toContain(sealed.secret);
  });
});

describe('link access', () => {
  it('round-trips unicode text', async () => {
    const text = 'Çok gizli 🔐 metin\nikinci satır';
    const sealed = await sealText(text, { withCode: false });
    expect(sealed.secret).toBeNull();
    expect(sealed.id).toHaveLength(12);

    const access = await linkAccess(sealed.key);
    expect(access.token).toBe(sealed.request.linkToken);
    expect(await openText(sealed.id, access, asStored(sealed))).toBe(text);
  });

  it('fails with a different key', async () => {
    const sealed = await sealText('x', { withCode: false });
    const other = await sealText('y', { withCode: false });
    const access = await linkAccess(other.key);
    await expect(openText(sealed.id, access, asStored(sealed))).rejects.toThrow(DecryptionError);
  });

  it('fails when the ciphertext is bound to another id', async () => {
    const sealed = await sealText('x', { withCode: false });
    const access = await linkAccess(sealed.key);
    await expect(openText('ZZZZZZZZZZZZ', access, asStored(sealed))).rejects.toThrow(
      DecryptionError,
    );
  });

  it('detects tampering', async () => {
    const sealed = await sealText('tamper me', { withCode: false });
    const bytes = fromBase64Url(sealed.request.ciphertext);
    bytes[0] = bytes[0]! ^ 1;
    const access = await linkAccess(sealed.key);
    await expect(
      openText(sealed.id, access, { ...asStored(sealed), ciphertext: toBase64Url(bytes) }),
    ).rejects.toThrow(DecryptionError);
  });

  it('rejects malformed keys', async () => {
    await expect(linkAccess('short')).rejects.toThrow(DecryptionError);
  });
});

describe('code access', () => {
  it('derives the same token and decrypts the content', async () => {
    const sealed = await sealText('kodla aç', { withCode: true });
    expect(sealed.id).toHaveLength(4);
    expect(sealed.secret).toHaveLength(4);

    const access = await codeAccess(sealed.id, sealed.secret!);
    expect(access.token).toBe(sealed.request.code!.token);
    expect(access.token).not.toBe(sealed.request.linkToken);
    expect(await openText(sealed.id, access, asStored(sealed))).toBe('kodla aç');
  });

  it('produces a different token for a wrong secret', async () => {
    const sealed = await sealText('x', { withCode: true });
    const wrong = sealed.secret === 'AAAA' ? 'BBBB' : 'AAAA';
    const access = await codeAccess(sealed.id, wrong);
    expect(access.token).not.toBe(sealed.request.code!.token);
    await expect(openText(sealed.id, access, asStored(sealed))).rejects.toThrow(DecryptionError);
  });
});
