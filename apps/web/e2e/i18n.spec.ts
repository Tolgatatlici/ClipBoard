import { expect, test } from './fixtures';

test.describe('English interface', () => {
  test.use({ locale: 'en-US' });

  test('is picked from the browser language and can be switched', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Encrypt and share' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByRole('button', { name: 'tr', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Şifrele ve paylaş' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Şifrele ve paylaş' })).toBeVisible();
  });

  test('shares and opens content in English', async ({ page, newDevice }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /Paste the text/ }).fill('hello from the other side');
    await page.getByRole('button', { name: 'Encrypt and share' }).click();
    await expect(page.getByRole('heading', { name: /Ready!/ })).toBeVisible();
    await expect(page.getByText(/Deleted in \d+ (h|min)/)).toBeVisible();
    const code = await page.getByTestId('share-code').innerText();

    const other = await newDevice();
    await other.goto('/');
    await other.getByRole('button', { name: 'en', exact: true }).click();
    await other.getByLabel('Share code').fill(code);
    await other.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(other.getByTestId('clip-content')).toHaveText('hello from the other side');
    await expect(other.getByRole('heading', { name: 'Shared content' })).toBeVisible();
    await expect(other).toHaveTitle('Shared content · ClipBoard');
  });

  test('shows English legal pages', async ({ page }) => {
    await page.goto('/gizlilik');
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
    await page.goto('/kullanim-kosullari');
    await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible();
  });
});
