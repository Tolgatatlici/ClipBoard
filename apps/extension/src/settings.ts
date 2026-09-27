export const DEFAULT_SERVER = __DEFAULT_SERVER__;

/**
 * Kullanıcının girdiği adresi köke indirger. Güvenlik için yalnızca https kabul
 * edilir; geliştirme için localhost'a http ile izin verilir.
 */
export function normalizeServer(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return null;
  return url.origin;
}

export async function getServer(): Promise<string> {
  const { server } = await chrome.storage.sync.get('server');
  return typeof server === 'string' && normalizeServer(server) ? server : DEFAULT_SERVER;
}

/**
 * Sunucuyu kaydeder. Varsayılan dışındaki bir sunucu için tarayıcıdan erişim izni
 * ister (kullanıcı etkileşimi içinde çağrılmalıdır); izin verilmezse `false` döner.
 */
export async function setServer(server: string): Promise<boolean> {
  if (server !== DEFAULT_SERVER) {
    const granted = await chrome.permissions.request({ origins: [`${server}/*`] });
    if (!granted) return false;
  }
  await chrome.storage.sync.set({ server });
  return true;
}
