/** Uint8Array → base64url (dolgusuz). */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → Uint8Array. Geçersiz girdide hata fırlatır. */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid base64url string');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** `bytes` uzunluğundaki verinin base64url karşılığının uzunluğu. */
export function base64UrlLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}
