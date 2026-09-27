import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** 25 MB sunucu sınırından büyük: doğrudan aktarım bu sınıra tabi değil. */
const SIZE = 30 * 1024 * 1024;

async function openRoom(page: Page) {
  await page.goto('/r');
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 1 cihaz');
  return page.url();
}

test('sends a large file device to device without the server', async ({ page, newDevice }) => {
  test.setTimeout(90_000);
  const link = await openRoom(page);
  const other = await newDevice();
  const fileApiCalls: string[] = [];
  for (const p of [page, other]) {
    p.on('request', (req) => {
      if (req.url().includes('/api/files')) fileApiCalls.push(req.url());
    });
  }
  await other.goto(link);
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');

  const buffer = Buffer.alloc(SIZE);
  for (let i = 0; i < SIZE; i += 4096) buffer.writeUInt32LE(i, i);
  await page.getByTestId('p2p-file-input').setInputFiles({
    name: 'büyük-video.bin',
    mimeType: 'application/octet-stream',
    buffer,
  });
  await expect(page.getByTestId('p2p-outgoing')).toContainText('büyük-video.bin');

  const incoming = other.getByTestId('p2p-incoming');
  await expect(incoming).toContainText('büyük-video.bin');
  await incoming.getByRole('button', { name: 'Al' }).click();
  await expect(other.getByTestId('p2p-incoming-status')).toHaveText('Tamamlandı', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('p2p-receiver-status')).toHaveText('Tamamlandı');

  const downloadPromise = other.waitForEvent('download');
  await incoming.getByRole('button', { name: 'Kaydet' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('büyük-video.bin');
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const received = Buffer.concat(chunks);
  expect(received.length).toBe(SIZE);
  expect(received.equals(buffer)).toBe(true);
  expect(fileApiCalls).toEqual([]);
});

test('the receiver can decline and the sender can stop', async ({ page, newDevice }) => {
  const link = await openRoom(page);
  const other = await newDevice();
  await other.goto(link);
  await expect(page.getByTestId('room-status')).toHaveText('Bağlı · 2 cihaz');

  await page.getByTestId('p2p-file-input').setInputFiles({
    name: 'a.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await other.getByTestId('p2p-incoming').getByRole('button', { name: 'Reddet' }).click();
  await expect(page.getByTestId('p2p-receiver-status')).toHaveText('Reddedildi');
  await expect(other.getByTestId('p2p-incoming')).toHaveCount(0);

  await page.getByTestId('p2p-file-input').setInputFiles({
    name: 'b.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('y'),
  });
  await expect(other.getByTestId('p2p-incoming')).toContainText('b.txt');
  await page.getByTestId('p2p-outgoing').last().getByRole('button', { name: 'Durdur' }).click();
  await expect(other.getByTestId('p2p-incoming-status')).toHaveText('Gönderen durdurdu');
});

test('announces ongoing transfers to devices that join later', async ({ page, newDevice }) => {
  const link = await openRoom(page);
  await page.getByTestId('p2p-file-input').setInputFiles({
    name: 'sonradan.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('merhaba'),
  });
  const other = await newDevice();
  await other.goto(link);
  await expect(other.getByTestId('p2p-incoming')).toContainText('sonradan.txt');
});
