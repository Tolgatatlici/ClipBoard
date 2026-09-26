import { describe, expect, it } from 'vitest';
import { DEFAULT_TTL, TTL_OPTIONS } from './constants.js';
import { ttlOptionSchema } from './schemas.js';

describe('ttlOptionSchema', () => {
  it('accepts every configured TTL option', () => {
    for (const key of Object.keys(TTL_OPTIONS)) {
      expect(ttlOptionSchema.parse(key)).toBe(key);
    }
  });

  it('rejects unknown values', () => {
    expect(ttlOptionSchema.safeParse('30d').success).toBe(false);
  });

  it('has a valid default', () => {
    expect(ttlOptionSchema.parse(DEFAULT_TTL)).toBe(DEFAULT_TTL);
  });
});
