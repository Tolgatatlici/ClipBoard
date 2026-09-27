import { useEffect } from 'react';
import { SITE } from './site';

/** Sayfa başlığını ayarlar: "Gizlilik · ClipBoard". */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.name}` : `${SITE.name} · Şifreli online pano`;
  }, [title]);
}
