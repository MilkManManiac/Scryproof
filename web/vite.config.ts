import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies the API and the gateway to the Node process, so the
 * browser sees a single origin. That matters beyond convenience: session
 * cookies are SameSite and httpOnly, and a split origin in development would
 * mean testing a different security posture than the one we ship.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
      '/gateway': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
        changeOrigin: false,
      },
    },
  },
  optimizeDeps: {
    // The shared workspace is raw TypeScript compiled by Vite itself, not a
    // prebuilt package.
    exclude: ['@scryproof/shared'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
