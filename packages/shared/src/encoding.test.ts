import { describe, expect, it } from 'vitest';
import { base64UrlLength, fromBase64Url, toBase64Url } from './encoding.js';

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      const encoded = toBase64Url(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(encoded).toHaveLength(base64UrlLength(length));
      expect(fromBase64Url(encoded)).toEqual(bytes);
    }
  });

  it('matches the standard encoding', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
  });

  it('rejects invalid characters', () => {
    expect(() => fromBase64Url('abc+')).toThrow();
    expect(() => fromBase64Url('a b')).toThrow();
  });
});
