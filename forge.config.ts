import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Include Rust sampler binary
    extraResource: [
      process.platform === 'win32'
        ? 'rust-sampler/target/release/hue-hunter-sampler.exe'
        : 'rust-sampler/target/release/hue-hunter-sampler',
    ],
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'dev-app/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'dev-app/preload.ts',
          config: 'vite.preload.config.ts',
        },
        {
          entry: 'renderer/magnifier-preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
        {
          name: 'magnifier_window',
          config: 'vite.magnifier.config.ts',
        },
      ],
    }),
  ],
};

export default config;
