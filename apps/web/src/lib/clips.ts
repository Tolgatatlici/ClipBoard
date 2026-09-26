import {
  codeAccess,
  formatCode,
  linkAccess,
  openText,
  sealText,
  type ClipAccess,
  type TtlOption,
} from '@clipboard/shared';
import { api, ApiError } from './api';
import { saveDeleteToken } from './delete-tokens';

export interface CreatedClip {
  id: string;
  /** `ABCD-EFGH` biçiminde kısa kod; istenmediyse `null`. */
  code: string | null;
  link: string;
  expiresAt: number;
  deleteToken: string;
  burnAfterRead: boolean;
}

export interface CreateOptions {
  ttl: TtlOption;
  burnAfterRead: boolean;
  withCode: boolean;
}

const MAX_ID_RETRIES = 3;

/** Metni tarayıcıda şifreler ve sunucuya kaydeder. */
export async function createTextClip(text: string, options: CreateOptions): Promise<CreatedClip> {
  for (let attempt = 1; ; attempt++) {
    const sealed = await sealText(text, { withCode: options.withCode });
    try {
      const created = await api.createClip({
        ...sealed.request,
        ttl: options.ttl,
        burnAfterRead: options.burnAfterRead,
      });
      saveDeleteToken(created.id, created.deleteToken, created.expiresAt);
      return {
        id: created.id,
        code: sealed.secret ? formatCode(sealed.id, sealed.secret) : null,
        link: `${window.location.origin}/c/${created.id}#k=${sealed.key}`,
        expiresAt: created.expiresAt,
        deleteToken: created.deleteToken,
        burnAfterRead: options.burnAfterRead,
      };
    } catch (err) {
      // Kısa kimlikler nadiren çakışabilir; yeni kimlikle yeniden dene.
      if (err instanceof ApiError && err.status === 409 && attempt < MAX_ID_RETRIES) continue;
      throw err;
    }
  }
}

/** Linkin `#` sonrası: `k=<anahtar>` (link) veya `s=<gizli kısım>` (kısa kod). */
export type ClipSecret = { kind: 'key'; value: string } | { kind: 'code'; value: string };

export function parseFragment(hash: string): ClipSecret | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const key = params.get('k');
  if (key) return { kind: 'key', value: key };
  const secret = params.get('s');
  if (secret) return { kind: 'code', value: secret };
  return null;
}

export interface OpenedClip {
  text: string;
  expiresAt: number;
  burnAfterRead: boolean;
}

export async function openTextClip(id: string, secret: ClipSecret): Promise<OpenedClip> {
  const access: ClipAccess =
    secret.kind === 'key' ? await linkAccess(secret.value) : await codeAccess(id, secret.value);
  const payload = await api.openClip(id, { method: access.method, token: access.token });
  const text = await openText(id, access, payload);
  return { text, expiresAt: payload.expiresAt, burnAfterRead: payload.burnAfterRead };
}
