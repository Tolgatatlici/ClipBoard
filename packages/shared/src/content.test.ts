import { describe, expect, it } from 'vitest';
import { decodeContent, encodeContent, type ClipContent } from './content.js';

describe('content envelope', () => {
  it.each<ClipContent>([
    { kind: 'text', format: 'plain', text: '' },
    { kind: 'text', format: 'code', text: 'const a = "\\n";\n{"v":2}\n' },
    { kind: 'file', name: 'rapor ğüş.pdf', mime: 'application/pdf', size: 1234 },
  ])('round-trips %o', (content) => {
    expect(decodeContent(encodeContent(content))).toEqual(content);
  });

  it('keeps text raw instead of JSON-escaping it', () => {
    const text = '"'.repeat(1000);
    expect(encodeContent({ kind: 'text', format: 'plain', text }).length).toBeLessThan(1100);
  });

  it('rejects oversized headers', () => {
    expect(() =>
      encodeContent({ kind: 'file', name: 'x'.repeat(2000), mime: '', size: 1 }),
    ).toThrow();
  });

  it('rejects malformed content', () => {
    const encoder = new TextEncoder();
    expect(() => decodeContent(encoder.encode('no header'))).toThrow();
    expect(() => decodeContent(encoder.encode('{"v":9,"kind":"text"}\nx'))).toThrow();
  });
});
