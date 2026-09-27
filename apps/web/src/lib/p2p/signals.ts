import { z } from 'zod';

const id = z.string().min(8).max(64);
const sdp = z.string().max(64 * 1024);

/** Oda anahtarıyla şifreli taşınan P2P sinyal mesajları. */
export const signalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('announce'),
    transferId: id,
    from: id,
    name: z.string().min(1).max(255),
    size: z.number().int().positive(),
    mime: z.string().max(255),
  }),
  z.object({ kind: z.literal('accept'), transferId: id, from: id, to: id }),
  z.object({ kind: z.literal('decline'), transferId: id, from: id, to: id }),
  z.object({ kind: z.literal('offer'), transferId: id, from: id, to: id, sdp }),
  z.object({ kind: z.literal('answer'), transferId: id, from: id, to: id, sdp }),
  z.object({ kind: z.literal('cancel'), transferId: id, from: id }),
]);

export type Signal = z.infer<typeof signalSchema>;
