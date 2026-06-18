/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import path from 'path';

// Standalone Vitest config — intentionally separate from vite.config.ts so the
// test runner doesn't pull in the PWA/build plugins. Phase 1 covers pure logic
// only, so the default `node` environment is enough (no jsdom). When component
// tests arrive (next pass), add jsdom + @testing-library and switch those files
// to the jsdom environment via a per-file `// @vitest-environment jsdom` pragma.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    // Surface unhandled assertions loudly rather than passing silently.
    passWithNoTests: false,
  },
});
