import { chromium, type BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { EXTENSION_DIR } from './global-setup';

// Eklenti, yerel geliştirme sunucusuna göre derlenir; masaüstü projesinde bir kez koşar.
test.skip(!!process.env.E2E_BASE_URL, 'Extension is built against the local dev server');
test.skip(({ isMobile }) => isMobile, 'Extensions are desktop-only');
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    // Eklentiler başsız kabukta (headless shell) çalışmaz; tam Chromium gerekir.
    ...(process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : { channel: 'chromium' }),
    headless: true,
    locale: 'tr-TR',
    // chrome.i18n, sayfa dilini değil tarayıcı arayüz dilini kullanır (Linux'ta LANGUAGE).
    env: { ...process.env, LANGUAGE: 'tr', LANG: 'tr_TR.UTF-8' },
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
});

test('shares text from the popup and opens it in the web app', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('heading', { name: 'Şifreli paylaş' })).toBeVisible();

  await popup.getByLabel('Metin').fill('eklentiden gelen metin');
  await popup.getByRole('button', { name: 'Şifrele ve paylaş' }).click();
  const code = await popup.getByTestId('share-code').innerText();
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const link = await popup.getByTestId('share-link').inputValue();
  expect(link).toMatch(/^http:\/\/localhost:5174\/c\/[0-9A-Z]{4}#k=/);

  const web = await context.newPage();
  await web.goto(link);
  await expect(web.getByTestId('clip-content')).toHaveText('eklentiden gelen metin');
});

test('opens a code from the popup in a new tab', async () => {
  const web = await context.newPage();
  await web.goto('http://localhost:5174/');
  await web.getByRole('textbox', { name: /metni/ }).fill('web’den eklentiye');
  await web.getByRole('button', { name: 'Şifrele ve paylaş' }).click();
  const code = await web.getByTestId('share-code').innerText();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('Paylaşım kodu').fill(code);
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    popup.getByRole('button', { name: 'Aç', exact: true }).click(),
  ]);
  await expect(opened.getByTestId('clip-content')).toHaveText('web’den eklentiye');
});

test('validates the server address in settings', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByLabel('Sunucu adresi')).toHaveValue('http://localhost:5174');
  await options.getByLabel('Sunucu adresi').fill('http://insecure.example.com');
  await options.getByRole('button', { name: 'Kaydet' }).click();
  await expect(options.getByRole('status')).toHaveText('Geçerli bir https:// adresi girin.');
});
