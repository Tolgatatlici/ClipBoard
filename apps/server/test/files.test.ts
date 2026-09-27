import { describe, expect, it } from 'vitest';
import {
  createFileResponseSchema,
  encryptBlob,
  encryptedBlobSize,
  linkAccess,
  openClip,
  openClipResponseSchema,
  sealClip,
  decryptBlob,
  type CreateFileResponse,
} from '@clipboard/shared';
import { useTestApp } from './helpers.js';

const ctx = useTestApp();

async function createFile(size: number, ttl = '1h') {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/files', payload: { size, ttl } });
  expect(res.statusCode).toBe(201);
  return createFileResponseSchema.parse(res.json());
}

function upload(file: CreateFileResponse, body: Buffer | Uint8Array) {
  return ctx.app.inject({
    method: 'PUT',
    url: file.upload.url,
    headers: file.upload.headers,
    payload: Buffer.from(body),
  });
}

async function download(fileId: string) {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/files/${fileId}` });
  if (res.statusCode !== 200) return res;
  return ctx.app.inject({ method: 'GET', url: res.json().url });
}

/** Şifreli bir dosya clip'i oluşturur ve yükler. */
async function createFileClip(options: { burnAfterRead?: boolean } = {}) {
  const data = crypto.getRandomValues(new Uint8Array(5000));
  const file = await createFile(encryptedBlobSize(data.length));
  const sealed = await sealClip(
    { kind: 'file', name: 'foto.png', mime: 'image/png', size: data.length },
    { withCode: false, fileId: file.fileId },
  );
  const blob = await encryptBlob(sealed.fileKey, data, file.fileId);
  expect((await upload(file, blob)).statusCode).toBe(204);

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/clips',
    payload: {
      ...sealed.request,
      ttl: '1h',
      burnAfterRead: options.burnAfterRead ?? false,
    },
  });
  expect(res.statusCode).toBe(201);
  return { data, file, sealed, deleteToken: res.json().deleteToken as string };
}

describe('file uploads', () => {
  it('uploads and downloads an encrypted blob', async () => {
    const file = await createFile(4);
    expect((await upload(file, Buffer.from([1, 2, 3, 4]))).statusCode).toBe(204);
    const res = await download(file.fileId);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.rawPayload).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('rejects uploads of the wrong size', async () => {
    const file = await createFile(4);
    expect((await upload(file, Buffer.from([1, 2, 3]))).statusCode).toBe(400);
    expect((await upload(file, Buffer.from([1, 2, 3, 4, 5]))).statusCode).toBe(400);
    expect(await ctx.storage.size(file.fileId)).toBeNull();
  });

  it('rejects tampered or expired upload links', async () => {
    const file = await createFile(4);
    const tampered = { ...file, upload: { ...file.upload, url: file.upload.url + 'x' } };
    expect((await upload(tampered, Buffer.from([1, 2, 3, 4]))).statusCode).toBe(403);

    const bigger = file.upload.url.replace('size=4', 'size=5');
    const res = await ctx.app.inject({
      method: 'PUT',
      url: bigger,
      headers: file.upload.headers,
      payload: Buffer.alloc(5),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects files over the size limit', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/files',
      payload: { size: 26 * 1024 * 1024, ttl: '1h' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown files', async () => {
    expect((await download('A'.repeat(22))).statusCode).toBe(404);
    expect((await download('bad')).statusCode).toBe(404);
  });

  it('deletes expired files on sweep', async () => {
    const file = await createFile(4, '5m');
    await upload(file, Buffer.alloc(4));
    await ctx.app.ready();
    const { FileService } = await import('../src/services/file-service.js');
    const service = new FileService(ctx.redis, ctx.storage);
    expect(await service.sweep(Date.now())).toBe(0);
    expect(await service.sweep(Date.now() + 6 * 60 * 1000)).toBe(1);
    expect(await ctx.storage.size(file.fileId)).toBeNull();
    expect((await download(file.fileId)).statusCode).toBe(404);
  });
});

describe('file clips', () => {
  it('shares an encrypted file end to end', async () => {
    const { data, sealed } = await createFileClip();
    const access = await linkAccess(sealed.key);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${sealed.id}/open`,
      payload: { method: access.method, token: access.token },
    });
    const payload = openClipResponseSchema.parse(res.json());
    expect(payload.kind).toBe('file');

    const opened = await openClip(sealed.id, access, payload);
    expect(opened.content).toEqual({
      kind: 'file',
      name: 'foto.png',
      mime: 'image/png',
      size: data.length,
    });
    const blob = await download(payload.fileId!);
    expect(
      await decryptBlob(opened.fileKey, new Uint8Array(blob.rawPayload), payload.fileId!),
    ).toEqual(data);
  });

  it('refuses a clip whose file was not uploaded', async () => {
    const file = await createFile(100);
    const sealed = await sealClip(
      { kind: 'file', name: 'a', mime: '', size: 84 },
      { withCode: false, fileId: file.fileId },
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/clips',
      payload: { ...sealed.request, ttl: '1h', burnAfterRead: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('file_missing');
  });

  it('keeps the file as long as the clip', async () => {
    const { file } = await createFileClip();
    const deleteAt = Number(await ctx.redis.zscore('files:gc', file.fileId));
    expect(deleteAt).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
  });

  it('deletes the file together with the clip', async () => {
    const { file, sealed, deleteToken } = await createFileClip();
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/clips/${sealed.id}`,
      headers: { authorization: `Bearer ${deleteToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await ctx.storage.size(file.fileId)).toBeNull();
    expect((await download(file.fileId)).statusCode).toBe(404);
  });

  it('schedules the file of a burn-after-read clip for deletion after opening', async () => {
    const { file, sealed } = await createFileClip({ burnAfterRead: true });
    const access = await linkAccess(sealed.key);
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${sealed.id}/open`,
      payload: { method: access.method, token: access.token },
    });
    const deleteAt = Number(await ctx.redis.zscore('files:gc', file.fileId));
    expect(deleteAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    // İndirme süresi içinde hâlâ alınabilir.
    expect((await download(file.fileId)).statusCode).toBe(200);
  });
});
