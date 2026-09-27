import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Eklentinin varsayılan sunucusu derleme sırasında verilir (her kurulum kendi
 * sunucusu için derler). Manifest'teki izin yalnızca bu sunucuyu kapsar.
 */
const defaultServer = (process.env.EXTENSION_DEFAULT_SERVER ?? 'https://clip.example.com').replace(
  /\/+$/,
  '',
);

function manifest(): Plugin {
  return {
    name: 'clipboard-extension-manifest',
    generateBundle() {
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
      const icons = {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      };
      const source = {
        manifest_version: 3,
        name: '__MSG_extName__',
        description: '__MSG_extDescription__',
        version: pkg.version,
        default_locale: 'tr',
        icons,
        action: {
          default_popup: 'popup.html',
          default_title: '__MSG_extName__',
          default_icon: icons,
        },
        options_page: 'options.html',
        background: { service_worker: 'background.js', type: 'module' },
        permissions: ['contextMenus', 'storage', 'activeTab'],
        host_permissions: [`${defaultServer}/*`],
        // Ayarlarda başka bir sunucu seçilirse izin o anda istenir.
        optional_host_permissions: ['https://*/*', 'http://localhost/*'],
      };
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(source, null, 2),
      });
    },
  };
}

export default defineConfig({
  define: { __DEFAULT_SERVER__: JSON.stringify(defaultServer) },
  plugins: [manifest()],
  build: {
    outDir: process.env.EXTENSION_OUT_DIR ?? 'dist',
    emptyOutDir: true,
    // Eklenti sayfaları uzak kaynak yükleyemez; her şey pakete gömülür.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        options: 'options.html',
        result: 'result.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
