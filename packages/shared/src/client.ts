/**
 * Tarayıcı dışı istemciler (komut satırı, tarayıcı eklentisi) için API istemcisi.
 * Şifreleme tamamen istemcide yapılır; sunucuya yalnızca şifreli veri gider.
 */
import { formatCode, parseCode } from './code.js';
import type { ClipContent, TextFormat } from './content.js';
import {
  codeAccess,
  decryptBlob,
  encryptBlob,
  encryptedBlobSize,
  linkAccess,
  openClip,
  sealClip,
  WrongPasswordError,
  type Bytes,
} from './crypto.js';
import {
  createClipResponseSchema,
  createFileResponseSchema,
  errorResponseSchema,
  fileDownloadResponseSchema,
  openClipResponseSchema,
  type ErrorResponse,
} from './schemas.js';
import type { TtlOption } from './constants.js';

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorResponse,
  ) {
    super(body.message ?? body.error);
    this.name = 'ClientApiError';
  }
}

export interface ShareOptions {
  ttl?: TtlOption;
  burnAfterRead?: boolean;
  withCode?: boolean;
  password?: string;
}

export interface Share {
  id: string;
  code: string | null;
  link: string;
  expiresAt: number;
  deleteToken: string;
}

/** Açılacak paylaşım: kısa kod ya da link. */
export interface ShareTarget {
  /** Linkten okunan sunucu adresi (kısa kodda yoktur). */
  server: string | null;
  id: string;
  secret: { kind: 'key'; value: string } | { kind: 'code'; value: string };
}

/** `https://…/c/<id>#k=<anahtar>`, `…#s=<gizli>` ya da `ABCD-EFGH` biçimini çözer. */
export function parseShareTarget(input: string): ShareTarget | null {
  const trimmed = input.trim();
  let url: URL | null;
  try {
    url = new URL(trimmed);
  } catch {
    url = null;
  }
  if (url) {
    const id = /^\/c\/([0-9A-Z]+)$/.exec(url.pathname)?.[1];
    const params = new URLSearchParams(url.hash.replace(/^#/, ''));
    const key = params.get('k');
    const secret = params.get('s');
    if (!id || (!key && !secret)) return null;
    return {
      server: url.origin,
      id,
      secret: key ? { kind: 'key', value: key } : { kind: 'code', value: secret! },
    };
  }
  const code = parseCode(trimmed);
  return code ? { server: null, id: code.id, secret: { kind: 'code', value: code.secret } } : null;
}

export interface OpenedShare {
  content: ClipContent;
  /** Dosya paylaşımlarında çözülmüş dosya içeriği. */
  file: Bytes | null;
  expiresAt: number;
  burnAfterRead: boolean;
}

const MAX_ID_RETRIES = 3;

export class ClipboardClient {
  readonly server: string;

  constructor(
    server: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.server = server.replace(/\/+$/, '');
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = /^https?:\/\//.test(path) ? path : this.server + path;
    const res = await this.fetchImpl(url, init);
    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
      throw new ClientApiError(res.status, parsed.success ? parsed.data : { error: 'internal' });
    }
    return res;
  }

  private async json(path: string, method: string, body?: unknown): Promise<unknown> {
    const res = await this.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return res.json();
  }

  shareText(text: string, options: ShareOptions & { format?: TextFormat } = {}): Promise<Share> {
    return this.share({ kind: 'text', text, format: options.format ?? 'plain' }, null, options);
  }

  async shareFile(
    data: Bytes,
    meta: { name: string; mime: string },
    options: ShareOptions = {},
  ): Promise<Share> {
    return this.share(
      { kind: 'file', name: meta.name, mime: meta.mime, size: data.length },
      data,
      options,
    );
  }

  private async share(content: ClipContent, data: Bytes | null, options: ShareOptions) {
    const ttl = options.ttl ?? '1h';
    let fileId: string | undefined;
    let upload: { url: string; headers: Record<string, string> } | undefined;
    if (data) {
      const created = createFileResponseSchema.parse(
        await this.json('/api/files', 'POST', { size: encryptedBlobSize(data.length), ttl }),
      );
      fileId = created.fileId;
      upload = created.upload;
    }

    for (let attempt = 1; ; attempt++) {
      const sealed = await sealClip(content, {
        withCode: options.withCode ?? true,
        password: options.password,
        fileId,
      });
      if (data && fileId && upload) {
        await this.request(upload.url, {
          method: 'PUT',
          headers: upload.headers,
          body: await encryptBlob(sealed.fileKey, data, fileId),
        });
      }
      try {
        const created = createClipResponseSchema.parse(
          await this.json('/api/clips', 'POST', {
            ...sealed.request,
            ttl,
            burnAfterRead: options.burnAfterRead ?? false,
          }),
        );
        return {
          id: created.id,
          code: sealed.secret ? formatCode(sealed.id, sealed.secret) : null,
          link: `${this.server}/c/${created.id}#k=${sealed.key}`,
          expiresAt: created.expiresAt,
          deleteToken: created.deleteToken,
        };
      } catch (err) {
        if (err instanceof ClientApiError && err.status === 409 && attempt < MAX_ID_RETRIES) {
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Paylaşımı açar. Parolalıysa `password` çağrılır; içerik yalnızca bir kez indirilir
   * (tek okumalık içerik ilk istekte silinir) ve parola yerelde en fazla
   * `passwordAttempts` kez denenir.
   */
  async open(
    target: ShareTarget,
    options: { password?: () => Promise<string>; passwordAttempts?: number } = {},
  ): Promise<OpenedShare> {
    const access =
      target.secret.kind === 'key'
        ? await linkAccess(target.secret.value)
        : await codeAccess(target.id, target.secret.value);
    const payload = openClipResponseSchema.parse(
      await this.json(`/api/clips/${target.id}/open`, 'POST', {
        method: access.method,
        token: access.token,
      }),
    );
    let opened: Awaited<ReturnType<typeof openClip>>;
    if (payload.passwordWrap && options.password) {
      const attempts = options.passwordAttempts ?? 3;
      for (let attempt = 1; ; attempt++) {
        try {
          opened = await openClip(target.id, access, payload, await options.password());
          break;
        } catch (err) {
          if (!(err instanceof WrongPasswordError) || attempt >= attempts) throw err;
        }
      }
    } else {
      opened = await openClip(target.id, access, payload);
    }
    let file: Bytes | null = null;
    if (opened.content.kind === 'file' && payload.fileId) {
      const { url } = fileDownloadResponseSchema.parse(
        await this.json(`/api/files/${payload.fileId}`, 'GET'),
      );
      const blob = new Uint8Array(await (await this.request(url)).arrayBuffer());
      file = await decryptBlob(opened.fileKey, blob, payload.fileId);
    }
    return {
      content: opened.content,
      file,
      expiresAt: payload.expiresAt,
      burnAfterRead: payload.burnAfterRead,
    };
  }

  async delete(id: string, deleteToken: string): Promise<void> {
    await this.request(`/api/clips/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${deleteToken}` },
    });
  }
}
