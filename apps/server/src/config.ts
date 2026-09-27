import { z } from 'zod';

const iceServersSchema = z.array(
  z.object({
    urls: z.union([z.string(), z.array(z.string())]),
    username: z.string().optional(),
    credential: z.string().optional(),
  }),
);

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Ters vekil (Caddy, Fly.io) arkasında gerçek istemci IP'sini almak için. */
  TRUST_PROXY: z.stringbool().default(false),
  /** IP başına dakikadaki en fazla istek sayısı (genel sınır). */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  /** IP başına dakikada en fazla clip oluşturma, clip açma ve dosya yükleme isteği. */
  RATE_LIMIT_CREATE_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_OPEN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_FILE_MAX: z.coerce.number().int().positive().default(20),
  /** IP başına dakikada en fazla eşleştirme kodu. */
  RATE_LIMIT_PAIRING_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  /**
   * Doğrudan (P2P) dosya aktarımı için WebRTC ICE sunucuları, JSON dizisi:
   * `[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:…","username":"…","credential":"…"}]`.
   * Boşsa yalnızca aynı ağdaki cihazlar doğrudan bağlanabilir.
   */
  RTC_ICE_SERVERS: z
    .string()
    .default('[]')
    .transform((value, ctx) => {
      const parsed = iceServersSchema.safeParse(safeJson(value));
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Must be a JSON array of ICE servers' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  /** Verilirse `/metrics` bu anahtarla (Authorization: Bearer) açılır. */
  METRICS_TOKEN: z.string().min(16).optional(),
  /** Verilirse sunucu hataları Sentry'ye gönderilir (istek ayrıntıları olmadan). */
  SENTRY_DSN: z.url().optional(),
  /** Derlenmiş web arayüzünün dizini; verilirse sunucu arayüzü de sunar (tek imaj kurulumu). */
  STATIC_DIR: z.string().optional(),
  /** `local`: dosyalar sunucu diskinde (geliştirme/tek sunucu). `s3`: S3 uyumlu depolama. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./data/files'),
  /** Yerel sürücünün yükleme/indirme linklerini imzalamak için; boşsa açılışta rastgele üretilir. */
  FILE_SIGNING_SECRET: z.string().min(32).optional(),
  S3_ENDPOINT: z.url().default('http://localhost:8333'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('clipboard-files'),
  S3_ACCESS_KEY_ID: z.string().default('clipboard'),
  S3_SECRET_ACCESS_KEY: z.string().default('clipboard-dev-secret'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
