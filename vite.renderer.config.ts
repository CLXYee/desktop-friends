import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  publicDir: '../../public',
  // .env lives in the project root, not in the renderer root above.
  envDir: '../..',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../.vite/renderer/main_window',
    emptyOutDir: true,
  },
});