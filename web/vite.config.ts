import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function normalizeBasePath(input?: string) {
  if (!input || input === '/') return '/';
  let value = input.trim();
  if (!value.startsWith('/')) value = `/${value}`;
  if (!value.endsWith('/')) value = `${value}/`;
  return value;
}

export default defineConfig({
  // Electron loads index.html through file://, which requires relative asset URLs.
  base: process.env.CLAWPM_ELECTRON === '1'
    ? './'
    : normalizeBasePath(process.env.CLAWPM_WEB_BASE_PATH),
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
