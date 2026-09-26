import { z } from 'zod';
import { TTL_OPTIONS, type TtlOption } from './constants.js';

export const ttlOptionSchema = z.enum(Object.keys(TTL_OPTIONS) as [TtlOption, ...TtlOption[]]);

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
