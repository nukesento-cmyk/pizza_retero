import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "shared", root: "packages/shared", include: ["test/**/*.test.ts"] },
      },
      {
        test: { name: "core", root: "packages/core", include: ["test/unit/**/*.test.ts"] },
      },
      {
        // DB-backed tests: run serially against the retero_test database.
        test: {
          name: "db",
          include: ["packages/db/test/**/*.test.ts", "packages/core/test/integration/**/*.test.ts"],
          globalSetup: ["test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
      {
        test: { name: "web", root: "apps/web", include: ["src/**/*.test.ts"] },
      },
    ],
  },
});
