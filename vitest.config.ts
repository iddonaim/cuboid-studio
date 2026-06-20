/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import path from 'path';

// Standalone Vitest config — intentionally separate from vite.config.ts so the
// test runner doesn't pull in the PWA/build plugins. Pure-logic and store tests
// (Phases 1-3) run in the default `node` environment — no jsdom. Component
// tests (Phase 4, .test.tsx) opt into jsdom per-file via a
// `// @vitest-environment jsdom` pragma rather than switching the whole suite.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
    // Surface unhandled assertions loudly rather than passing silently.
    passWithNoTests: false,
  },
});
