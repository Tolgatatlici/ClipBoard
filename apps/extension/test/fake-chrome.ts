import { vi } from 'vitest';

function area() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, items)),
  };
}

/** Eklenti API'lerinin testler için yeterli bir taklidi. */
export function installFakeChrome(options: { grantPermissions?: boolean } = {}) {
  const listeners = { installed: [] as (() => void)[], menu: [] as ((info: unknown) => void)[] };
  const fake = {
    storage: { sync: area(), session: area() },
    i18n: {
      getMessage: (key: string, subs?: string | string[]) =>
        subs === undefined ? key : `${key}:${([] as string[]).concat(subs).join(',')}`,
      getUILanguage: () => 'tr',
    },
    permissions: { request: vi.fn(async () => options.grantPermissions ?? true) },
    runtime: {
      onInstalled: { addListener: (fn: () => void) => listeners.installed.push(fn) },
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: (fn: (info: unknown) => void) => listeners.menu.push(fn) },
    },
    tabs: { create: vi.fn(async (_props: { url: string }) => ({})) },
  };
  vi.stubGlobal('chrome', fake);
  return { chrome: fake, listeners };
}
