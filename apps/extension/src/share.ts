import { ClipboardClient, LIMITS, type Share, type TtlOption } from '@clipboard/shared';
import { getServer } from './settings';

export class TextTooLargeError extends Error {}

export interface ShareRequest {
  text: string;
  ttl: TtlOption;
  burnAfterRead: boolean;
}

/** Metni bu tarayıcıda şifreler ve paylaşım oluşturur. */
export async function createShare(request: ShareRequest, fetchImpl?: typeof fetch): Promise<Share> {
  if (new TextEncoder().encode(request.text).length > LIMITS.maxTextBytes) {
    throw new TextTooLargeError();
  }
  const client = new ClipboardClient(await getServer(), fetchImpl);
  return client.shareText(request.text, {
    ttl: request.ttl,
    burnAfterRead: request.burnAfterRead,
    withCode: true,
  });
}

export type StoredResult = { ok: true; share: Share } | { ok: false; error: string };

/**
 * Sağ tık menüsüyle oluşturulan paylaşımı sonuç sayfasına aktarır. Oturum
 * depolaması bellektedir ve tarayıcı kapanınca silinir.
 */
export async function saveResult(key: string, result: StoredResult): Promise<void> {
  await chrome.storage.session.set({ [`result:${key}`]: result });
}

export async function takeResult(key: string): Promise<StoredResult | null> {
  const storageKey = `result:${key}`;
  const stored = (await chrome.storage.session.get(storageKey))[storageKey] as
    StoredResult | undefined;
  return stored ?? null;
}
