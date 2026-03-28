import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  minify: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
