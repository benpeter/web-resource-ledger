import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/mcp-sync.test.js', 'test/log-severity-sync.test.js', 'test/llms-sync.test.js', 'test/routes-sync.test.js', 'test/rate-limits-sync.test.js', 'test/alerts-sync.test.js', 'test/env-sync.test.js', 'test/og-image-sync.test.js', 'test/sign-in-links-sync.test.js'],
  },
});
