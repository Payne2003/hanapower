import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // "server-only" chỉ để chặn nhập nhầm vào mã trình duyệt; trong kiểm thử bỏ qua.
  resolve: { alias: { "@": resolve(__dirname, "src"), "server-only": resolve(__dirname, "tests/stubs/empty.ts") } },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
  },
});
