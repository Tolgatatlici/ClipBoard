/**
 * İstemci tarafı uçtan uca şifreleme (Web Crypto; tarayıcıda ve Node 22'de çalışır).
 *
 * - Her clip için rastgele 256-bit ana anahtar `K` üretilir.
 * - İçerik, `HKDF(K, "content-key")` ile AES-256-GCM kullanılarak şifrelenir (AAD = clip id).
 *   Dosyalar `HKDF(K, "file-key")` ile ayrıca şifrelenir (AAD = dosya kimliği).
 * - Link `#` sonrasında bir "link sırrı" `L` taşır. Parola yoksa `L = K`.
 *   Parola varsa `L` rastgeledir ve `K`, `HKDF(L ‖ PBKDF2(parola))` ile sarmalanır:
 *   içeriği açmak için hem link hem parola gerekir.
 * - Link erişim anahtarı `HKDF(L, "link-auth")`; sunucu yalnızca SHA-256 özetini görür.
 * - Kısa kod varsa: `PBKDF2(gizli kısım, id)` → 512 bit; ilk yarısı `K`'yı sarmalar,
 *   ikinci yarısı kod erişim anahtarıdır. Sunucu erişim anahtarını doğrulamadan veriyi vermez.
 */
import { CODE_ID_LENGTH, CODE_SECRET_LENGTH, LINK_ID_LENGTH, randomCodeString } from './code.js';
import { decodeContent, encodeContent, type ClipContent } from './content.js';
import { fromBase64Url, toBase64Url } from './encoding.js';
import {
  IV_BYTES,
  KEY_BYTES,
  SALT_BYTES,
  type CreateClipRequest,
  type OpenClipResponse,
} from './schemas.js';

export const PBKDF2_ITERATIONS = 300_000;
export const PASSWORD_PBKDF2_ITERATIONS = 600_000;

const INFO_CONTENT_KEY = 'clipboard/v1/content-key';
const INFO_FILE_KEY = 'clipboard/v1/file-key';
const INFO_LINK_AUTH = 'clipboard/v1/link-auth';
const INFO_PASSWORD_WRAP = 'clipboard/v1/password-wrap';
const CODE_SALT_PREFIX = 'clipboard/v1/code:';

const encoder = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export type Bytes = Uint8Array<ArrayBuffer>;

export class DecryptionError extends Error {
  constructor(message = 'Content could not be decrypted') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** İçerik parola korumalı ve parola verilmedi. */
export class PasswordRequiredError extends Error {
  constructor() {
    super('Password required');
    this.name = 'PasswordRequiredError';
  }
}

export class WrongPasswordError extends DecryptionError {
  constructor() {
    super('Wrong password');
    this.name = 'WrongPasswordError';
  }
}

export function randomBytes(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function hkdf(keyMaterial: Bytes, info: string): Promise<Bytes> {
  const key = await subtle().importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

async function pbkdf2(secret: string, salt: Bytes, iterations: number, bytes: number) {
  const baseKey = await subtle().importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

async function aesKey(raw: Bytes): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM ile şifreler; sonucu base64url olarak döner. */
export async function aesEncrypt(rawKey: Bytes, plaintext: Bytes, aad: string) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    await aesKey(rawKey),
    plaintext,
  );
  return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function aesDecrypt(
  rawKey: Bytes,
  ciphertext: string,
  iv: string,
  aad: string,
): Promise<Bytes> {
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

/** İkili veriyi (dosya) şifreler: çıktı `IV ‖ şifreli veri ‖ etiket`. */
export async function encryptBlob(rawKey: Bytes, plaintext: Bytes, aad: string): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
      await aesKey(rawKey),
      plaintext,
    ),
  );
  const out = new Uint8Array(IV_BYTES + ciphertext.length);
  out.set(iv);
  out.set(ciphertext, IV_BYTES);
  return out;
}

export async function decryptBlob(rawKey: Bytes, blob: Bytes, aad: string): Promise<Bytes> {
  try {
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: blob.slice(0, IV_BYTES), additionalData: encoder.encode(aad) },
      await aesKey(rawKey),
      blob.slice(IV_BYTES),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError();
  }
}

/** Şifreli dosyanın boyutu. */
export function encryptedBlobSize(plaintextSize: number): number {
  return IV_BYTES + plaintextSize + 16;
}

function decodeKey(value: string): Bytes {
  let bytes: Bytes;
  try {
    bytes = fromBase64Url(value);
  } catch {
    throw new DecryptionError();
  }
  if (bytes.length !== KEY_BYTES) throw new DecryptionError();
  return bytes;
}

async function deriveCodeMaterial(id: string, secret: string) {
  const bits = await pbkdf2(
    secret,
    encoder.encode(CODE_SALT_PREFIX + id),
    PBKDF2_ITERATIONS,
    KEY_BYTES * 2,
  );
  return { wrapKey: bits.slice(0, KEY_BYTES), token: toBase64Url(bits.slice(KEY_BYTES)) };
}

async function passwordWrapKey(linkSecret: Bytes, password: string, salt: Bytes) {
  const passwordBits = await pbkdf2(password, salt, PASSWORD_PBKDF2_ITERATIONS, KEY_BYTES);
  const material = new Uint8Array(KEY_BYTES * 2);
  material.set(linkSecret);
  material.set(passwordBits, KEY_BYTES);
  return hkdf(material, INFO_PASSWORD_WRAP);
}

