import { randomBytes } from 'k6/crypto';
import encoding from 'k6/encoding';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const WS_URL = BASE_URL.replace(/^http/, 'ws');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function b64(bytes) {
  return encoding.b64encode(randomBytes(bytes), 'rawurl');
}

/** Sunucu içeriği çözmez; şemaya uyan rastgele "şifreli" veri yeterlidir. */
export function clipId(length = 12) {
  const bytes = new Uint8Array(randomBytes(length));
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % 32];
  return id;
}

export function fakeClip(contentBytes = 1024) {
  return {
    id: clipId(),
    kind: 'text',
    ciphertext: b64(contentBytes + 16),
    iv: b64(12),
    linkToken: b64(32),
    ttl: '5m',
    burnAfterRead: false,
  };
}
