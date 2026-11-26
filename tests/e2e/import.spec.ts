// Nhập dữ liệu từ tệp Excel giống "Bảng báo cáo bộ phận content".
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FILE = "test-results/bao-cao-mau.xlsx";

test.beforeAll(async () => {
  mkdirSync("test-results", { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Báo cáo Content t10");
  ws.addRow(["BÁO CÁO CÔNG VIỆC VÀ BÀN GIAO CONTENT"]);
  ws.addRow(["Content cập nhật tài nguyên và ghi chú → Editor kiểm tra…"]);
  ws.addRow(["THÔNG TIN DỰ ÁN"]);
  ws.addRow(["STT", "Ngày báo cáo", "Mã dự án", "Tên dự án / video", "Content phụ trách", "Nguồn thật", "Video AI", "Kịch bản / VO", "Sơ đồ dựng", "Link tài nguyên", "Trạng thái Content", "Ghi chú Content", "Editor tiếp nhận", "Xác nhận bàn giao", "Ngày xác nhận", "Ghi chú Edit bổ sung/ thêm bớt"]);
  ws.addRow([1, new Date(Date.UTC(2026, 9, 3)), "D0101", "hà mã và cá sấu sông Nile", "Hiếu", "Hoàn thành", "Hoàn thành", "Hoàn thành", "Hoàn thành", "https://drive.google.com/drive/folders/thu", "Đã bàn giao", null, "Duy", "Đã nhận đủ", new Date(Date.UTC(2026, 9, 4)), "thêm cảnh dưới nước"]);
  ws.addRow([2, new Date(Date.UTC(2026, 9, 5)), "D0102", "chim cánh cụt hoàng đế", "Phong", "Đang làm", "Chưa làm", "Hoàn thành", "Chưa làm", null, "Đang triển khai", null, "Hòa", "Chờ xác nhận", null, null]);
  ws.addRow([3, new Date(Date.UTC(2026, 9, 6)), "D0002", "cá sấu và đàn sư tử", "Hiếu", "Hoàn thành", "Hoàn thành", "Hoàn thành", "Hoàn thành", null, "Đã bàn giao", null, "Duy", "Đã nhận đủ", null, null]);
  ws.addRow([4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
  await wb.xlsx.writeFile(FILE);
});

test("Leader nhập tệp Excel: xem trước, bỏ qua mã đã có, nhập video mới", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/dang-nhap");
  await page.getByLabel("Email công việc").fill("leader@hanamedia.local");
  await page.getByLabel("Mật khẩu").fill("MatKhau@123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();

  await page.goto("/video");
  await page.getByRole("link", { name: "Nhập từ Excel" }).click();
  await page.getByLabel("Tệp .xlsx").setInputFiles(FILE);
  await page.getByRole("button", { name: "Đọc tệp và xem trước" }).click();
  const summary = page.getByTestId("import-summary");
  await expect(summary).toContainText("2 video mới");
  await expect(summary).toContainText("1 đã có");
  await expect(page.getByTestId("import-line").filter({ hasText: "D0101" })).toContainText("Đang dựng");
  await expect(page.getByTestId("import-line").filter({ hasText: "D0102" })).toContainText("Đang chuẩn bị");

  await page.getByRole("button", { name: "Nhập 2 video" }).click();
  await expect(page.getByText("Đã nhập 2 video")).toBeVisible();

  await page.goto("/video?thang=2026-10");
  const row = page.getByTestId("video-row").filter({ hasText: "D0101" });
  await expect(row).toContainText("hà mã và cá sấu sông Nile");
  await expect(row).toContainText("Đã nhận đủ");
  await expect(row).toContainText("Duy");
});
