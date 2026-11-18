import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // BASE_PATH=/khaosat-kdi/ khi build cho GitHub Pages; mặc định '/' (Vercel, dev).
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'packages/survey-core/src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['packages/**/*.test.ts', 'src/**/*.test.ts'],
  },
} as any);
