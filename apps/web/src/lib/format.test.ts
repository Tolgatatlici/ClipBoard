import { createTranslate } from '../i18n/core';
import { formatBytes, formatRemaining, utf8Length } from './format';

const tr = createTranslate('tr');
const en = createTranslate('en');

describe('formatRemaining', () => {
  it.each([
    [0, 'süresi doldu'],
    [-5, 'süresi doldu'],
    [4_200, '5 sn'],
    [60_000, '1 dk'],
    [252_000, '4 dk 12 sn'],
    [3_600_000, '1 sa'],
    [83_100_000, '23 sa 5 dk'],
    [529_200_000, '6 gün 3 sa'],
    [604_800_000, '7 gün'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatRemaining(ms, tr)).toBe(expected);
  });

  it('formats in English', () => {
    expect(formatRemaining(252_000, en)).toBe('4 min 12 s');
    expect(formatRemaining(529_200_000, en)).toBe('6 d 3 h');
    expect(formatRemaining(0, en)).toBe('expired');
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(100 * 1024)).toBe('100 KB');
  });
});

describe('utf8Length', () => {
  it('counts bytes, not characters', () => {
    expect(utf8Length('ğ')).toBe(2);
    expect(utf8Length('🔐')).toBe(4);
  });
});
