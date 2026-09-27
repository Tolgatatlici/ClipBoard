import { CODE_ID_LENGTH, CODE_LENGTH, normalizeCode } from '@clipboard/shared';

/**
 * Yazarken kodu gruplara ayırır: varsayılan `ABCD-EFGH` (clip), oda için `ABCDE-FGHJK`.
 */
export function formatCodeInput(value: string, length = CODE_LENGTH, split = CODE_ID_LENGTH) {
  const code = normalizeCode(value).slice(0, length);
  return code.length > split ? `${code.slice(0, split)}-${code.slice(split)}` : code;
}
