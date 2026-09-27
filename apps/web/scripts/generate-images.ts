/**
 * Open Graph görselini ve Apple dokunmatik simgesini üretir:
 *   pnpm --filter @clipboard/web exec tsx scripts/generate-images.ts
 * Çıktılar public/ altına yazılır ve depoya eklenir.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v4M10 13h4" /></svg>`;

const ogHtml = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;padding:80px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg,#eef2ff 0%,#ffffff 60%);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
  <div style="display:flex;align-items:center;gap:20px;font-size:48px;font-weight:700">
    <span style="width:72px;height:72px;color:#4f46e5">${icon}</span>ClipBoard
  </div>
  <div>
    <div style="font-size:64px;font-weight:700;line-height:1.1;max-width:960px">Cihazlar arası uçtan uca şifreli pano</div>
    <div style="margin-top:24px;font-size:32px;color:#475569">Metin ve dosyaları kod, link ya da QR ile anında paylaşın.</div>
  </div>
  <div style="display:flex;gap:16px;font-size:26px;color:#4338ca">
    ${['Hesap yok', 'Sunucu okuyamaz', 'Süre dolunca silinir'].map((t) => `<span style="padding:10px 20px;border-radius:999px;background:#e0e7ff">${t}</span>`).join('')}
  </div>
</div></body></html>`;

const touchHtml = `<!doctype html><html><body style="margin:0">
<div style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff">
  <span style="width:112px;height:112px">${icon}</span>
</div></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(ogHtml);
await page.screenshot({ path: `${publicDir}og-image.png` });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(touchHtml);
await page.screenshot({ path: `${publicDir}apple-touch-icon.png` });
// PWA simgeleri; maskeli sürümde simge güvenli alanda (ortadaki %60) kalır.
for (const [file, size, scale] of [
  ['pwa-192.png', 192, 0.62],
  ['pwa-512.png', 512, 0.62],
  ['pwa-maskable-512.png', 512, 0.5],
] as const) {
  const inner = Math.round(size * scale);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff">
  <span style="width:${inner}px;height:${inner}px">${icon}</span>
</div></body></html>`);
  await page.screenshot({ path: `${publicDir}${file}` });
}
await browser.close();
console.log('Görseller public/ altına yazıldı.');
