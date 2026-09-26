import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Ortak paket TypeScript kaynağı olarak tüketildiği için pakete gömülür.
  noExternal: ['@clipboard/shared'],
});
