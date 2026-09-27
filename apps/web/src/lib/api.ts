import {
  clipMetaResponseSchema,
  createClipResponseSchema,
  createFileResponseSchema,
  fileDownloadResponseSchema,
  errorResponseSchema,
  openClipResponseSchema,
  type ClipMetaResponse,
  type CreateClipRequest,
  type CreateClipResponse,
  type CreateFileRequest,
  type CreateReportRequest,
  type CreateFileResponse,
  type ErrorResponse,
  type OpenClipRequest,
  type OpenClipResponse,
} from '@clipboard/shared';
import type { z } from 'zod';

const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** Sunucunun döndürdüğü göreli adresleri (yerel dosya sürücüsü) API adresine bağlar. */
export function resolveApiUrl(url: string): string {
  return url.startsWith('/') ? API_BASE + url : url;
}

/** Sunucu bir hata yanıtı döndürdüğünde fırlatılır. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorResponse,
  ) {
    super(body.message ?? body.error);
    this.name = 'ApiError';
  }
}

/** Sunucuya hiç ulaşılamadığında fırlatılır. */
export class NetworkError extends Error {
  constructor() {
    super('Network request failed');
    this.name = 'NetworkError';
  }
}

async function request<T>(path: string, init: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      // Gövdesiz isteklerde (DELETE) JSON başlığı gönderilirse Fastify 400 döner.
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    throw new ApiError(res.status, parsed.success ? parsed.data : { error: 'internal' });
  }
  if (!schema) return undefined as T;
  return schema.parse(await res.json());
}

export const api = {
  createClip(body: CreateClipRequest): Promise<CreateClipResponse> {
    return request(
      '/api/clips',
      { method: 'POST', body: JSON.stringify(body) },
      createClipResponseSchema,
    );
  },

  getClipMeta(id: string): Promise<ClipMetaResponse> {
    return request(`/api/clips/${id}`, { method: 'GET' }, clipMetaResponseSchema);
  },

  openClip(id: string, body: OpenClipRequest): Promise<OpenClipResponse> {
    return request(
      `/api/clips/${id}/open`,
      { method: 'POST', body: JSON.stringify(body) },
      openClipResponseSchema,
    );
  },

  deleteClip(id: string, deleteToken: string): Promise<void> {
    return request(`/api/clips/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${deleteToken}` },
    });
  },

  createFile(body: CreateFileRequest): Promise<CreateFileResponse> {
    return request(
      '/api/files',
      { method: 'POST', body: JSON.stringify(body) },
      createFileResponseSchema,
    );
  },

  createReport(body: CreateReportRequest): Promise<void> {
    return request('/api/reports', { method: 'POST', body: JSON.stringify(body) });
  },

  async getFileUrl(fileId: string): Promise<string> {
    const { url } = await request(
      `/api/files/${fileId}`,
      { method: 'GET' },
      fileDownloadResponseSchema,
    );
    return resolveApiUrl(url);
  },
};

/** Şifreli blob'u yükler; ilerlemeyi 0–1 arasında bildirir. */
export function uploadBlob(
  target: CreateFileResponse['upload'],
  blob: Uint8Array<ArrayBuffer>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, resolveApiUrl(target.url));
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, { error: 'internal', message: 'Upload failed' }));
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.send(blob);
  });
}

/** Şifreli blob'u indirir. */
export async function downloadBlob(url: string): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new NetworkError();
  }
  if (!res.ok)
    throw new ApiError(res.status, { error: res.status === 404 ? 'not_found' : 'internal' });
  return new Uint8Array(await res.arrayBuffer());
}
