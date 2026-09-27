import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import type { Config } from '../config.js';

/**
 * Güvenlik başlıkları. İçerik tarayıcıda çözüldüğü için sayfaya enjekte edilen tek bir
 * betik bile anahtarları çalabilir; bu yüzden CSP satır içi betik ve stile izin vermez
 * ve sayfa yalnızca kendi sunucusuyla (ve S3 kullanılıyorsa depolamayla) konuşabilir.
 */
export async function securityHeaders(app: FastifyInstance, config: Config) {
  const isProduction = config.NODE_ENV === 'production';
  const storageOrigin =
    config.STORAGE_DRIVER === 's3' ? new URL(config.S3_ENDPOINT).origin : undefined;

  // WebSocket adresi `'self'` kapsamına her tarayıcıda girmediği için açıkça eklenir.
  const socketOrigins = (req: IncomingMessage) => {
    const host = req.headers.host ?? 'localhost';
    return isProduction ? `wss://${host}` : `ws://${host} wss://${host}`;
  };

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          (req) => socketOrigins(req as IncomingMessage),
          ...(storageOrigin ? [storageOrigin] : []),
        ],
        manifestSrc: ["'self'"],
        workerSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Linkteki `#` kısmı zaten gönderilmez; yine de yol bilgisini de sızdırmayalım.
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: false },
    crossOriginEmbedderPolicy: false,
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
  });
}
