import {
  clipMetaResponseSchema,
  createClipResponseSchema,
  errorResponseSchema,
  openClipResponseSchema,
  type ClipMetaResponse,
  type CreateClipRequest,
  type CreateClipResponse,
  type ErrorResponse,
  type OpenClipRequest,
  type OpenClipResponse,
} from '@clipboard/shared';
import type { z } from 'zod';

const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

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
};
