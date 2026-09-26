import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  clipIdSchema,
  createClipRequestSchema,
  openClipRequestSchema,
  TTL_OPTIONS,
  type ClipMetaResponse,
  type CreateClipResponse,
  type ErrorResponse,
} from '@clipboard/shared';
import type { ClipStore } from '../services/clip-store.js';
import type { z } from 'zod';

interface Options {
  store: ClipStore;
  rateLimits: { create: number; open: number };
}

function sendError(reply: FastifyReply, status: number, body: ErrorResponse) {
  return reply.code(status).send(body);
}

function invalid(reply: FastifyReply, error: z.ZodError) {
  const issue = error.issues[0];
  const message = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : undefined;
  return sendError(reply, 400, { error: 'invalid_request', message });
}

export async function clipRoutes(app: FastifyInstance, { store, rateLimits }: Options) {
  // İçerik şifreli olsa da yanıtlar hiçbir ara katmanda önbelleğe alınmamalı.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.post(
    '/api/clips',
    { config: { rateLimit: { max: rateLimits.create, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = createClipRequestSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, parsed.error);

      const ttlSeconds = TTL_OPTIONS[parsed.data.ttl];
      const deleteToken = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const created = await store.create({ ...parsed.data, deleteToken, expiresAt }, ttlSeconds);
      if (!created) return sendError(reply, 409, { error: 'id_taken' });

      const body: CreateClipResponse = { id: parsed.data.id, deleteToken, expiresAt };
      return reply.code(201).send(body);
    },
  );

  app.get<{ Params: { id: string } }>('/api/clips/:id', async (request, reply) => {
    if (!clipIdSchema.safeParse(request.params.id).success) {
      return sendError(reply, 404, { error: 'not_found' });
    }
    const meta = await store.meta(request.params.id);
    if (!meta) return sendError(reply, 404, { error: 'not_found' });
    const body: ClipMetaResponse = meta;
    return body;
  });

  app.post<{ Params: { id: string } }>(
    '/api/clips/:id/open',
    { config: { rateLimit: { max: rateLimits.open, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!clipIdSchema.safeParse(request.params.id).success) {
        return sendError(reply, 404, { error: 'not_found' });
      }
      const parsed = openClipRequestSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, parsed.error);

      const result = await store.open(request.params.id, parsed.data.method, parsed.data.token);
      switch (result.status) {
        case 'ok':
          return result.clip;
        case 'invalid':
          return sendError(reply, 401, {
            error: 'invalid_token',
            remainingAttempts: result.remainingAttempts,
          });
        case 'locked':
          return sendError(reply, 423, { error: 'code_locked' });
        case 'not_found':
          return sendError(reply, 404, { error: 'not_found' });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/clips/:id', async (request, reply) => {
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) return sendError(reply, 401, { error: 'invalid_token' });
    if (!clipIdSchema.safeParse(request.params.id).success) {
      return sendError(reply, 404, { error: 'not_found' });
    }
    const result = await store.delete(request.params.id, token);
    if (result === 'not_found') return sendError(reply, 404, { error: 'not_found' });
    if (result === 'forbidden') return sendError(reply, 403, { error: 'invalid_token' });
    return reply.code(204).send();
  });
}
