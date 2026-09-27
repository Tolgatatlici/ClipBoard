/**
 * ECDH ile cihaz eşleştirme: odadaki bir cihaz, oda sırrını 6 haneli bir kodla yeni
 * bir cihaza güvenle aktarır.
 *
 * 1. Odadaki cihaz (ev sahibi) sunucudan tek kullanımlık bir eşleştirme kodu alır.
 * 2. Yeni cihaz kodu girer; iki cihaz sunucu üzerinden P-256 açık anahtarlarını değiştirir.
 * 3. İkisi de `ECDH` + `HKDF(kod ‖ açık anahtarlar)` ile aynı anahtarı ve 6 haneli bir
 *    doğrulama numarası (SAS) türetir. Sunucu araya girerse iki ekrandaki numara farklı olur.
 * 4. Kullanıcı numaraların aynı olduğunu onaylayınca ev sahibi oda sırrını bu anahtarla
 *    şifreleyip gönderir.
 *
 * Kod yalnızca buluşma noktasıdır; güvenlik ECDH ve doğrulama numarasından gelir.
 */
import { z } from 'zod';
import { aesDecrypt, aesEncrypt, DecryptionError, hkdf, type Bytes } from './crypto.js';
import { BASE64URL_PATTERN, base64UrlLength, fromBase64Url, toBase64Url } from './encoding.js';
import { KEY_BYTES } from './schemas.js';
import { isRoomSecret } from './room.js';

export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_TTL_SECONDS = 5 * 60;
/** P-256 sıkıştırılmamış açık anahtar: 65 bayt. */
const PUBLIC_KEY_BYTES = 65;

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();

export const pairingCodeSchema = z.string().regex(/^\d{6}$/);

/** Kullanıcı girdisinden rakamları alır: "123 456" → "123456". */
export function normalizePairingCode(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === PAIRING_CODE_LENGTH ? digits : null;
}

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export interface PairingKeys {
  keyPair: CryptoKeyPair;
  /** Karşı tarafa gönderilen açık anahtar (base64url). */
  publicKey: string;
}

export async function createPairingKeys(): Promise<PairingKeys> {
  const keyPair = (await subtle().generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', keyPair.publicKey));
  return { keyPair, publicKey: toBase64Url(raw) };
}

export interface PairingSecret {
  key: Bytes;
  /** İki ekranda karşılaştırılan doğrulama numarası ("123 456"). */
  sas: string;
}

/**
 * Ortak anahtarı ve doğrulama numarasını türetir. Kod ve her iki açık anahtar türetmeye
 * dahildir; biri değiştirilirse iki taraf farklı sonuç bulur.
 */
export async function derivePairing(options: {
  own: PairingKeys;
  peerPublicKey: string;
  code: string;
  hostPublicKey: string;
  guestPublicKey: string;
}): Promise<PairingSecret> {
  let peerRaw: Bytes;
  try {
    peerRaw = fromBase64Url(options.peerPublicKey);
  } catch {
    throw new DecryptionError();
  }
  const peer = await subtle().importKey('raw', peerRaw, ECDH, false, []);
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: peer }, options.own.keyPair.privateKey, 256),
  );
  const transcript = new Uint8Array(
    await subtle().digest(
      'SHA-256',
      encoder.encode(
        `clipboard/v1/pair|${options.code}|${options.hostPublicKey}|${options.guestPublicKey}`,
      ),
    ),
  );
  const material = new Uint8Array(shared.length + transcript.length);
  material.set(shared);
  material.set(transcript, shared.length);

  const key = await hkdf(material, 'clipboard/v1/pair-key');
  const sasBits = await hkdf(material, 'clipboard/v1/pair-sas');
  const number = new DataView(sasBits.buffer).getUint32(0) % 1_000_000;
  const digits = String(number).padStart(6, '0');
  return { key, sas: `${digits.slice(0, 3)} ${digits.slice(3)}` };
}

export async function sealRoomSecret(key: Bytes, secret: string, code: string) {
  const { ciphertext, iv } = await aesEncrypt(key, encoder.encode(secret), `pair:${code}`);
  return { ct: ciphertext, iv };
}

export async function openRoomSecret(
  key: Bytes,
  message: { ct: string; iv: string },
  code: string,
): Promise<string> {
  const secret = new TextDecoder().decode(
    await aesDecrypt(key, message.ct, message.iv, `pair:${code}`),
  );
  if (!isRoomSecret(secret)) throw new DecryptionError();
  return secret;
}

// --- API ve WebSocket protokolü ---------------------------------------------

export const createPairingResponseSchema = z.object({
  code: pairingCodeSchema,
  expiresAt: z.number().int(),
});

export type CreatePairingResponse = z.infer<typeof createPairingResponseSchema>;

const publicKeySchema = z
  .string()
  .regex(BASE64URL_PATTERN)
  .length(base64UrlLength(PUBLIC_KEY_BYTES));
const sealedSecretSchema = z.object({
  ct: z
    .string()
    .regex(BASE64URL_PATTERN)
    .max(base64UrlLength(KEY_BYTES * 2 + 32)),
  iv: z.string().regex(BASE64URL_PATTERN).length(16),
});

export const pairClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), publicKey: publicKeySchema }),
  z.object({ type: z.literal('secret'), secret: sealedSecretSchema }),
  z.object({ type: z.literal('cancel') }),
]);

export type PairClientMessage = z.infer<typeof pairClientMessageSchema>;

export const pairServerMessageSchema = z.discriminatedUnion('type', [
  /** Bağlantı kuruldu; ilk bağlanan ev sahibidir. */
  z.object({ type: z.literal('ready'), role: z.enum(['host', 'guest']) }),
  /** İki taraf da bağlandı; açık anahtarlar gönderilebilir. */
  z.object({ type: z.literal('paired') }),
  z.object({ type: z.literal('hello'), publicKey: publicKeySchema }),
  z.object({ type: z.literal('secret'), secret: sealedSecretSchema }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('peer-left') }),
]);

export type PairServerMessage = z.infer<typeof pairServerMessageSchema>;

/** Eşleştirme kodu yok, süresi dolmuş ya da kullanılmış. */
export const WS_CLOSE_PAIRING_NOT_FOUND = 4004;
/** Eşleştirmede zaten iki cihaz var. */
export const WS_CLOSE_PAIRING_BUSY = 4009;
