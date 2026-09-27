import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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
import { createMetrics, type Metrics } from './metrics.js';
import { initSentry, observability, reportError } from './plugins/observability.js';
import { securityHeaders } from './plugins/security-headers.js';
import { isPageRequest, staticSite } from './plugins/static-site.js';
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
  metrics?: Metrics;
}

/** Süresi dolan dosyaların ne sıklıkla silineceği. */
const FILE_SWEEP_INTERVAL_MS = 60_000;

/** En büyük şifreli metin (~137 KB) ve JSON zarfı için yeterli. */
const BODY_LIMIT = 256 * 1024;

export async function buildApp(
  config: Config,
  { redis, storage = createStorage(config), rooms, metrics = createMetrics() }: AppDeps,
): Promise<FastifyInstance> {
  initSentry(config);
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
    reportError(error);
    return reply.code(500).send({ error: 'internal' } satisfies ErrorResponse);
  });

  const staticDir = config.STATIC_DIR;
  app.setNotFoundHandler((request, reply) => {
    // Tek sayfalık uygulama: sayfa yolları index.html'e düşer, istemci yönlendirir.
    if (staticDir && isPageRequest(request.method, request.url, request.headers.accept)) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' } satisfies ErrorResponse);
  });

  await securityHeaders(app, config);
  await observability(app, { config, metrics });
  // Kök düzeyde kaydedilir ki 404 işleyicisi `sendFile` kullanabilsin.
  if (staticDir) await staticSite(app, { root: staticDir });
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
    // Redis geçici olarak erişilemezse istekleri 500 ile düşürmek yerine sınırlamayı atla.
    skipOnError: true,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // Yük dengeleyici ve uptime izleme için: Redis'e ulaşılamıyorsa 503 döner.
  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await redis.ping();
    } catch {
      return reply
        .code(503)
        .send({ error: 'internal', message: 'Redis unavailable' } satisfies ErrorResponse);
    }
    return { status: 'ok', uptime: process.uptime() } satisfies HealthResponse;
  });

  const files = new FileService(redis, storage);
  await app.register(clipRoutes, {
    store: new ClipStore(redis, MAX_CODE_ATTEMPTS),
    files,
    metrics,
    rateLimits: {
      create: Math.min(config.RATE_LIMIT_CREATE_MAX, config.RATE_LIMIT_MAX),
      open: Math.min(config.RATE_LIMIT_OPEN_MAX, config.RATE_LIMIT_MAX),
    },
  });
  await app.register(fileRoutes, {
    files,
    metrics,
    rateLimit: Math.min(config.RATE_LIMIT_FILE_MAX, config.RATE_LIMIT_MAX),
  });

  await app.register(websocket, { options: { maxPayload: LIMITS.maxWsMessageBytes } });
  // Pub/Sub aboneliği ayrı bir Redis bağlantısı gerektirir.
  const hub = new RoomHub(redis, redis.duplicate(), app.log, { ...rooms, metrics });
  await app.register(roomRoutes, { hub });
  app.addHook('preClose', async () => hub.close());

  const sweeper = setInterval(() => {
    files
      .sweep()
      .then((deleted) => metrics.filesDeleted.inc(deleted))
      .catch((err: unknown) => {
        app.log.error(err, 'file sweep failed');
        reportError(err);
      });
  }, FILE_SWEEP_INTERVAL_MS);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  return app;
}
