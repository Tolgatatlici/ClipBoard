import { useEffect, useRef } from 'react';

/**
 * Anahtara bağlı, kapatılabilir bir oturum başlatır (ör. eşleştirme kanalı). StrictMode
 * efektleri iki kez çalıştırdığında oturumu kapatıp yeniden açmak yerine korur; oturum
 * yalnızca anahtar değişince ya da bileşen gerçekten kaldırılınca kapatılır.
 */
export function useSession<K>(key: K, start: () => { cancel(): void }) {
  const current = useRef<{ key: K; session: { cancel(): void }; timer?: number } | null>(null);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    let entry = current.current;
    if (entry && Object.is(entry.key, key)) {
      clearTimeout(entry.timer);
    } else {
      entry = { key, session: startRef.current() };
      current.current = entry;
    }
    const active = entry;
    return () => {
      active.timer = window.setTimeout(() => {
        active.session.cancel();
        if (current.current === active) current.current = null;
      }, 0);
    };
  }, [key]);
}
