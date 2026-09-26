import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test dosyaları aynı Redis veritabanını paylaştığı için sırayla çalışır.
    fileParallelism: false,
  },
});
