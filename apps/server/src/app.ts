import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@clipboard/shared';
import type { Config } from './config.js';

export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            // İçerik ve anahtarlar asla loglanmaz; IP'yi de loglamıyoruz.
            redact: ['req.headers.authorization', 'req.remoteAddress', 'req.remotePort'],
          },
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', uptime: process.uptime() };
  });

  return app;
}
