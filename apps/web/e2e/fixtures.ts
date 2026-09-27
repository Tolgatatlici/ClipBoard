import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Her sayfada CSP ihlallerini ve yakalanmamış hataları toplar; test sonunda hiç
 * olmamasını bekler. Üretim derlemesine karşı çalışırken CSP'nin uygulamayı
 * bozmadığını böylece doğrularız.
 */
function track(context: BrowserContext, problems: string[]) {
  const watch = (page: Page) => {
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' && /Content Security Policy|Refused to/.test(text)) {
        problems.push(`[${page.url()}] ${text}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`[${page.url()}] ${error.message}`));
  };
  context.pages().forEach(watch);
  context.on('page', watch);
}

interface Fixtures {
  /** Ayrı çerez/depolamaya sahip ikinci bir "cihaz". */
  newDevice(): Promise<Page>;
}

export const test = base.extend<Fixtures & { problems: string[] }>({
  problems: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, problems }, use) => {
    track(context, problems);
    await use(context);
    expect(problems, 'CSP ihlali veya sayfa hatası').toEqual([]);
  },
  newDevice: async ({ browser, problems }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      contexts.push(context);
      track(context, problems);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };
