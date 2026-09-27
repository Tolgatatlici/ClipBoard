import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import * as Sentry from '@sentry/node';
import type { Config } from '../config.js';
import type { Metrics } from '../metrics.js';

let sentryReady = false;

/** URL, başlık, gövde, kullanıcı ve iz kayıtları; kimlik, erişim anahtarı ya da IP içerebilir. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.contexts?.request;
  return event;
}

/** Sentry'yi (isteğe bağlı) başlatır; istek ayrıntıları gönderilmeden temizlenir. */
export function initSentry(config: Config) {
  if (!config.SENTRY_DSN || sentryReady) return;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
  sentryReady = true;
}

export function reportError(error: unknown) {
  if (sentryReady) Sentry.captureException(error);
}

export async function observability(
  app: FastifyInstance,
  { config, metrics }: { config: Config; metrics: Metrics },
) {
  app.addHook('onResponse', async (request, reply) => {
    metrics.httpDuration.observe(
      {
        method: request.method,
        // Kimlik içeren gerçek yol yerine rota kalıbı (ör. /api/clips/:id).
        route: request.routeOptions.url ?? 'unmatched',
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  const token = config.METRICS_TOKEN;
  if (!token) return;
  const expected = Buffer.from(`Bearer ${token}`);

  app.get('/metrics', { config: { rateLimit: false } }, async (request, reply) => {
    const actual = Buffer.from(request.headers.authorization ?? '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });
}
