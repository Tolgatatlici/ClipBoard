import {
  codeAccess,
  decryptBlob,
  encryptBlob,
  encryptedBlobSize,
  formatCode,
  LIMITS,
  linkAccess,
  openClip,
  sealClip,
  type Bytes,
  type ClipAccess,
  type ClipContent,
  type OpenClipResponse,
  type TextFormat,
  type TtlOption,
} from '@clipboard/shared';
import { api, ApiError, downloadBlob, uploadBlob } from './api';
import { saveDeleteToken } from './delete-tokens';

export interface CreatedClip {
  id: string;
  /** `ABCD-EFGH` biçiminde kısa kod; istenmediyse `null`. */
  code: string | null;
  link: string;
  expiresAt: number;
  deleteToken: string;
  burnAfterRead: boolean;
  hasPassword: boolean;
}

export type ShareInput =
  { kind: 'text'; text: string; format: TextFormat } | { kind: 'file'; file: File };

export interface CreateOptions {
  ttl: TtlOption;
  burnAfterRead: boolean;
  withCode: boolean;
  password?: string;
  /** Dosya yükleme ilerlemesi (0–1). */
  onProgress?: (fraction: number) => void;
}

export class FileTooLargeError extends Error {
  constructor() {
    super('File too large');
    this.name = 'FileTooLargeError';
  }
}

const MAX_ID_RETRIES = 3;

/** İçeriği tarayıcıda şifreler, dosyaysa yükler ve sunucuya kaydeder. */
export async function createClip(input: ShareInput, options: CreateOptions): Promise<CreatedClip> {
  let content: ClipContent;
  let fileBytes: Bytes | null = null;
  let fileId: string | undefined;
  let upload: Awaited<ReturnType<typeof api.createFile>>['upload'] | undefined;

  if (input.kind === 'file') {
    if (input.file.size > LIMITS.maxFileBytes) throw new FileTooLargeError();
    fileBytes = new Uint8Array(await input.file.arrayBuffer());
    content = {
      kind: 'file',
      name: input.file.name || 'dosya',
      mime: input.file.type,
      size: fileBytes.length,
    };
    const created = await api.createFile({
      size: encryptedBlobSize(fileBytes.length),
      ttl: options.ttl,
    });
    fileId = created.fileId;
    upload = created.upload;
  } else {
    content = { kind: 'text', text: input.text, format: input.format };
  }

  for (let attempt = 1; ; attempt++) {
    const sealed = await sealClip(content, {
      withCode: options.withCode,
      password: options.password || undefined,
      fileId,
    });
    if (fileBytes && fileId && upload) {
      const blob = await encryptBlob(sealed.fileKey, fileBytes, fileId);
      await uploadBlob(upload, blob, options.onProgress);
    }
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
        hasPassword: !!options.password,
      };
    } catch (err) {
      // Kısa kimlikler nadiren çakışabilir; yeni kimlikle (ve anahtarla) yeniden dene.
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

/** Sunucudan alınmış ama henüz çözülmemiş clip (parola denemeleri için saklanır). */
export interface FetchedClip {
  id: string;
  access: ClipAccess;
  payload: OpenClipResponse;
}

export async function fetchClip(id: string, secret: ClipSecret): Promise<FetchedClip> {
  const access =
    secret.kind === 'key' ? await linkAccess(secret.value) : await codeAccess(id, secret.value);
  const payload = await api.openClip(id, { method: access.method, token: access.token });
  return { id, access, payload };
}

export interface OpenedClip {
  content: ClipContent;
  expiresAt: number;
  burnAfterRead: boolean;
  /** Dosya clip'lerinde dosyayı indirip çözmek için. */
  file: { id: string; key: Bytes } | null;
}

export async function decryptClip(fetched: FetchedClip, password?: string): Promise<OpenedClip> {
  const { content, fileKey } = await openClip(
    fetched.id,
    fetched.access,
    fetched.payload,
    password,
  );
  const fileId = fetched.payload.fileId;
  return {
    content,
    expiresAt: fetched.payload.expiresAt,
    burnAfterRead: fetched.payload.burnAfterRead,
    file: content.kind === 'file' && fileId ? { id: fileId, key: fileKey } : null,
  };
}

/** Şifreli dosyayı indirip çözer. */
export async function downloadFile(file: { id: string; key: Bytes }): Promise<Bytes> {
  const blob = await downloadBlob(await api.getFileUrl(file.id));
  return decryptBlob(file.key, blob, file.id);
}
