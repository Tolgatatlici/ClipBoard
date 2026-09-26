/** Seçilebilir son kullanma süreleri (saniye). */
export const TTL_OPTIONS = {
  '5m': 5 * 60,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
} as const;

export type TtlOption = keyof typeof TTL_OPTIONS;

export const DEFAULT_TTL: TtlOption = '1h';

/** Kısa kodla erişilen clip'ler için izin verilen en uzun süre. */
export const MAX_SHORT_CODE_TTL: TtlOption = '1d';

export const LIMITS = {
  /** Düz metin için en fazla boyut (bayt). */
  maxTextBytes: 100 * 1024,
  /** Dosya yüklemeleri için en fazla boyut (bayt). */
  maxFileBytes: 25 * 1024 * 1024,
  /** Canlı odada tek WebSocket mesajı için en fazla boyut (bayt). */
  maxWsMessageBytes: 128 * 1024,
  /** Odada saklanan en fazla öğe sayısı. */
  maxRoomHistory: 50,
} as const;

/** Kısa kodla açmada izin verilen hatalı deneme sayısı; aşılınca kodla erişim kilitlenir. */
export const MAX_CODE_ATTEMPTS = 5;
