import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslate, detectLang, I18nContext, storeLang, type Lang } from './core';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: createTranslate(lang),
      setLang: (next: Lang) => {
        storeLang(next);
        setLangState(next);
      },
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
