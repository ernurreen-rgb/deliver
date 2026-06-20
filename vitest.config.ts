import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "apps/web/src/**/*.test.ts",
      "apps/*-mobile/src/**/*.test.ts",
      "packages/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
});
