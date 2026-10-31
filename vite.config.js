import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', invite: 'invite.html' } } },
  test: { environment: 'jsdom' },
});
