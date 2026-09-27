import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../App';
import { createTranslate, detectLang } from './core';
import { en } from './en';
import { I18nProvider } from './I18nProvider';
import { tr } from './tr';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' ? [`${prefix}${key}`] : keys(child, `${prefix}${key}.`),
  );
}

describe('translations', () => {
  it('have the same keys in every language', () => {
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });

  it('keep the same placeholders', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    const trT = createTranslate('tr');
    const enT = createTranslate('en');
    for (const key of keys(tr)) {
      const k = key as Parameters<typeof trT>[0];
      expect(placeholders(enT(k)), key).toEqual(placeholders(trT(k)));
    }
  });

  it('interpolates parameters', () => {
    expect(createTranslate('en')('room.connected', { n: 3 })).toBe('Connected · 3 devices');
    expect(createTranslate('tr')('errors.wrongCode', { n: 2 })).toBe(
      'Kod hatalı. Kalan deneme hakkı: 2.',
    );
  });
});

describe('detectLang', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers the stored choice', () => {
    localStorage.setItem('clipboard:lang', 'en');
    expect(detectLang()).toBe('en');
  });

  it('falls back to the browser language', () => {
    vi.stubGlobal('navigator', { language: 'tr-TR' });
    expect(detectLang()).toBe('tr');
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect(detectLang()).toBe('en');
  });
});

describe('language switcher', () => {
  it('switches the interface and remembers the choice', async () => {
    localStorage.setItem('clipboard:lang', 'tr');
    render(
      <I18nProvider>
        <MemoryRouter>
          <AppRoutes />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Şifrele ve paylaş' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByRole('button', { name: 'Encrypt and share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'en' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('clipboard:lang')).toBe('en');
  });
});
