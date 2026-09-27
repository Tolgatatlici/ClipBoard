/**
 * Canlı oda: iki veya daha fazla cihaz aynı odada gerçek zamanlı içerik paylaşır.
 *
 * Her oda rastgele 256 bitlik bir sırdan türetilir: `HKDF(sır)` → sunucunun gördüğü
 * oda kimliği ve mesajları şifreleyen anahtar. Sır link/QR'ın `#` kısmında taşınır ya da
 * yeni cihaza ECDH eşleştirmesiyle (bkz. pairing.ts) şifreli olarak aktarılır; sunucu
 * sırrı, anahtarı ve içeriği göremez, veritabanı ele geçirilse bile denenecek kısa bir
 * kod yoktur.
 */
import { z } from 'zod';
import { textFormatSchema, type TextFormat } from './content.js';
import { LIMITS } from './constants.js';
import {
  aesDecrypt,
  aesEncrypt,
  DecryptionError,
  hkdf,
  importKey,
  randomBytes,
  type Bytes,
} from './crypto.js';
import { BASE64URL_PATTERN, base64UrlLength, toBase64Url } from './encoding.js';
import { FILE_ID_BYTES, GCM_TAG_BYTES, IV_BYTES, KEY_BYTES } from './schemas.js';

export const ROOM_ID_BYTES = 16;
const INFO_ROOM_ID = 'clipboard/v1/room-id';
const INFO_ROOM_KEY = 'clipboard/v1/room-key';

/** Yeni bir oda sırrı (base64url, 43 karakter). */
export function generateRoomSecret(): string {
  return toBase64Url(randomBytes(KEY_BYTES));
}

/** Link `#` kısmındaki değer geçerli bir oda sırrı mı? */
export function isRoomSecret(value: string): boolean {
  return BASE64URL_PATTERN.test(value) && value.length === base64UrlLength(KEY_BYTES);
}

export interface RoomSecrets {
  roomId: string;
  key: Bytes;
}

export async function roomFromSecret(secret: string): Promise<RoomSecrets> {
  const material = importKey(secret);
  const id = await hkdf(material, INFO_ROOM_ID);
  return {
    roomId: toBase64Url(id.slice(0, ROOM_ID_BYTES)),
    key: await hkdf(material, INFO_ROOM_KEY),
  };
}

// --- Şifreli oda öğeleri ---------------------------------------------------

export type RoomContent =
  | { kind: 'text'; text: string; format: TextFormat }
  | {
      kind: 'file';
      fileId: string;
      /** Dosyayı çözen anahtar (base64url); yalnızca şifreli öğenin içinde dolaşır. */
      key: string;
      name: string;
      mime: string;
      size: number;
    };

const roomHeaderSchema = z.discriminatedUnion('kind', [
  z.object({ v: z.literal(1), kind: z.literal('text'), format: textFormatSchema }),
  z.object({
    v: z.literal(1),
    kind: z.literal('file'),
    fileId: z.string().regex(BASE64URL_PATTERN).length(base64UrlLength(FILE_ID_BYTES)),
    key: z.string().regex(BASE64URL_PATTERN).length(base64UrlLength(KEY_BYTES)),
    name: z.string().min(1).max(255),
    mime: z.string().max(255),
    size: z.number().int().nonnegative().max(LIMITS.maxFileBytes),
  }),
]);

export interface EncryptedRoomItem {
  ct: string;
  iv: string;
}

export async function sealRoomItem(
  room: RoomSecrets,
  content: RoomContent,
): Promise<EncryptedRoomItem> {
  const { kind } = content;
  const header =
    kind === 'text'
      ? { v: 1, kind, format: content.format }
      : {
          v: 1,
          kind,
          fileId: content.fileId,
          key: content.key,
          name: content.name,
          mime: content.mime,
          size: content.size,
        };
  const body = kind === 'text' ? content.text : '';
  const plaintext = new TextEncoder().encode(`${JSON.stringify(header)}\n${body}`);
  const { ciphertext, iv } = await aesEncrypt(room.key, plaintext, room.roomId);
  return { ct: ciphertext, iv };
}

export async function openRoomItem(
  room: RoomSecrets,
  item: EncryptedRoomItem,
): Promise<RoomContent> {
  const plaintext = new TextDecoder().decode(
    await aesDecrypt(room.key, item.ct, item.iv, room.roomId),
  );
  const newline = plaintext.indexOf('\n');
  try {
    const header = roomHeaderSchema.parse(JSON.parse(plaintext.slice(0, newline)));
    if (header.kind === 'text') {
      return { kind: 'text', format: header.format, text: plaintext.slice(newline + 1) };
    }
    const { fileId, key, name, mime, size } = header;
    return { kind: 'file', fileId, key, name, mime, size };
  } catch {
    throw new DecryptionError();
  }
}

// --- WebSocket protokolü -----------------------------------------------------

export const roomIdSchema = z
  .string()
  .regex(BASE64URL_PATTERN)
  .length(base64UrlLength(ROOM_ID_BYTES));

/** Şifreli bir oda öğesinin en fazla boyutu (metin + başlık + etiket). */
const MAX_ROOM_ITEM_BYTES =
  LIMITS.maxRoomTextBytes + LIMITS.maxContentHeaderBytes + 1 + GCM_TAG_BYTES;

export const encryptedRoomItemSchema = z.object({
  ct: z.string().regex(BASE64URL_PATTERN).min(1).max(base64UrlLength(MAX_ROOM_ITEM_BYTES)),
  iv: z.string().regex(BASE64URL_PATTERN).length(base64UrlLength(IV_BYTES)),
});

export const roomItemSchema = encryptedRoomItemSchema.extend({
  id: z.string(),
  ts: z.number().int(),
});

export type RoomItem = z.infer<typeof roomItemSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item'), item: encryptedRoomItemSchema }),
  z.object({ type: z.literal('typing') }),
  z.object({ type: z.literal('clear') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const ROOM_ERROR_CODES = ['rate_limited', 'invalid_message', 'room_full'] as const;
export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    peers: z.number().int(),
    history: z.array(roomItemSchema),
  }),
  z.object({ type: z.literal('item'), item: roomItemSchema }),
  z.object({ type: z.literal('presence'), peers: z.number().int() }),
  z.object({ type: z.literal('typing') }),
  z.object({ type: z.literal('cleared') }),
  z.object({ type: z.literal('error'), code: z.enum(ROOM_ERROR_CODES) }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Oda doluysa sunucunun bağlantıyı kapatırken kullandığı kod. */
export const WS_CLOSE_ROOM_FULL = 4001;
