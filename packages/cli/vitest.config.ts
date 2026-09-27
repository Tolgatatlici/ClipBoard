import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sunucu testleriyle paralel koşarken aynı Redis veritabanını temizlemesinler.
    env: { TEST_REDIS_URL: process.env.CLI_TEST_REDIS_URL ?? 'redis://localhost:6379/10' },
  },
});
