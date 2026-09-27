import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;
// Verilirse testler bu adrese (ör. üretim imajıyla çalışan konteyner) karşı koşar
// ve yerel sunucular başlatılmaz.
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${WEB_PORT}`;
const isCI = !!process.env.CI;

// Önceden kurulu bir Chromium kullanılacaksa yolu (ör. /opt/pw-browsers/chromium).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // Testler Türkçe arayüzü bekler; İngilizce ayrı bir testte denenir.
    locale: 'tr-TR',
    // Yerel Caddy sertifikasıyla üretim kurulumunu test ederken.
    ignoreHTTPSErrors: !!process.env.E2E_IGNORE_HTTPS_ERRORS,
    launchOptions: {
      executablePath,
      // POSIX yerel ayarında Chromium ASCII dışı indirme adlarını "download" yapar.
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      // Service worker kaydı `ignoreHTTPSErrors`'u dikkate almaz; yerel sertifika için gerekir.
      args: process.env.E2E_IGNORE_HTTPS_ERRORS ? ['--ignore-certificate-errors'] : [],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: 'pnpm --filter @clipboard/server exec tsx src/index.ts',
          url: `http://localhost:${API_PORT}/api/health`,
          reuseExistingServer: !isCI,
          env: {
            PORT: String(API_PORT),
            NODE_ENV: 'test',
            REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14',
            CORS_ORIGIN: baseURL,
            RATE_LIMIT_MAX: '10000',
            RATE_LIMIT_CREATE_MAX: '10000',
            RATE_LIMIT_OPEN_MAX: '10000',
            RATE_LIMIT_FILE_MAX: '10000',
            // E2E_STORAGE_DRIVER=s3: dosyalar docker compose'daki SeaweedFS'e yüklenir.
            STORAGE_DRIVER: process.env.E2E_STORAGE_DRIVER ?? 'local',
            STORAGE_DIR: join(tmpdir(), 'clipboard-e2e-files'),
          },
        },
        {
          command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
          url: baseURL,
          reuseExistingServer: !isCI,
          env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
        },
      ],
});
