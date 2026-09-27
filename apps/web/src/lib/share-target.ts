import { SHARE_CACHE, SHARED_FILE_KEY, SHARED_TEXT_KEY } from './share-target-keys';

export interface SharedData {
  text: string | null;
  file: File | null;
}

/**
 * Sistem paylaşım menüsünden gelen içeriği okur ve hemen siler; içerik
 * cihazda yalnızca bu aktarım anı kadar durur.
 */
export async function consumeSharedData(): Promise<SharedData | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(SHARE_CACHE);
  const [textResponse, fileResponse] = await Promise.all([
    cache.match(SHARED_TEXT_KEY),
    cache.match(SHARED_FILE_KEY),
  ]);
  await Promise.all([cache.delete(SHARED_TEXT_KEY), cache.delete(SHARED_FILE_KEY)]);

  const text = textResponse ? await textResponse.text() : null;
  let file: File | null = null;
  if (fileResponse) {
    const name = decodeURIComponent(fileResponse.headers.get('X-File-Name') ?? 'dosya');
    const type = fileResponse.headers.get('Content-Type') ?? '';
    file = new File([await fileResponse.blob()], name, { type });
  }
  return text || file ? { text, file } : null;
}
