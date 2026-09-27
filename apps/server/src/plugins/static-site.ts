import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/**
 * Derlenmiş web arayüzünü sunar. `/assets` altındaki dosyaların adında içerik özeti
 * olduğu için süresiz önbelleğe alınabilir; `index.html` her seferinde doğrulanır.
 * Bilinmeyen sayfa yolları (ör. `/c/ABCD`, `/r`) tek sayfalık uygulamaya yönlendirilir.
 */
export async function staticSite(app: FastifyInstance, { root }: { root: string }) {
  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: false,
    setHeaders(res, path) {
      res.header(
        'Cache-Control',
        path.includes(`${join(root, 'assets')}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });
}

export function isPageRequest(method: string, url: string, accept?: string): boolean {
  return (
    (method === 'GET' || method === 'HEAD') &&
    !url.startsWith('/api/') &&
    !url.startsWith('/ws/') &&
    (accept ?? '').includes('text/html')
  );
}
