/** Eklenti simgelerini üretir: pnpm --filter @clipboard/extension exec tsx scripts/icons.ts */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff">
<span style="width:${size * 0.7}px;height:${size * 0.7}px;display:block">${icon}</span></div></body></html>`);
  await page.screenshot({ path: `${out}${size}.png`, omitBackground: true });
}
await browser.close();