export interface SealOptions {
  withCode: boolean;
  password?: string;
  /** Dosya clip'leri için, önceden alınmış dosya kimliği. */
  fileId?: string;
}

export interface SealedClip {
  id: string;
  /** Kısa kodun gizli kısmı; kısa kod istenmediyse `null`. */
  secret: string | null;
  /** Linkin `#k=` kısmına konan link sırrı (base64url). */
  key: string;
  /** Dosya içeriğini şifrelemek için anahtar (`encryptBlob`). */
  fileKey: Bytes;
  request: Pick<
    CreateClipRequest,
    'id' | 'kind' | 'ciphertext' | 'iv' | 'linkToken' | 'code' | 'passwordWrap' | 'fileId'
  >;
}

/** İçeriği şifreler ve sunucuya gönderilecek isteği hazırlar. */
export async function sealClip(content: ClipContent, options: SealOptions): Promise<SealedClip> {
  const withCode = options.withCode && !options.password;
  const id = randomCodeString(withCode ? CODE_ID_LENGTH : LINK_ID_LENGTH);
  const masterKey = randomBytes(KEY_BYTES);
  const contentKey = await hkdf(masterKey, INFO_CONTENT_KEY);
  const { ciphertext, iv } = await aesEncrypt(contentKey, encodeContent(content), id);

  let linkSecret = masterKey;
  let passwordWrap: CreateClipRequest['passwordWrap'];
  if (options.password) {
    linkSecret = randomBytes(KEY_BYTES);
    const salt = randomBytes(SALT_BYTES);
    const wrapKey = await passwordWrapKey(linkSecret, options.password, salt);
    const wrapped = await aesEncrypt(wrapKey, masterKey, id);
    passwordWrap = { salt: toBase64Url(salt), wrappedKey: wrapped.ciphertext, wrapIv: wrapped.iv };
  }

  let secret: string | null = null;
  let code: CreateClipRequest['code'];
  if (withCode) {
    secret = randomCodeString(CODE_SECRET_LENGTH);
    const material = await deriveCodeMaterial(id, secret);
    const wrapped = await aesEncrypt(material.wrapKey, masterKey, id);
    code = { wrappedKey: wrapped.ciphertext, wrapIv: wrapped.iv, token: material.token };
  }

  return {
    id,
    secret,
    key: toBase64Url(linkSecret),
    fileKey: await hkdf(masterKey, INFO_FILE_KEY),
    request: {
      id,
      kind: content.kind,
      ciphertext,
      iv,
      linkToken: toBase64Url(await hkdf(linkSecret, INFO_LINK_AUTH)),
      code,
      passwordWrap,
      fileId: options.fileId,
    },
  };
}

/** Sunucudan içerik almak için gereken erişim anahtarı ve ana anahtarı çözme adımı. */
export interface ClipAccess {
  method: 'link' | 'code';
  token: string;
  resolveKey(id: string, payload: OpenClipResponse, password?: string): Promise<Bytes>;
}

/** Linkteki sırdan erişim bilgisi hazırlar. */
export async function linkAccess(key: string): Promise<ClipAccess> {
  const linkSecret = decodeKey(key);
  return {
    method: 'link',
    token: toBase64Url(await hkdf(linkSecret, INFO_LINK_AUTH)),
    resolveKey: async (id, payload, password) => {
      const wrap = payload.passwordWrap;
      if (!wrap) return linkSecret;
      if (!password) throw new PasswordRequiredError();
      const wrapKey = await passwordWrapKey(linkSecret, password, fromBase64Url(wrap.salt));
      try {
        return await aesDecrypt(wrapKey, wrap.wrappedKey, wrap.wrapIv, id);
      } catch {
        throw new WrongPasswordError();
      }
    },
  };
}

/** Kısa koddan erişim bilgisi hazırlar (PBKDF2 nedeniyle birkaç yüz ms sürebilir). */
export async function codeAccess(id: string, secret: string): Promise<ClipAccess> {
  const material = await deriveCodeMaterial(id, secret);
  return {
    method: 'code',
    token: material.token,
    resolveKey: async (clipId, payload) => {
      if (clipId !== id || !payload.wrappedKey || !payload.wrapIv) throw new DecryptionError();
      return aesDecrypt(material.wrapKey, payload.wrappedKey, payload.wrapIv, id);
    },
  };
}

export interface OpenedContent {
  content: ClipContent;
  /** Dosya clip'lerinde dosyayı çözmek için anahtar. */
  fileKey: Bytes;
}

/** Sunucudan gelen şifreli içeriği çözer. Parolalıysa `password` gerekir. */
export async function openClip(
  id: string,
  access: ClipAccess,
  payload: OpenClipResponse,
  password?: string,
): Promise<OpenedContent> {
  const masterKey = await access.resolveKey(id, payload, password);
  const contentKey = await hkdf(masterKey, INFO_CONTENT_KEY);
  const plaintext = await aesDecrypt(contentKey, payload.ciphertext, payload.iv, id);
  let content: ClipContent;
  try {
    content = decodeContent(plaintext);
  } catch {
    throw new DecryptionError();
  }
  return { content, fileKey: await hkdf(masterKey, INFO_FILE_KEY) };
}

/** Anahtarı base64url'den çözer (ör. oda mesajlarındaki dosya anahtarları). */
export function importKey(value: string): Bytes {
  return decodeKey(value);
}
