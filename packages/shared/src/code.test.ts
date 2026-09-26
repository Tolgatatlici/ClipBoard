import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  formatCode,
  isShortCodeId,
  isValidClipId,
  normalizeCode,
  parseCode,
  randomCodeString,
} from './code.js';

describe('randomCodeString', () => {
  it('uses only the Crockford alphabet', () => {
    const value = randomCodeString(500);
    expect(value).toHaveLength(500);
    for (const char of value) expect(CODE_ALPHABET).toContain(char);
  });
});

describe('isValidClipId', () => {
  it('accepts short and long ids', () => {
    expect(isValidClipId('AB12')).toBe(true);
    expect(isValidClipId('AB12CD34EF56')).toBe(true);
    expect(isShortCodeId('AB12')).toBe(true);
    expect(isShortCodeId('AB12CD34EF56')).toBe(false);
  });

  it('rejects other lengths and characters', () => {
    for (const id of ['', 'AB1', 'AB123', 'ab12', 'ABIL', 'AB1U', 'AB12CD34EF5']) {
      expect(isValidClipId(id)).toBe(false);
    }
  });
});

describe('parseCode', () => {
  it('splits a formatted code', () => {
    expect(parseCode('K7P4-QX9M')).toEqual({ id: 'K7P4', secret: 'QX9M' });
  });

  it('is forgiving about user input', () => {
    expect(normalizeCode(' k7p4 qx9m ')).toBe('K7P4QX9M');
    expect(parseCode('o1il-abcd')).toEqual({ id: '0111', secret: 'ABCD' });
  });

  it('rejects invalid codes', () => {
    expect(parseCode('K7P4')).toBeNull();
    expect(parseCode('K7P4-QX9M1')).toBeNull();
    expect(parseCode('K7P4-QX9U')).toBeNull();
  });

  it('round-trips with formatCode', () => {
    expect(parseCode(formatCode('ABCD', 'EFGH'))).toEqual({ id: 'ABCD', secret: 'EFGH' });
  });
});
