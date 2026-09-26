import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  url: string;
  body: string | null;
}

type Handler = (req: RecordedRequest) => { status: number; body?: unknown };

/** `fetch`'i verilen işleyiciyle değiştirir ve yapılan istekleri kaydeder. */
export function mockFetch(handler: Handler) {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const req = {
        method: init.method ?? 'GET',
        url,
        body: typeof init.body === 'string' ? init.body : null,
      };
      requests.push(req);
      const { status, body } = handler(req);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
  return requests;
}
