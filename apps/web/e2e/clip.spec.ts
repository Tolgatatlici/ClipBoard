import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface ShareOptions {
  withCode?: boolean;
  burnAfterRead?: boolean;
}

/** Ana sayfada metni paylaşır; gönderilen istek gövdesini ve paylaşım bilgilerini döner. */
async function share(page: Page, text: string, options: ShareOptions = {}) {
  await page.goto('/');
  await page.getByRole('textbox', { name: /metni/ }).fill(text);
  if (options.withCode === false) {
    await page.getByRole('checkbox', { name: 'Kısa kod oluştur' }).uncheck();
  }
  if (options.burnAfterRead) {
    await page.getByRole('checkbox', { name: 'İlk açılışta sil' }).check();
  }
  const requestPromise = page.waitForRequest(
    (req) => req.url().endsWith('/api/clips') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Şifrele ve paylaş' }).click();
  const request = await requestPromise;

  const link = await page.getByTestId('share-link').inputValue();
  const code = options.withCode === false ? null : await page.getByTestId('share-code').innerText();
  return { requestBody: request.postData() ?? '', link, code };
}

const TEXT = 'Çok gizli metin 🔐\nikinci satır <b>html değil</b>';

test('shares text with a short code between two devices', async ({ page, newDevice }) => {
  const { requestBody, code } = await share(page, TEXT);
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  expect(requestBody).not.toContain('gizli');
  expect(requestBody).not.toContain(code!.split('-')[1]);

  const other = await newDevice();
  await other.goto('/');
  await other.getByLabel('Paylaşım kodu').fill(code!.toLowerCase());
  await other.getByRole('button', { name: 'Aç' }).click();
  await expect(other.getByTestId('clip-content')).toHaveText(TEXT);
});

test('shares text with a link and shows a QR code', async ({ page, newDevice }) => {
  const { requestBody, link } = await share(page, TEXT, { withCode: false });
  const key = link.split('#k=')[1]!;
  expect(key).toHaveLength(43);
  expect(requestBody).not.toContain(key);
  await expect(page.getByRole('img', { name: /QR/ })).toBeVisible();

  const other = await newDevice();
  const apiRequests: string[] = [];
  other.on('request', (req) => apiRequests.push(req.url() + (req.postData() ?? '')));
  await other.goto(link);
  await expect(other.getByTestId('clip-content')).toHaveText(TEXT);
  for (const req of apiRequests) expect(req).not.toContain(key);
});

test('burn-after-read content can only be opened once', async ({ page, newDevice }) => {
  const { link } = await share(page, 'tek seferlik', { burnAfterRead: true });

  const other = await newDevice();
  await other.goto(link);
  await other.getByRole('button', { name: 'İçeriği göster' }).click();
  await expect(other.getByTestId('clip-content')).toHaveText('tek seferlik');

  await other.reload();
  await expect(other.getByRole('alert')).toContainText('İçerik bulunamadı');
});

test('shows remaining attempts for a wrong code', async ({ page, newDevice }) => {
  const { code } = await share(page, 'x');
  const [id, secret] = code!.split('-');
  const wrong = secret === 'AAAA' ? 'BBBB' : 'AAAA';

  const other = await newDevice();
  await other.goto(`/c/${id}#s=${wrong}`);
  await expect(other.getByRole('alert')).toContainText('Kalan deneme hakkı: 4');

  await other.getByLabel('Paylaşım kodu').fill(code!);
  await other.getByRole('button', { name: 'Aç' }).click();
  await expect(other.getByTestId('clip-content')).toHaveText('x');
});

test('the creator can delete a clip', async ({ page, newDevice }) => {
  const { link } = await share(page, 'silinecek');
  await page.getByRole('button', { name: 'Şimdi sil' }).click();
  await expect(page.getByRole('heading', { name: 'İçerik silindi' })).toBeVisible();

  const other = await newDevice();
  await other.goto(link);
  await expect(other.getByRole('alert')).toContainText('İçerik bulunamadı');
});

test('copies the code to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { code } = await share(page, 'x');
  await page.getByRole('button', { name: 'Kodu kopyala' }).click();
  await expect(page.getByRole('button', { name: 'Kopyalandı ✓' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
});
