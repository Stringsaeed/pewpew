import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const game = fileURLToPath(new URL('../src', import.meta.url));

export default defineConfig({
  site: 'https://pewpew.saeed.sh',
  devToolbar: { enabled: false },
  integrations: [sitemap()],
  vite: {
    resolve: {
      alias: {
        '@game': game,
        'react-native-audio-api': fileURLToPath(new URL('./src/demo/rn-audio-stub.ts', import.meta.url)),
      },
    },
    // The demo imports the app's sim, renderer, and synth straight from ../src.
    server: { fs: { allow: ['..'] } },
    optimizeDeps: { exclude: ['react-native-webgpu', 'react-native'] },
  },
});
