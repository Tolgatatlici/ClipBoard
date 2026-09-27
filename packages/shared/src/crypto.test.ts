import { describe, expect, it } from 'vitest';
import type { ClipContent } from './content.js';
import {
  codeAccess,
  decryptBlob,
  DecryptionError,
  encryptBlob,
  encryptedBlobSize,
  linkAccess,
  openClip,
  PasswordRequiredError,
  sealClip,
  WrongPasswordError,
  type SealedClip,
} from './crypto.js';
import { createClipRequestSchema, type OpenClipResponse } from './schemas.js';
import { fromBase64Url, toBase64Url } from './encoding.js';

const text = (value: string): ClipContent => ({ kind: 'text', format: 'plain', text: value });

function asStored(sealed: SealedClip): OpenClipResponse {
  return {
    kind: sealed.request.kind,
    ciphertext: sealed.request.ciphertext,
    iv: sealed.request.iv,
    wrappedKey: sealed.request.code?.wrappedKey,
    wrapIv: sealed.request.code?.wrapIv,
    passwordWrap: sealed.request.passwordWrap,
    fileId: sealed.request.fileId,
    burnAfterRead: false,
    expiresAt: 0,
  };
}

async function openWithLink(sealed: SealedClip, password?: string) {
  const access = await linkAccess(sealed.key);
  return openClip(sealed.id, access, asStored(sealed), password);
}

describe('sealClip', () => {
  it('produces requests accepted by the API schema', async () => {
    const variants = [
      { withCode: true },
      { withCode: false },
      { withCode: false, password: 'parola' },
    ];
    for (const options of variants) {
      const sealed = await sealClip(text('merhaba'), options);
      const parsed = createClipRequestSchema.safeParse({
        ...sealed.request,
        ttl: '1h',
        burnAfterRead: false,
      });
      expect(parsed.success, JSON.stringify(options)).toBe(true);
    }
  });

  it('does not leak the plaintext, key or password into the request', async () => {
    const sealed = await sealClip(text('gizli mesaj'), { withCode: true });
    const serialized = JSON.stringify(sealed.request);
    expect(serialized).not.toContain('gizli');
    expect(serialized).not.toContain(sealed.key);
    expect(serialized).not.toContain(sealed.secret);

    const withPassword = await sealClip(text('x'), { withCode: false, password: 'hunter2' });
    expect(JSON.stringify(withPassword.request)).not.toContain('hunter2');
  });

  it('never creates a short code for password protected clips', async () => {
    const sealed = await sealClip(text('x'), { withCode: true, password: 'p' });
    expect(sealed.secret).toBeNull();
    expect(sealed.request.code).toBeUndefined();
    expect(sealed.id).toHaveLength(12);
  });
});

describe('link access', () => {
  it('round-trips unicode text and the text format', async () => {
    const content: ClipContent = {
      kind: 'text',
      format: 'code',
      text: 'Çok gizli 🔐 metin\nikinci satır',
    };
    const sealed = await sealClip(content, { withCode: false });
    expect(sealed.secret).toBeNull();
    expect(sealed.id).toHaveLength(12);

    const access = await linkAccess(sealed.key);
    expect(access.token).toBe(sealed.request.linkToken);
    expect((await openWithLink(sealed)).content).toEqual(content);
  });

  it('fails with a different key', async () => {
    const sealed = await sealClip(text('x'), { withCode: false });
    const other = await sealClip(text('y'), { withCode: false });
    const access = await linkAccess(other.key);
    await expect(openClip(sealed.id, access, asStored(sealed))).rejects.toThrow(DecryptionError);
  });

  it('fails when the ciphertext is bound to another id', async () => {
    const sealed = await sealClip(text('x'), { withCode: false });
    const access = await linkAccess(sealed.key);
    await expect(openClip('ZZZZZZZZZZZZ', access, asStored(sealed))).rejects.toThrow(
      DecryptionError,
    );
  });

  it('detects tampering', async () => {
    const sealed = await sealClip(text('tamper me'), { withCode: false });
    const bytes = fromBase64Url(sealed.request.ciphertext);
    bytes[0] = bytes[0]! ^ 1;
    const access = await linkAccess(sealed.key);
    await expect(
      openClip(sealed.id, access, { ...asStored(sealed), ciphertext: toBase64Url(bytes) }),
    ).rejects.toThrow(DecryptionError);
  });

  it('rejects malformed keys', async () => {
    await expect(linkAccess('short')).rejects.toThrow(DecryptionError);
  });
});

