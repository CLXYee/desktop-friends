import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// .env lives in the frontend folder, not in the renderer root below.
const envDir = path.resolve(__dirname);

/** The origin (scheme://host:port) of VITE_API_BASE_URL, for the page's Content-Security-Policy. */
const apiOrigin = (mode: string): string => {
  const { VITE_API_BASE_URL: url } = loadEnv(mode, envDir, 'VITE_');
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
};

/** Lets the page call the backend wherever it is deployed (index.html says %API_ORIGIN%). */
const allowApiInCsp = (origin: string): Plugin => ({
  name: 'desktop-friends:api-origin-csp',
  transformIndexHtml: (html) => html.replace('%API_ORIGIN%', origin),
});

export default defineConfig(({ mode }) => ({
  root: 'src/renderer',
  publicDir: '../../public',
  envDir,
  base: './',
  plugins: [react(), allowApiInCsp(apiOrigin(mode))],
  build: {
    outDir: '../../.vite/renderer/main_window',
    emptyOutDir: true,
  },
}));
