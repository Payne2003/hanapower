// Chạy sau cùng: hệ thống trống → trang khởi tạo → quản trị tạo tài khoản nhân viên → nhân viên đăng nhập.
// Kết thúc thì nạp lại dữ liệu mẫu.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const reset = (seed: boolean) =>
  execFileSync(process.execPath, ["scripts/migrate.mjs", "--reset", "--yes", ...(seed ? ["--seed"] : [])], { stdio: "inherit" });

test.afterAll(() => reset(true));

test("khởi tạo lần đầu, tạo tài khoản nhân viên, đặt lại mật khẩu", async ({ browser }) => {
  test.skip(process.env.E2E_RESET_DB !== "1", "Cần E2E_RESET_DB=1 (thao tác này xóa dữ liệu).");
  reset(false);
  // Xóa mọi tài khoản đăng nhập còn lại để hệ thống thật sự trống
  execFileSync(process.execPath, ["-e", "const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL||require('fs').readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)$/m)[1]});c.connect().then(()=>c.query(\"delete from auth.users where email in ('giamdoc@vidu.vn','nhanvien.moi@vidu.vn')\")).then(()=>c.end())"]);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/dang-nhap");
  await expect(page).toHaveURL(/\/khoi-tao/);
  await page.getByLabel("Tên doanh nghiệp").fill("Công ty Thử Nghiệm");
  await page.getByLabel("Họ tên của bạn").fill("Giám Đốc");
  await page.getByLabel("Email đăng nhập").fill("giamdoc@vidu.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("MatKhauManh#1");
  await page.getByLabel("Nhập lại mật khẩu").fill("MatKhauManh#1");
  await page.getByRole("button", { name: "Khởi tạo hệ thống" }).click();
  await expect(page.getByRole("heading", { name: "Xin chào, Giám Đốc" })).toBeVisible();

  // Trang khởi tạo đã đóng
  const other = await (await browser.newContext()).newPage();
  await other.goto("/khoi-tao");
  await expect(other).toHaveURL(/\/dang-nhap/);

  // Tạo tài khoản nhân viên
  await page.getByRole("link", { name: "Nhân viên", exact: true }).click();
  await page.getByText("Tạo tài khoản nhân viên").click();
  await page.getByLabel("Họ tên").fill("Nhân Viên Mới");
  await page.getByLabel("Email đăng nhập").fill("nhanvien.moi@vidu.vn");
  await page.getByLabel("Mật khẩu ban đầu").fill("BanDau123");
  await page.getByLabel("Bộ phận").selectOption({ label: "Bộ phận Content" });
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Đã tạo tài khoản nhanvien.moi@vidu.vn")).toBeVisible();

  // Đặt lại mật khẩu cho nhân viên
  const row = page.locator("li").filter({ hasText: "nhanvien.moi@vidu.vn" });
  await row.getByLabel("Mật khẩu mới").fill("MatKhauMoi456");
  await row.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(row.getByText("Đã đặt mật khẩu mới cho nhanvien.moi@vidu.vn.")).toBeVisible();

  // Nhân viên đăng nhập bằng mật khẩu mới, là Content nên tạo được video
  await other.getByLabel("Email công việc").fill("nhanvien.moi@vidu.vn");
  await other.getByLabel("Mật khẩu").fill("MatKhauMoi456");
  await other.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(other.getByRole("heading", { name: "Xin chào, Nhân Viên Mới" })).toBeVisible();
  await other.getByRole("link", { name: "Video", exact: true }).click();
  await expect(other.getByText("Tạo video mới")).toBeVisible();
  await expect(other.getByRole("link", { name: "Nhân viên", exact: true })).toHaveCount(0);
});
