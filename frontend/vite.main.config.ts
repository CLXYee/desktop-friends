import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // koffi loads a native binary at runtime, so it cannot be bundled; forge.config.ts ships it instead.
      external: ['electron', 'koffi', ...builtinModules],
    },
  },
});