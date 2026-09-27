import { createContext } from 'react';
import { en } from './en';
import { tr, type Messages } from './tr';

export type Lang = 'tr' | 'en';
export const LANGS: Lang[] = ['tr', 'en'];

const dictionaries: Record<Lang, Messages> = { tr, en };

/** `common.copy` biçimindeki tüm anahtarlar. */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslate(lang: Lang): Translate {
  const dictionary = dictionaries[lang];
  return (key, params) => {
    let value: unknown = dictionary;
    for (const part of key.split('.')) value = (value as Record<string, unknown>)[part];
    const text = typeof value === 'string' ? value : key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

const STORAGE_KEY = 'clipboard:lang';

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'tr' || stored === 'en') return stored;
  } catch {
    // Depolama yoksa tarayıcı diline bak.
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Tercih yalnızca bu oturumda geçerli olur.
  }
}

export interface I18nValue {
  lang: Lang;
  setLang(lang: Lang): void;
  t: Translate;
}

/** Sağlayıcı olmadan (ör. birim testleri) Türkçe çalışır. */
export const I18nContext = createContext<I18nValue>({
  lang: 'tr',
  setLang: () => undefined,
  t: createTranslate('tr'),
});
