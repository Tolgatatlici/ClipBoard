import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Service worker yalnızca üretim derlemesinde kayıtlıdır.
test.skip(!process.env.E2E_BASE_URL, 'Requires a production build (E2E_BASE_URL)');

async function waitForServiceWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Sayfanın service worker tarafından kontrol edildiğinden emin ol.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** Sistem paylaşım menüsünü taklit eder: /share-target'a multipart POST. */
async function shareViaSystemMenu(page: Page, fields: Record<string, string>, file?: string) {
  await page.evaluate(
    ({ fields, file }) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/share-target';
      form.enctype = 'multipart/form-data';
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      if (file) {
        const input = document.createElement('input');
        input.type = 'file';
        input.name = 'file';
        const transfer = new DataTransfer();
        transfer.items.add(new File([file], 'paylasilan.txt', { type: 'text/plain' }));
        input.files = transfer.files;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    },
    { fields, file },
  );
}

test('serves a valid web app manifest', async ({ page }) => {
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    short_name: 'ClipBoard',
    display: 'standalone',
    start_url: '/',
    share_target: { action: '/share-target', method: 'POST' },
  });
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test('opens offline once installed', async ({ page, context }) => {
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: /metni/ })).toBeVisible();
  await page.goto('/nasil-calisir');
  await expect(page.getByRole('heading', { name: 'Nasıl çalışır?' })).toBeVisible();
  await context.setOffline(false);
});

test('receives text from the system share menu', async ({ page }) => {
  await waitForServiceWorker(page);
  await shareViaSystemMenu(page, { title: 'Başlık', text: 'paylaşılan metin', url: '' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('textbox', { name: /metni/ })).toHaveValue(
    'Başlık\npaylaşılan metin',
  );
});

test('receives a file from the system share menu', async ({ page }) => {
  await waitForServiceWorker(page);
  await shareViaSystemMenu(page, {}, 'dosya içeriği');
  await expect(page.getByTestId('attached-file')).toHaveText('paylasilan.txt');
  // Aktarılan içerik cihazda kalmaz.
  const leftovers = await page.evaluate(async () => {
    const cache = await caches.open('clipboard-share-target');
    return (await cache.keys()).length;
  });
  expect(leftovers).toBe(0);
});
