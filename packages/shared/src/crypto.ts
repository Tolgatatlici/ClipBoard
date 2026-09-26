/**
 * İstemci tarafı uçtan uca şifreleme (Web Crypto; tarayıcıda ve Node 22'de çalışır).
 *
 * - Her clip için rastgele 256-bit ana anahtar `K` üretilir; link `#` sonrasında `K`'yı taşır.
 * - İçerik, `HKDF(K, "content-key")` ile AES-256-GCM kullanılarak şifrelenir (AAD = clip id).
 * - Link erişim anahtarı `HKDF(K, "link-auth")`; sunucu yalnızca SHA-256 özetini görür.
 * - Kısa kod varsa: `PBKDF2(gizli kısım, id)` → 512 bit; ilk yarısı `K`'yı sarmalar,
 *   ikinci yarısı kod erişim anahtarıdır. Sunucu erişim anahtarını doğrulamadan veriyi vermez.
 */
import { CODE_ID_LENGTH, LINK_ID_LENGTH, randomCodeString, CODE_SECRET_LENGTH } from './code.js';
import { fromBase64Url, toBase64Url } from './encoding.js';
import { IV_BYTES, KEY_BYTES, type CreateClipRequest, type OpenClipResponse } from './schemas.js';

export const PBKDF2_ITERATIONS = 300_000;

const INFO_CONTENT_KEY = 'clipboard/v1/content-key';
const INFO_LINK_AUTH = 'clipboard/v1/link-auth';
const CODE_SALT_PREFIX = 'clipboard/v1/code:';

const encoder = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

type Bytes = Uint8Array<ArrayBuffer>;

function randomBytes(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

async function hkdf(keyMaterial: Bytes, info: string): Promise<Bytes> {
  const key = await subtle().importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

async function aesKey(raw: Bytes): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(rawKey: Bytes, plaintext: Bytes, aad: string) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    await aesKey(rawKey),
    plaintext,
  );
  return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

async function aesDecrypt(rawKey: Bytes, ciphertext: string, iv: string, aad: string) {
  try {
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(aad) },
      await aesKey(rawKey),
      fromBase64Url(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError();
  }
}

export class DecryptionError extends Error {
  constructor() {
    super('Content could not be decrypted');
    this.name = 'DecryptionError';
  }
}

async function deriveCodeMaterial(id: string, secret: string) {
  const baseKey = await subtle().importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await subtle().deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(CODE_SALT_PREFIX + id),
        iterations: PBKDF2_ITERATIONS,
      },
      baseKey,
      KEY_BYTES * 2 * 8,
    ),
  );
  return { wrapKey: bits.slice(0, KEY_BYTES), token: toBase64Url(bits.slice(KEY_BYTES)) };
}

export interface SealedClip {
  id: string;
  /** Kısa kodun gizli kısmı; kısa kod istenmediyse `null`. */
  secret: string | null;
  /** Linkin `#` sonrasına konan ana anahtar (base64url). */
  key: string;
  request: Pick<CreateClipRequest, 'id' | 'kind' | 'ciphertext' | 'iv' | 'linkToken' | 'code'>;
}

/** Metni şifreler ve sunucuya gönderilecek isteği hazırlar. */
export async function sealText(text: string, options: { withCode: boolean }): Promise<SealedClip> {
  const id = randomCodeString(options.withCode ? CODE_ID_LENGTH : LINK_ID_LENGTH);
  const masterKey = randomBytes(KEY_BYTES);
  const contentKey = await hkdf(masterKey, INFO_CONTENT_KEY);
  const { ciphertext, iv } = await aesEncrypt(contentKey, encoder.encode(text), id);
  const linkToken = toBase64Url(await hkdf(masterKey, INFO_LINK_AUTH));

  let secret: string | null = null;
  let code: CreateClipRequest['code'];
  if (options.withCode) {
    secret = randomCodeString(CODE_SECRET_LENGTH);
    const material = await deriveCodeMaterial(id, secret);
    const wrapped = await aesEncrypt(material.wrapKey, masterKey, id);
    code = { wrappedKey: wrapped.ciphertext, wrapIv: wrapped.iv, token: material.token };
  }

  return {
    id,
    secret,
    key: toBase64Url(masterKey),
    request: { id, kind: 'text', ciphertext, iv, linkToken, code },
  };
}

/** Sunucudan içerik almak için gereken erişim anahtarı ve içerik anahtarını çözme adımı. */
export interface ClipAccess {
  method: 'link' | 'code';
  token: string;
  resolveKey(payload: OpenClipResponse): Promise<Bytes>;
}

/** Linkteki ana anahtardan erişim bilgisi hazırlar. */
export async function linkAccess(key: string): Promise<ClipAccess> {
  let masterKey: Bytes;
  try {
    masterKey = fromBase64Url(key);
  } catch {
    throw new DecryptionError();
  }
  if (masterKey.length !== KEY_BYTES) throw new DecryptionError();
  return {
    method: 'link',
    token: toBase64Url(await hkdf(masterKey, INFO_LINK_AUTH)),
    resolveKey: async () => masterKey,
  };
}

/** Kısa koddan erişim bilgisi hazırlar (PBKDF2 nedeniyle birkaç yüz ms sürebilir). */
export async function codeAccess(id: string, secret: string): Promise<ClipAccess> {
  const material = await deriveCodeMaterial(id, secret);
  return {
    method: 'code',
    token: material.token,
    resolveKey: async (payload) => {
      if (!payload.wrappedKey || !payload.wrapIv) throw new DecryptionError();
      return aesDecrypt(material.wrapKey, payload.wrappedKey, payload.wrapIv, id);
    },
  };
}

/** Sunucudan gelen şifreli içeriği çözer. */
export async function openText(
  id: string,
  access: ClipAccess,
  payload: OpenClipResponse,
): Promise<string> {
  const masterKey = await access.resolveKey(payload);
  const contentKey = await hkdf(masterKey, INFO_CONTENT_KEY);
  const plaintext = await aesDecrypt(contentKey, payload.ciphertext, payload.iv, id);
  return new TextDecoder().decode(plaintext);
}
