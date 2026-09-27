import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import {
  createFileRequestSchema,
  fileIdSchema,
  TTL_OPTIONS,
  type CreateFileResponse,
  type FileDownloadResponse,
} from '@clipboard/shared';
import type { Metrics } from '../metrics.js';
import type { FileService } from '../services/file-service.js';
import { LocalFileStorage } from '../services/storage/index.js';
import { UploadSizeError } from '../services/storage/local.js';
import { sendError, sendInvalid } from './errors.js';

interface Options {
  files: FileService;
  metrics: Metrics;
  rateLimit: number;
}

export async function fileRoutes(app: FastifyInstance, { files, metrics, rateLimit }: Options) {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.post(
    '/api/files',
    { config: { rateLimit: { max: rateLimit, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = createFileRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendInvalid(reply, parsed.error);
      const created = await files.create(parsed.data.size, TTL_OPTIONS[parsed.data.ttl]);
      metrics.filesCreated.inc();
      const body: CreateFileResponse = {
        fileId: created.fileId,
        upload: { method: 'PUT', ...created.upload },
      };
      return reply.code(201).send(body);
    },
  );

  // Dosya kimliği 128 bit rastgeledir ve yalnızca şifreli içeriklerin içinde dolaşır;
  // kimliği bilen şifreli blob'u indirebilir ama anahtar olmadan çözemez.
  app.get<{ Params: { fileId: string } }>('/api/files/:fileId', async (request, reply) => {
    if (!fileIdSchema.safeParse(request.params.fileId).success) {
      return sendError(reply, 404, { error: 'not_found' });
    }
    const url = await files.downloadUrl(request.params.fileId);
    if (!url) return sendError(reply, 404, { error: 'not_found' });
    const body: FileDownloadResponse = { url };
    return body;
  });

  const storage = files.storage;
  if (!(storage instanceof LocalFileStorage)) return;

  // Yerel sürücü: imzalı linklerle yükleme ve indirme.
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });

  type BlobRequest = {
    Params: { fileId: string };
    Querystring: Record<string, string | undefined>;
  };

  app.put<BlobRequest>('/api/files/:fileId/blob', async (request, reply) => {
    const { fileId } = request.params;
    if (!fileIdSchema.safeParse(fileId).success || !storage.verify('put', fileId, request.query)) {
      return sendError(reply, 403, { error: 'invalid_token' });
    }
    const expected = await files.expectedSize(fileId);
    if (expected == null || expected !== Number(request.query.size)) {
      return sendError(reply, 404, { error: 'not_found' });
    }
    const declared = request.headers['content-length'];
    if (!request.body || (declared !== undefined && Number(declared) !== expected)) {
      return sendError(reply, 400, { error: 'invalid_request', message: 'Upload size mismatch' });
    }
    try {
      await storage.write(fileId, request.body as Readable, expected);
    } catch (err) {
      if (err instanceof UploadSizeError) {
        return sendError(reply, 400, { error: 'invalid_request', message: err.message });
      }
      throw err;
    }
    return reply.code(204).send();
  });

  app.get<BlobRequest>('/api/files/:fileId/blob', async (request, reply) => {
    const { fileId } = request.params;
    if (!fileIdSchema.safeParse(fileId).success || !storage.verify('get', fileId, request.query)) {
      return sendError(reply, 403, { error: 'invalid_token' });
    }
    if ((await storage.size(fileId)) == null) return sendError(reply, 404, { error: 'not_found' });
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment')
      .send(storage.read(fileId));
  });
}
