/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

/** Arama motorlarına açık sayfalar (paylaşım ve oda sayfaları bilinçli olarak dışarıda). */
const PUBLIC_PAGES = ['/', '/nasil-calisir', '/gizlilik', '/kullanim-kosullari'];

/**
 * Sitenin mutlak adresi (VITE_SITE_URL) gerektiren dosyaları üretir: index.html'deki
 * canonical/Open Graph adresleri, robots.txt ve sitemap.xml.
 */
function siteMeta(): Plugin {
  const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
    name: 'clipboard-site-meta',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
    generateBundle() {
      const robots = [
        'User-agent: *',
        'Disallow: /c/',
        'Disallow: /r',
        'Disallow: /api/',
        'Disallow: /bildir',
        ...(siteUrl ? [`Sitemap: ${siteUrl}/sitemap.xml`] : []),
      ];
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });
      if (!siteUrl) return;
      const urls = PUBLIC_PAGES.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    siteMeta(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Harici betik olarak kaydedilir; satır içi betik CSP ile engellenir.
      injectRegister: 'script-defer',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Sosyal medya önizleme görseli uygulama için gerekmez.
        globIgnores: ['og-image.png'],
      },
      manifest: {
        name: 'ClipBoard · Şifreli online pano',
        short_name: 'ClipBoard',
        description: 'Cihazlarınız arasında metin ve dosyaları uçtan uca şifreli paylaşın.',
        lang: 'tr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Android: "Paylaş" menüsünde ClipBoard görünür.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'file', accept: ['*/*'] }],
          },
        },
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
