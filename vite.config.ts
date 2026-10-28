import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // L-9: production maps expose source and are rejected by the bundle audit.
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Vitest owns the unit/component files below; Playwright owns
  // `test/e2e/*.spec.ts`. Without the exclude, vitest imports the Playwright
  // spec and the two runners collide on their shared `test.describe` API.
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'test/**/*.test.mjs'],
    exclude: ['test/e2e/**'],
  },
});
