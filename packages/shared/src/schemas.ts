import { z } from 'zod';
import { isShortCodeId, isValidClipId, LINK_ID_LENGTH } from './code.js';
import { LIMITS, MAX_SHORT_CODE_TTL, TTL_OPTIONS, type TtlOption } from './constants.js';
import { BASE64URL_PATTERN, base64UrlLength } from './encoding.js';

const base64Url = (bytes: number) =>
  z.string().regex(BASE64URL_PATTERN, 'Must be base64url').max(base64UrlLength(bytes));
const base64UrlExact = (bytes: number) =>
  z.string().regex(BASE64URL_PATTERN, 'Must be base64url').length(base64UrlLength(bytes));

/** AES-GCM kimlik doğrulama etiketi uzunluğu (bayt). */
export const GCM_TAG_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BYTES = 32;

export const ttlOptionSchema = z.enum(Object.keys(TTL_OPTIONS) as [TtlOption, ...TtlOption[]]);
export const clipIdSchema = z.string().refine(isValidClipId, 'Invalid clip id');
export const accessTokenSchema = base64UrlExact(KEY_BYTES);
const ivSchema = base64UrlExact(IV_BYTES);

export const createClipRequestSchema = z
  .object({
    id: clipIdSchema,
    kind: z.literal('text'),
    ciphertext: base64Url(LIMITS.maxTextBytes + GCM_TAG_BYTES).min(1),
    iv: ivSchema,
    /** Link ile açmak için gereken erişim anahtarı; sunucu yalnızca özetini saklar. */
    linkToken: accessTokenSchema,
    /** Kısa kodla açma desteği: kodla türetilen anahtarla şifrelenmiş içerik anahtarı. */
    code: z
      .object({
        wrappedKey: base64UrlExact(KEY_BYTES + GCM_TAG_BYTES),
        wrapIv: ivSchema,
        token: accessTokenSchema,
      })
      .optional(),
    ttl: ttlOptionSchema,
    burnAfterRead: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.code) {
      if (!isShortCodeId(value.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['id'],
          message: 'Short code clips need a 4 char id',
        });
      }
      if (TTL_OPTIONS[value.ttl] > TTL_OPTIONS[MAX_SHORT_CODE_TTL]) {
        ctx.addIssue({ code: 'custom', path: ['ttl'], message: 'TTL too long for a short code' });
      }
    } else if (value.id.length !== LINK_ID_LENGTH) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'Link-only clips need a long id' });
    }
  });

export type CreateClipRequest = z.infer<typeof createClipRequestSchema>;

export const createClipResponseSchema = z.object({
  id: clipIdSchema,
  deleteToken: accessTokenSchema,
  expiresAt: z.number().int(),
});

export type CreateClipResponse = z.infer<typeof createClipResponseSchema>;

export const clipMetaResponseSchema = z.object({
  expiresAt: z.number().int(),
  burnAfterRead: z.boolean(),
  hasCode: z.boolean(),
});

export type ClipMetaResponse = z.infer<typeof clipMetaResponseSchema>;

export const accessMethodSchema = z.enum(['link', 'code']);
export type AccessMethod = z.infer<typeof accessMethodSchema>;

export const openClipRequestSchema = z.object({
  method: accessMethodSchema,
  token: accessTokenSchema,
});

export type OpenClipRequest = z.infer<typeof openClipRequestSchema>;

export const openClipResponseSchema = z.object({
  kind: z.literal('text'),
  ciphertext: z.string(),
  iv: z.string(),
  wrappedKey: z.string().optional(),
  wrapIv: z.string().optional(),
  burnAfterRead: z.boolean(),
  expiresAt: z.number().int(),
});

export type OpenClipResponse = z.infer<typeof openClipResponseSchema>;

export const ERROR_CODES = [
  'invalid_request',
  'not_found',
  'id_taken',
  'invalid_token',
  'code_locked',
  'rate_limited',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponseSchema = z.object({
  error: z.enum(ERROR_CODES),
  message: z.string().optional(),
  remainingAttempts: z.number().int().nonnegative().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
