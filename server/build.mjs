/**
 * Production build of the API.
 *
 * One file out, `dist/index.js`. npm packages stay external and are loaded
 * from node_modules at runtime; several of them carry native code or
 * WebAssembly that a bundler should not try to swallow.
 *
 * The one exception is our own `@scryproof/shared` workspace. It is TypeScript
 * source with no build step, so Node cannot load it. Leaving it external is
 * what `--packages=external` did, and the result was a build that compiled
 * cleanly and could not start. It gets bundled in.
 */

import { build } from 'esbuild';

const bundleOurOwn = {
  name: 'external-except-workspace',
  setup(api) {
    // A bare specifier is anything that is not a relative or absolute path.
    api.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@scryproof/')) return undefined;
      if (/^[A-Za-z]:[\/]/.test(args.path)) return undefined; // a Windows path
      return { path: args.path, external: true };
    });
  },
};

// The box's reset-password command (scripts/reset-password.ts) ships beside
// the server as its own file, built the same way.
await build({
  entryPoints: { index: 'src/index.ts', 'reset-password': 'src/scripts/reset-password.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [bundleOurOwn],
  logLevel: 'info',
});
