import {
  decryptBlob,
  encryptBlob,
  encryptedBlobSize,
  importKey,
  KEY_BYTES,
  LIMITS,
  openRoomItem,
  randomBytes,
  sealRoomItem,
  toBase64Url,
  type Bytes,
  type EncryptedRoomItem,
  type RoomContent,
  type RoomItem,
  type RoomSecrets,
  type TextFormat,
} from '@clipboard/shared';
import { api, downloadBlob, uploadBlob } from './api';
import { FileTooLargeError } from './clips';

export interface RoomEntry {
  id: string;
  ts: number;
  /** `null`: öğe çözülemedi (bozuk ya da başka anahtarla şifrelenmiş). */
  content: RoomContent | null;
}

export async function decryptItem(room: RoomSecrets, item: RoomItem): Promise<RoomEntry> {
  try {
    return { id: item.id, ts: item.ts, content: await openRoomItem(room, item) };
  } catch {
    return { id: item.id, ts: item.ts, content: null };
  }
}

/** Yeni öğeleri ekler; kimliğe göre tekilleştirir ve en yeni en üstte olacak şekilde sıralar. */
export function mergeEntries(current: RoomEntry[], incoming: RoomEntry[]): RoomEntry[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, LIMITS.maxRoomHistory);
}

export class RoomTextTooLargeError extends Error {
  constructor() {
    super('Text too large for a room message');
    this.name = 'RoomTextTooLargeError';
  }
}

export function textItem(
  room: RoomSecrets,
  text: string,
  format: TextFormat,
): Promise<EncryptedRoomItem> {
  if (new TextEncoder().encode(text).length > LIMITS.maxRoomTextBytes) {
    throw new RoomTextTooLargeError();
  }
  return sealRoomItem(room, { kind: 'text', text, format });
}

/** Dosyayı kendi anahtarıyla şifreleyip yükler; anahtarı taşıyan şifreli öğeyi döner. */
export async function fileItem(
  room: RoomSecrets,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<EncryptedRoomItem> {
  if (file.size > LIMITS.maxFileBytes) throw new FileTooLargeError();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = randomBytes(KEY_BYTES);
  // Oda 24 saat hareketsiz kalınca silinir; dosyalar da en fazla o kadar yaşar.
  const { fileId, upload } = await api.createFile({
    size: encryptedBlobSize(bytes.length),
    ttl: '1d',
  });
  await uploadBlob(upload, await encryptBlob(key, bytes, fileId), onProgress);
  return sealRoomItem(room, {
    kind: 'file',
    fileId,
    key: toBase64Url(key),
    name: file.name || 'dosya',
    mime: file.type,
    size: bytes.length,
  });
}

export async function downloadRoomFile(
  content: Extract<RoomContent, { kind: 'file' }>,
): Promise<Bytes> {
  const blob = await downloadBlob(await api.getFileUrl(content.fileId));
  return decryptBlob(importKey(content.key), blob, content.fileId);
}
