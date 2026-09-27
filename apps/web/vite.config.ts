/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  plugins: [react(), tailwindcss(), siteMeta()],
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
