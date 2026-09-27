import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Ana sayfadan yeni bir oda açar ve oda kodunu döner. */
async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Yeni oda oluştur' }).click();
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 1 cihaz');
  return page.getByTestId('room-code').innerText();
}

async function joinRoom(page: Page, code: string) {
  await page.goto('/');
  await page.getByLabel('Oda kodu').fill(code);
  await page.getByRole('button', { name: 'Katıl' }).click();
  await expect(page.getByTestId('room-status')).toContainText('Bağlı');
}

async function sendText(page: Page, text: string) {
  await page.getByLabel('Odaya gönder').fill(text);
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
}

test('syncs text between two devices in real time', async ({ page, newDevice }) => {
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framesent', (frame) => frames.push(String(frame.payload))));

  const code = await createRoom(page);
  expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const other = await newDevice();
  await joinRoom(other, code.toLowerCase());
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');
  await expect(other.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');

  await sendText(page, 'odadan merhaba 👋');
  await expect(other.getByTestId('room-item').first()).toContainText('odadan merhaba 👋');
  await expect(page.getByTestId('room-item').first()).toContainText('odadan merhaba 👋');

  // Sunucuya giden WebSocket çerçevelerinde düz metin ve oda kodu yok.
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) {
    expect(frame).not.toContain('merhaba');
    expect(frame).not.toContain(code.replace('-', ''));
  }

  await other.getByRole('radio', { name: 'Kod' }).check({ force: true });
  await sendText(other, 'function selam(ad) {\n  return `Merhaba ${ad}`;\n}\n');
  await expect(page.getByTestId('code-language')).toHaveText('javascript');
  await expect(page.locator('[data-testid=room-item] .hljs-keyword').first()).toHaveText(
    'function',
  );
});

test('shows when the other device is typing', async ({ page, newDevice }) => {
  const code = await createRoom(page);
  const other = await newDevice();
  await joinRoom(other, code);
  await other.getByLabel('Odaya gönder').pressSequentially('yazıyorum');
  await expect(page.getByTestId('typing-indicator')).toBeVisible();
  await expect(page.getByTestId('typing-indicator')).toBeHidden({ timeout: 5000 });
});

test('sends files to the room', async ({ page, newDevice }) => {
  const code = await createRoom(page);
  const other = await newDevice();
  await joinRoom(other, code);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByTestId('room-file-input').setInputFiles({
    name: 'oda.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(other.getByTestId('file-name')).toHaveText('oda.png');
  await expect(other.getByTestId('file-preview')).toBeVisible();
});

test('late joiners get the history and clearing empties every device', async ({
  page,
  newDevice,
}) => {
  const code = await createRoom(page);
  await sendText(page, 'ilk mesaj');
  await sendText(page, 'ikinci mesaj');
  await expect(page.getByTestId('room-item')).toHaveCount(2);

  // Link ile katılım.
  const other = await newDevice();
  await other.goto(`/r#${code}`);
  await expect(other.getByTestId('room-item')).toHaveCount(2);
  await expect(other.getByTestId('room-item').first()).toContainText('ikinci mesaj');

  await other.getByRole('button', { name: 'Odayı temizle' }).click();
  await other.getByRole('button', { name: 'Evet, temizle' }).click();
  await expect(page.getByTestId('room-item')).toHaveCount(0);
  await expect(other.getByTestId('room-item')).toHaveCount(0);
});

test('rejects an invalid room code in the link', async ({ page }) => {
  await page.goto('/r#BAD');
  await expect(page.getByRole('heading', { name: 'Geçersiz oda kodu' })).toBeVisible();
});
