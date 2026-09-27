import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = join(tmpdir(), 'clipboard-e2e-extension');

/** Tarayıcı eklentisini, test sunucusunu varsayılan sunucu yaparak derler. */
export default function globalSetup() {
  if (process.env.E2E_BASE_URL) return;
  execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
    cwd: fileURLToPath(new URL('../../extension/', import.meta.url)),
    env: {
      ...process.env,
      EXTENSION_DEFAULT_SERVER: 'http://localhost:5174',
      EXTENSION_OUT_DIR: EXTENSION_DIR,
    },
    stdio: 'inherit',
  });
}
