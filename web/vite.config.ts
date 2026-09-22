import { execSync } from 'node:child_process';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Which build this is, stamped in so a person can read it off the screen and
 * compare with what was meant to ship. The commit is what release.sh signed;
 * the time is when the files were made.
 */
function buildStamp(): string {
  let commit = 'dev';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Not a checkout. Fine: 'dev' says as much.
  }
  return JSON.stringify({ commit, at: Date.now() });
}

/**
 * The dev server proxies the API and the gateway to the Node process, so the
 * browser sees a single origin. That matters beyond convenience: session
 * cookies are SameSite and httpOnly, and a split origin in development would
 * mean testing a different security posture than the one we ship.
 */
export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: buildStamp() },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        // The API's CSRF check admits localhost:5173 in development. A
        // worktree photographing itself runs this server on another port,
        // so a localhost origin on any port is presented as the usual one.
        // Only localhost origins: a request from any other site still fails.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const origin = req.headers.origin;
            if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
              proxyReq.setHeader('origin', 'http://localhost:5173');
            }
          });
        },
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
