/// <reference lib="webworker" />
/**
 * Service worker: uygulama kabuğunu önbelleğe alır (çevrimdışı açılış) ve
 * sistem paylaşım menüsünden (Web Share Target) gelen içeriği sayfaya aktarır.
 * API yanıtları ve paylaşılan içerikler asla kalıcı olarak önbelleğe alınmaz.
 */
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { SHARE_CACHE, SHARED_FILE_KEY, SHARED_TEXT_KEY } from './lib/share-target-keys';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(event.request));
  }
});

async function receiveShare(request: Request): Promise<Response> {
  const form = await request.formData();
  const cache = await caches.open(SHARE_CACHE);
  await cache.delete(SHARED_TEXT_KEY);
  await cache.delete(SHARED_FILE_KEY);

  const text = ['title', 'text', 'url']
    .map((field) => form.get(field))
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');
  if (text) await cache.put(SHARED_TEXT_KEY, new Response(text));

  const file = form.get('file');
  if (file instanceof File && file.size > 0) {
    await cache.put(
      SHARED_FILE_KEY,
      new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
      }),
    );
  }
  return Response.redirect('/?shared=1', 303);
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/ws\//, /^\/metrics/],
  }),
);

self.skipWaiting();
clientsClaim();
