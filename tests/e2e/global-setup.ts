import { execFileSync } from "node:child_process";

// Đưa CSDL về dữ liệu mẫu trước khi chạy E2E (chỉ khi E2E_RESET_DB=1, vì lệnh này XÓA dữ liệu).
export default function globalSetup() {
  if (process.env.E2E_RESET_DB === "1") {
    execFileSync(process.execPath, ["scripts/migrate.mjs", "--reset", "--yes", "--seed"], { stdio: "inherit" });
  }
}
