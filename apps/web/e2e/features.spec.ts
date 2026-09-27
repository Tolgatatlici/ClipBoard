import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Şifrele ve paylaş' }).click();
  return page.getByTestId('share-link').inputValue();
}

// Geçerli 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('highlights shared code', async ({ page, newDevice }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Kod' }).check({ force: true });
  await page
    .getByRole('textbox', { name: /metni/ })
    .fill('def selam(ad):\n    return f"Merhaba {ad}"\n');
  const link = await submit(page);

  const other = await newDevice();
  await other.goto(link);
  await expect(other.getByTestId('code-language')).toHaveText('python');
  await expect(other.locator('.hljs-keyword').first()).toHaveText('def');
});

test('password protected clips need the password', async ({ page, newDevice }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: /metni/ }).fill('parolalı sır');
  await page.getByRole('checkbox', { name: 'Parola ile koru' }).check();
  await page.getByLabel('Parola', { exact: true }).fill('at-gözlüğü');
  const requestPromise = page.waitForRequest((req) => req.url().endsWith('/api/clips'));
  const link = await submit(page);
  expect((await requestPromise).postData()).not.toContain('at-gözlüğü');
  await expect(page.getByTestId('share-code')).toHaveCount(0);

  const other = await newDevice();
  await other.goto(link);
  await other.getByLabel('Parola').fill('yanlış');
  await other.getByRole('button', { name: 'Aç' }).click();
  await expect(other.getByRole('alert')).toContainText('Parola yanlış');
  await other.getByLabel('Parola').fill('at-gözlüğü');
  await other.getByRole('button', { name: 'Aç' }).click();
  await expect(other.getByTestId('clip-content')).toHaveText('parolalı sır');
});

test('shares an image file end to end', async ({ page, newDevice }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'ekran görüntüsü.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('attached-file')).toHaveText('ekran görüntüsü.png');

  const uploads: Buffer[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT') uploads.push(req.postDataBuffer() ?? Buffer.alloc(0));
  });
  const link = await submit(page);
  const code = await page.getByTestId('share-code').innerText();
  // Yüklenen veri şifreli: orijinal PNG baytlarını içermez.
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.includes(PNG.subarray(0, 16))).toBe(false);

  const other = await newDevice();
  await other.goto(link);
  await expect(other.getByTestId('file-name')).toHaveText('ekran görüntüsü.png');
  await expect(other.getByTestId('file-preview')).toBeVisible();
  const downloadPromise = other.waitForEvent('download');
  await other.getByRole('button', { name: 'İndir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ekran görüntüsü.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks)).toEqual(PNG);

  // Aynı dosya kısa kodla da açılır.
  const third = await newDevice();
  await third.goto('/');
  await third.getByLabel('Paylaşım kodu').fill(code);
  await third.getByRole('button', { name: 'Aç' }).click();
  await expect(third.getByTestId('file-preview')).toBeVisible();
});

test('removes an attached file and returns to text mode', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'a.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await page.getByRole('button', { name: 'Kaldır' }).click();
  await expect(page.getByRole('textbox', { name: /metni/ })).toBeVisible();
});
