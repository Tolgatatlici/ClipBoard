import type { FastifyInstance } from 'fastify';
import { createReportRequestSchema } from '@clipboard/shared';
import type { ReportStore } from '../services/report-store.js';
import { sendInvalid } from './errors.js';

export async function reportRoutes(
  app: FastifyInstance,
  { reports, rateLimit }: { reports: ReportStore; rateLimit: number },
) {
  app.post(
    '/api/reports',
    { config: { rateLimit: { max: rateLimit, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = createReportRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendInvalid(reply, parsed.error);
      await reports.add(parsed.data);
      request.log.warn({ reason: parsed.data.reason }, 'abuse report received');
      return reply.code(202).send({ status: 'received' });
    },
  );
}
