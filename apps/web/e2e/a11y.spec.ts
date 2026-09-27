import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** WCAG 2.1 AA ihlallerini okunabilir biçimde döner. */
async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n  ` +
      violation.nodes.map((node) => node.target.join(' ')).join('\n  '),
  );
}

async function shareText(page: Page, text: string, options: { password?: string } = {}) {
  await page.goto('/');
  await page.getByRole('textbox', { name: /metni/ }).fill(text);
  if (options.password) {
    await page.getByRole('checkbox', { name: 'Parola ile koru' }).check();
    await page.getByLabel('Parola', { exact: true }).fill(options.password);
  }
  await page.getByRole('button', { name: 'Şifrele ve paylaş' }).click();
  return page.getByTestId('share-link').inputValue();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test('static pages', async ({ page }) => {
      for (const path of [
        '/',
        '/nasil-calisir',
        '/gizlilik',
        '/kullanim-kosullari',
        '/bildir',
        '/yok',
        '/r#BAD',
      ]) {
        await page.goto(path);
        await page.getByRole('heading').first().waitFor();
        expect(await audit(page), path).toEqual([]);
      }
    });

    test('share flow', async ({ page, newDevice }) => {
      const link = await shareText(page, 'erişilebilirlik testi');
      expect(await audit(page), 'share result').toEqual([]);

      const other = await newDevice();
      await other.emulateMedia({ colorScheme });
      await other.goto(link);
      await other.getByTestId('clip-content').waitFor();
      expect(await audit(other), 'clip view').toEqual([]);
    });

    test('password prompt', async ({ page, newDevice }) => {
      const link = await shareText(page, 'x', { password: 'parola' });
      const other = await newDevice();
      await other.emulateMedia({ colorScheme });
      await other.goto(link);
      await other.getByLabel('Parola').waitFor();
      expect(await audit(other), 'password prompt').toEqual([]);
    });

    test('room', async ({ page }) => {
      await page.goto('/r');
      await expect(page.getByTestId('room-status')).toContainText('Bağlı');
      await page.getByLabel('Odaya gönder').fill('function a() { return 1; }');
      await page.getByRole('radio', { name: 'Kod' }).check({ force: true });
      await page.getByRole('button', { name: 'Gönder', exact: true }).click();
      await page.getByTestId('room-item').waitFor();
      await page.getByRole('button', { name: 'QR göster' }).click();
      expect(await audit(page), 'room').toEqual([]);
    });
  });
}
