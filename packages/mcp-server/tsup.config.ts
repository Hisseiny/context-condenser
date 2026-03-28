import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  minify: false, // Easier to debug MCP logs if not minified initially
  shims: true,
  dts: false,
  sourcemap: true,
});
