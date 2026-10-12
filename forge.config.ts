import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

// The Vite plugin normally packages only `.vite/`. The main process also needs koffi (native FFI used
// for fullscreen detection on Windows) and its prebuilt binary package at runtime.
const isPackagedPath = (file: string): boolean => (
  file.startsWith('/.vite')
  || file === '/node_modules'
  || file === '/node_modules/koffi' || file.startsWith('/node_modules/koffi/')
  || file === '/node_modules/@koromix' || file.startsWith('/node_modules/@koromix/koffi-')
);

const config: ForgeConfig = {
  packagerConfig: {
    // Native .node binaries cannot be loaded from inside the asar archive.
    asar: { unpack: '**/*.node' },
    extraResource: ['public/avatars'],
    ignore: (file) => Boolean(file) && !isPackagedPath(file),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {},
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-zip',
      config: {},
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;