// Silme anahtarları yalnızca oluşturan tarayıcıda, kolaylık için saklanır.
// Depolama kullanılamıyorsa (gizli pencere vb.) sessizce devre dışı kalır.
const STORAGE_KEY = 'clipboard:delete-tokens';

type TokenMap = Record<string, { token: string; expiresAt: number }>;

function read(): TokenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenMap) : {};
  } catch {
    return {};
  }
}

function write(map: TokenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Depolama yoksa silme butonu yalnızca oluşturma ekranında görünür.
  }
}

function withoutExpired(map: TokenMap): TokenMap {
  const now = Date.now();
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v.expiresAt > now));
}

export function saveDeleteToken(id: string, token: string, expiresAt: number) {
  write({ ...withoutExpired(read()), [id]: { token, expiresAt } });
}

export function getDeleteToken(id: string): string | null {
  const entry = read()[id];
  return entry && entry.expiresAt > Date.now() ? entry.token : null;
}

export function removeDeleteToken(id: string) {
  const map = read();
  delete map[id];
  write(map);
}
