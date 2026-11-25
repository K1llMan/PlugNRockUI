import react from '@vitejs/plugin-react';
import { intlayer } from "vite-intlayer";
import svgr from 'vite-plugin-svgr';

import { defineConfig } from 'vite';

import path from 'path';

// Бэкенд (server.py) необязателен: без него страница работает полностью локально.
const target = process.env.PLAY_SONG_SERVER || 'http://127.0.0.1:8000';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    intlayer(),
    react(),
    svgr()
  ],
  base: './',
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: true }, '/audio': { target, changeOrigin: true } } },
  build: { target: 'es2021', chunkSizeWarningLimit: 1500 },
});