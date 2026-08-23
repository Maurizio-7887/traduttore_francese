import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: { target: 'es2020', sourcemap: false }
});
