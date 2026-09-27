import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type { Redis } from 'ioredis';
import {
  LIMITS,
  MAX_CODE_ATTEMPTS,
  type ErrorResponse,
  type HealthResponse,
} from '@clipboard/shared';
import type { Config } from './config.js';
import { clipRoutes } from './routes/clips.js';
import { fileRoutes } from './routes/files.js';
import { roomRoutes } from './routes/rooms.js';
import { RoomHub, type RoomHubOptions } from './rooms/hub.js';
import { ClipStore } from './services/clip-store.js';
import { FileService } from './services/file-service.js';
import { createStorage, type FileStorage } from './services/storage/index.js';

export interface AppDeps {
  redis: Redis;
  /** Varsayılan: yapılandırmaya göre yerel disk veya S3. */
  storage?: FileStorage;
  rooms?: RoomHubOptions;
}

/** Süresi dolan dosyaların ne sıklıkla silineceği. */
const FILE_SWEEP_INTERVAL_MS = 60_000;

/** En büyük şifreli metin (~137 KB) ve JSON zarfı için yeterli. */
const BODY_LIMIT = 256 * 1024;

export async function buildApp(
  config: Config,
  { redis, storage = createStorage(config), rooms }: AppDeps,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    trustProxy: config.TRUST_PROXY,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            // İçerik ve anahtarlar asla loglanmaz; IP'yi de loglamıyoruz.
            redact: ['req.headers.authorization', 'req.remoteAddress', 'req.remotePort'],
          },
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return reply.code(429).send({ error: 'rate_limited' } satisfies ErrorResponse);
    }
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ error: 'invalid_request', message: error.message } satisfies ErrorResponse);
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal' } satisfies ErrorResponse);
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'not_found' } satisfies ErrorResponse);
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'rl:',
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', uptime: process.uptime() };
  });

  const files = new FileService(redis, storage);
  await app.register(clipRoutes, {
    store: new ClipStore(redis, MAX_CODE_ATTEMPTS),
    files,
    rateLimits: {
      create: Math.min(config.RATE_LIMIT_CREATE_MAX, config.RATE_LIMIT_MAX),
      open: Math.min(config.RATE_LIMIT_OPEN_MAX, config.RATE_LIMIT_MAX),
    },
  });
  await app.register(fileRoutes, {
    files,
    rateLimit: Math.min(config.RATE_LIMIT_FILE_MAX, config.RATE_LIMIT_MAX),
  });

  await app.register(websocket, { options: { maxPayload: LIMITS.maxWsMessageBytes } });
  // Pub/Sub aboneliği ayrı bir Redis bağlantısı gerektirir.
  const hub = new RoomHub(redis, redis.duplicate(), app.log, rooms);
  await app.register(roomRoutes, { hub });
  app.addHook('preClose', async () => hub.close());

  const sweeper = setInterval(() => {
    files.sweep().catch((err: unknown) => app.log.error(err, 'file sweep failed'));
  }, FILE_SWEEP_INTERVAL_MS);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  return app;
}
