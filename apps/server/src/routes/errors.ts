import type { FastifyReply } from 'fastify';
import type { ErrorResponse } from '@clipboard/shared';
import type { z } from 'zod';

export function sendError(reply: FastifyReply, status: number, body: ErrorResponse) {
  return reply.code(status).send(body);
}

export function sendInvalid(reply: FastifyReply, error: z.ZodError) {
  const issue = error.issues[0];
  const message = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : undefined;
  return sendError(reply, 400, { error: 'invalid_request', message });
}
