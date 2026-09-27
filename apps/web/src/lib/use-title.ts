import { useEffect } from 'react';
import type { MessageKey } from '../i18n/core';
import { useT } from '../i18n/use-i18n';
import { SITE } from './site';

/** Sayfa başlığını ayarlar: "Gizlilik politikası · ClipBoard". */
export function useTitle(key?: Extract<MessageKey, `titles.${string}`>) {
  const t = useT();
  const title = key ? t(key) : null;
  const fallback = t('titles.default');
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${fallback}`;
  }, [title, fallback]);
}
