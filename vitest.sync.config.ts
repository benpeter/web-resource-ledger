import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/mcp-sync.test.js', 'test/log-severity-sync.test.js'],
  },
});
