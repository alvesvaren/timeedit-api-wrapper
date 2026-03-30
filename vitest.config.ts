import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/tests/setup-e2e-token.ts"],
    testTimeout: 120_000,
  },
});
