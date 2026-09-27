import type { FastifyInstance } from 'fastify';

/** `fetch` arayüzünü Fastify `inject` ile taklit eder; testlerde port açmadan istemci kullanmak için. */
export function injectFetch(getApp: () => FastifyInstance): typeof fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://clip.test');
    let payload: string | Buffer | undefined;
    if (typeof init.body === 'string') payload = init.body;
    else if (init.body instanceof Uint8Array) payload = Buffer.from(init.body);
    const res = await getApp().inject({
      method: (init.method ?? 'GET') as 'GET',
      url: url.pathname + url.search,
      headers: init.headers as Record<string, string> | undefined,
      payload,
    });
    return new Response(res.statusCode === 204 ? null : new Uint8Array(res.rawPayload), {
      status: res.statusCode,
      headers: res.headers as Record<string, string>,
    });
  }) as typeof fetch;
}
