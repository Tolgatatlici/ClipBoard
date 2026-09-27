import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __DEFAULT_SERVER__: JSON.stringify('http://clip.test') },
  test: {
    env: { TEST_REDIS_URL: process.env.EXTENSION_TEST_REDIS_URL ?? 'redis://localhost:6379/8' },
  },
});
