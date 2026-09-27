import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Ana sayfadan yeni bir oda açar ve oda linkini (sır `#` sonrasında) döner. */
async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Yeni oda oluştur' }).click();
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 1 cihaz');
  return page.url();
}

async function joinRoom(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByTestId('room-status')).toContainText('Bağlı');
}

async function sendText(page: Page, text: string) {
  await page.getByLabel('Odaya gönder').fill(text);
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
}

test('syncs text between two devices in real time', async ({ page, newDevice }) => {
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framesent', (frame) => frames.push(String(frame.payload))));

  const link = await createRoom(page);
  const secret = new URL(link).hash.slice(1);
  expect(secret).toHaveLength(43);
  const other = await newDevice();
  await joinRoom(other, link);
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');
  await expect(other.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');

  await sendText(page, 'odadan merhaba 👋');
  await expect(other.getByTestId('room-item').first()).toContainText('odadan merhaba 👋');
  await expect(page.getByTestId('room-item').first()).toContainText('odadan merhaba 👋');

  // Sunucuya giden WebSocket çerçevelerinde düz metin ve oda kodu yok.
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) {
    expect(frame).not.toContain('merhaba');
    expect(frame).not.toContain(secret);
  }

  await other.getByRole('radio', { name: 'Kod' }).check({ force: true });
  await sendText(other, 'function selam(ad) {\n  return `Merhaba ${ad}`;\n}\n');
  await expect(page.getByTestId('code-language')).toHaveText('javascript');
  await expect(page.locator('[data-testid=room-item] .hljs-keyword').first()).toHaveText(
    'function',
  );
});

test('shows when the other device is typing', async ({ page, newDevice }) => {
  const link = await createRoom(page);
  const other = await newDevice();
  await joinRoom(other, link);
  await other.getByLabel('Odaya gönder').pressSequentially('yazıyorum');
  await expect(page.getByTestId('typing-indicator')).toBeVisible();
  await expect(page.getByTestId('typing-indicator')).toBeHidden({ timeout: 5000 });
});

test('sends files to the room', async ({ page, newDevice }) => {
  const link = await createRoom(page);
  const other = await newDevice();
  await joinRoom(other, link);

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
  const link = await createRoom(page);
  await sendText(page, 'ilk mesaj');
  await sendText(page, 'ikinci mesaj');
  await expect(page.getByTestId('room-item')).toHaveCount(2);

  // Link ile katılım.
  const other = await newDevice();
  await other.goto(link);
  await expect(other.getByTestId('room-item')).toHaveCount(2);
  await expect(other.getByTestId('room-item').first()).toContainText('ikinci mesaj');

  await other.getByRole('button', { name: 'Odayı temizle' }).click();
  await other.getByRole('button', { name: 'Evet, temizle' }).click();
  await expect(page.getByTestId('room-item')).toHaveCount(0);
  await expect(other.getByTestId('room-item')).toHaveCount(0);
});

test('rejects an invalid room link', async ({ page }) => {
  await page.goto('/r#BAD');
  await expect(page.getByRole('heading', { name: 'Geçersiz oda linki' })).toBeVisible();
});

test.describe('adding a device with a pairing code', () => {
  async function startPairing(page: Page) {
    const link = await createRoom(page);
    await page.getByRole('button', { name: 'Kodla cihaz ekle' }).click();
    const code = (await page.getByTestId('pairing-code').innerText()).replace(' ', '');
    expect(code).toMatch(/^\d{6}$/);
    return { link, code };
  }

  async function enterCode(other: Page, code: string) {
    await other.goto('/');
    await other.getByLabel('Eşleştirme kodu').fill(code);
    await other.getByRole('button', { name: 'Katıl' }).click();
  }

  test('pairs after both screens show the same verification number', async ({
    page,
    newDevice,
  }) => {
    const frames: string[] = [];
    page.on('websocket', (ws) => ws.on('framesent', (f) => frames.push(String(f.payload))));
    const { link, code } = await startPairing(page);
    const secret = new URL(link).hash.slice(1);

    const other = await newDevice();
    await enterCode(other, code);
    const hostSas = await page.getByTestId('pairing-sas').innerText();
    const guestSas = await other.getByTestId('pairing-sas').innerText();
    expect(hostSas).toMatch(/^\d{3} \d{3}$/);
    expect(guestSas).toBe(hostSas);

    await page.getByRole('button', { name: 'Aynı, ekle' }).click();
    await expect(page.getByText('Cihaz odaya eklendi.')).toBeVisible();
    await expect(other).toHaveURL(link);
    await expect(other.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');

    await sendText(page, 'eşleştirilmiş cihaza');
    await expect(other.getByTestId('room-item').first()).toContainText('eşleştirilmiş cihaza');
    // Oda sırrı sunucuya hiçbir çerçevede düz olarak gitmedi.
    for (const frame of frames) expect(frame).not.toContain(secret);
  });

  test('cancels when the numbers do not match', async ({ page, newDevice }) => {
    const { code } = await startPairing(page);
    const other = await newDevice();
    await enterCode(other, code);
    await page.getByTestId('pairing-sas').waitFor();
    await page.getByRole('button', { name: 'Farklı, iptal et' }).click();
    await expect(other.getByRole('alert')).toHaveText('Eşleştirme iptal edildi.');
    // Ev sahibi yeni bir kodla tekrar deneyebilir.
    await expect(page.getByTestId('pairing-code')).toBeVisible();
    expect((await page.getByTestId('pairing-code').innerText()).replace(' ', '')).not.toBe(code);
  });

  test('rejects unknown or used codes', async ({ page, newDevice }) => {
    await enterCode(page, '000000');
    await expect(page.getByRole('alert')).toContainText('Kod bulunamadı');

    const host = await newDevice();
    const { code } = await startPairing(host);
    const first = await newDevice();
    await enterCode(first, code);
    await host.getByTestId('pairing-sas').waitFor();
    await host.getByRole('button', { name: 'Aynı, ekle' }).click();
    await expect(first.getByTestId('room-status')).toContainText('Bağlı');

    const second = await newDevice();
    await enterCode(second, code);
    await expect(second.getByRole('alert')).toContainText('Kod bulunamadı');
  });
});
