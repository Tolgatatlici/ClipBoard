import { z } from 'zod';

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
  REDIS_URL: z.url().default('redis://localhost:6379'),
  /** `local`: dosyalar sunucu diskinde (geliştirme/tek sunucu). `s3`: S3 uyumlu depolama. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./data/files'),
  /** Yerel sürücünün yükleme/indirme linklerini imzalamak için; boşsa açılışta rastgele üretilir. */
  FILE_SIGNING_SECRET: z.string().min(32).optional(),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('clipboard-files'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
