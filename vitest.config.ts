import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
  },
});
