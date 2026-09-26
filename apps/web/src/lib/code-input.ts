import { CODE_ID_LENGTH, normalizeCode } from '@clipboard/shared';

/** Yazarken `ABCD-EFGH` biçimine getirir. */
export function formatCodeInput(value: string): string {
  const code = normalizeCode(value).slice(0, 8);
  return code.length > CODE_ID_LENGTH
    ? `${code.slice(0, CODE_ID_LENGTH)}-${code.slice(CODE_ID_LENGTH)}`
    : code;
}
