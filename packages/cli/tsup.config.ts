import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { clip: 'src/main.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Tek dosyalık çalıştırılabilir: ortak paket ve zod içine gömülür.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
});
