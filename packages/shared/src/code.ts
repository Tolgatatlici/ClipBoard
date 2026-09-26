/**
 * Kısa kodlar Crockford Base32 alfabesini kullanır: karışabilen I, L, O ve U harfleri yoktur.
 * Kod = kimlik (sunucunun gördüğü kısım) + gizli kısım (yalnızca istemcide kalır).
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CODE_ID_LENGTH = 4;
export const CODE_SECRET_LENGTH = 4;
export const CODE_LENGTH = CODE_ID_LENGTH + CODE_SECRET_LENGTH;
/** Kısa kodu olmayan (yalnızca link ile açılan) clip'lerin kimlik uzunluğu. */
export const LINK_ID_LENGTH = 12;

const ID_PATTERN = new RegExp(
  `^(?:[${CODE_ALPHABET}]{${CODE_ID_LENGTH}}|[${CODE_ALPHABET}]{${LINK_ID_LENGTH}})$`,
);

export function randomCodeString(length: number): string {
  // 256, 32'ye tam bölündüğü için `byte % 32` sapmasızdır.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export function isValidClipId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isShortCodeId(id: string): boolean {
  return id.length === CODE_ID_LENGTH && isValidClipId(id);
}

/** Kullanıcı girdisini normalize eder: büyük harf, ayraçları kaldırır, karışan harfleri düzeltir. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export interface ParsedCode {
  id: string;
  secret: string;
}

/** Kodu kimlik ve gizli kısma ayırır; geçersizse `null` döner. */
export function parseCode(input: string): ParsedCode | null {
  const code = normalizeCode(input);
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) if (!CODE_ALPHABET.includes(char)) return null;
  return { id: code.slice(0, CODE_ID_LENGTH), secret: code.slice(CODE_ID_LENGTH) };
}

/** `ABCDEFGH` → `ABCD-EFGH` */
export function formatCode(id: string, secret: string): string {
  return `${id}-${secret}`;
}