describe('password protection', () => {
  it('requires both the link and the password', async () => {
    const sealed = await sealClip(text('parolalı'), { withCode: false, password: 'doğru at' });
    await expect(openWithLink(sealed)).rejects.toThrow(PasswordRequiredError);
    await expect(openWithLink(sealed, 'yanlış')).rejects.toThrow(WrongPasswordError);
    expect((await openWithLink(sealed, 'doğru at')).content).toEqual(text('parolalı'));
  });

  it('does not put the master key in the link', async () => {
    const sealed = await sealClip(text('x'), { withCode: false, password: 'p' });
    const access = await linkAccess(sealed.key);
    // Parola olmadan link sırrı ana anahtar yerine kullanılamaz.
    const withoutWrap = { ...asStored(sealed), passwordWrap: undefined };
    await expect(openClip(sealed.id, access, withoutWrap)).rejects.toThrow(DecryptionError);
  });
});

describe('code access', () => {
  it('derives the same token and decrypts the content', async () => {
    const sealed = await sealClip(text('kodla aç'), { withCode: true });
    expect(sealed.id).toHaveLength(4);
    expect(sealed.secret).toHaveLength(4);

    const access = await codeAccess(sealed.id, sealed.secret!);
    expect(access.token).toBe(sealed.request.code!.token);
    expect(access.token).not.toBe(sealed.request.linkToken);
    expect((await openClip(sealed.id, access, asStored(sealed))).content).toEqual(text('kodla aç'));
  });

  it('produces a different token for a wrong secret', async () => {
    const sealed = await sealClip(text('x'), { withCode: true });
    const wrong = sealed.secret === 'AAAA' ? 'BBBB' : 'AAAA';
    const access = await codeAccess(sealed.id, wrong);
    expect(access.token).not.toBe(sealed.request.code!.token);
    await expect(openClip(sealed.id, access, asStored(sealed))).rejects.toThrow(DecryptionError);
  });

  it('link and code access yield the same file key', async () => {
    const sealed = await sealClip(text('x'), { withCode: true });
    const viaLink = await openWithLink(sealed);
    const viaCode = await openClip(
      sealed.id,
      await codeAccess(sealed.id, sealed.secret!),
      asStored(sealed),
    );
    expect(viaLink.fileKey).toEqual(sealed.fileKey);
    expect(viaCode.fileKey).toEqual(sealed.fileKey);
  });
});

describe('file blobs', () => {
  it('round-trips binary data', async () => {
    const content: ClipContent = { kind: 'file', name: 'a.bin', mime: '', size: 1000 };
    const sealed = await sealClip(content, { withCode: false, fileId: 'F'.repeat(22) });
    const data = crypto.getRandomValues(new Uint8Array(1000));
    const blob = await encryptBlob(sealed.fileKey, data, 'file-1');
    expect(blob.length).toBe(encryptedBlobSize(1000));

    const opened = await openWithLink(sealed);
    expect(opened.content).toEqual(content);
    expect(await decryptBlob(opened.fileKey, blob, 'file-1')).toEqual(data);
  });

  it('binds the blob to its file id', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptBlob(key, new Uint8Array([1, 2, 3]), 'file-1');
    await expect(decryptBlob(key, blob, 'file-2')).rejects.toThrow(DecryptionError);
  });
});
