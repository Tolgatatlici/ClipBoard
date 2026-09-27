import { z } from 'zod';
import { LIMITS } from './constants.js';

/**
 * Şifrelenen içerik: tek satırlık JSON başlık + `\n` + gövde.
 * Başlık türü (metin/dosya) ve biçimi taşır; sunucu bunları da göremez.
 * Metin, JSON kaçışlarıyla büyümesin diye başlığın dışında ham olarak durur.
 */
export const textFormatSchema = z.enum(['plain', 'code']);
export type TextFormat = z.infer<typeof textFormatSchema>;

const headerSchema = z.discriminatedUnion('kind', [
  z.object({ v: z.literal(1), kind: z.literal('text'), format: textFormatSchema }),
  z.object({
    v: z.literal(1),
    kind: z.literal('file'),
    name: z.string().min(1).max(255),
    mime: z.string().max(255),
    size: z.number().int().nonnegative().max(LIMITS.maxFileBytes),
  }),
]);

export type ClipContent =
  | { kind: 'text'; text: string; format: TextFormat }
  | { kind: 'file'; name: string; mime: string; size: number };

const encoder = new TextEncoder();

export function encodeContent(content: ClipContent): Uint8Array<ArrayBuffer> {
  const { header, body } =
    content.kind === 'text'
      ? { header: { v: 1, kind: 'text', format: content.format }, body: content.text }
      : {
          header: {
            v: 1,
            kind: 'file',
            name: content.name,
            mime: content.mime,
            size: content.size,
          },
          body: '',
        };
  const headerJson = JSON.stringify(header);
  if (encoder.encode(headerJson).length > LIMITS.maxContentHeaderBytes) {
    throw new Error('Content header too large');
  }
  return encoder.encode(`${headerJson}\n${body}`);
}

export function decodeContent(bytes: Uint8Array): ClipContent {
  const decoded = new TextDecoder().decode(bytes);
  const newline = decoded.indexOf('\n');
  if (newline === -1) throw new Error('Invalid content');
  const header = headerSchema.parse(JSON.parse(decoded.slice(0, newline)));
  if (header.kind === 'text') {
    return { kind: 'text', format: header.format, text: decoded.slice(newline + 1) };
  }
  return { kind: 'file', name: header.name, mime: header.mime, size: header.size };
}
