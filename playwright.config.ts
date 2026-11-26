import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "off",
    // Kiểm thử cấu hình tại văn phòng: CA nội bộ của Caddy chưa được tin cậy trên máy kiểm thử.
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === "1",
    // vd. E2E_HOST_RULES="MAP hanapower.lan 127.0.0.1" khi chưa có DNS nội bộ.
    launchOptions: process.env.E2E_HOST_RULES ? { args: [`--host-resolver-rules=${process.env.E2E_HOST_RULES}`, "--no-proxy-server"] } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: undefined } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
