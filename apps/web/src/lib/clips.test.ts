import { parseFragment } from './clips';

describe('parseFragment', () => {
  it('reads a link key', () => {
    expect(parseFragment('#k=abc_-')).toEqual({ kind: 'key', value: 'abc_-' });
  });

  it('reads a code secret', () => {
    expect(parseFragment('#s=ABCD')).toEqual({ kind: 'code', value: 'ABCD' });
  });

  it('returns null without a secret', () => {
    expect(parseFragment('')).toBeNull();
    expect(parseFragment('#')).toBeNull();
    expect(parseFragment('#x=1')).toBeNull();
  });
});
