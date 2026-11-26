// Lát cắt 1 qua trình duyệt: đăng nhập → QLDA tạo dự án & giao việc → nhân viên gửi báo cáo ngày
// → QLDA thấy tiến độ thay đổi và duyệt.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "MatKhau@123";

async function login(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}

test("đăng nhập sai báo lỗi tiếng Việt", async ({ page }) => {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email công việc").fill("nhanvien1@hanapower.local");
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Email hoặc mật khẩu không đúng.")).toBeVisible();
});

test("luồng giao việc → báo cáo ngày → tiến độ → duyệt", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const projectName = `Lắp trạm sạc xe điện – Kho Long An ${stamp}`;
  const taskTitle = `Khảo sát vị trí đặt trụ sạc ${stamp}`;

  // 1) Quản lý dự án tạo dự án, thêm thành viên và giao việc
  const pm = await login(browser, "quanlyduan@hanapower.local");
  await pm.getByRole("link", { name: "Dự án" }).first().click();
  await pm.getByText("+ Tạo dự án mới").click();
  await pm.getByLabel("Tên dự án").fill(projectName);
  await pm.getByLabel("Mô tả").fill("Thí điểm 4 trụ sạc 60 kW, có dấu tiếng Việt đầy đủ.");
  await pm.getByLabel("Phạm Quốc Dũng").check();
  await pm.getByRole("button", { name: "Tạo dự án" }).click();
  await expect(pm.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(pm.getByTestId("detail-progress")).toHaveText("Chưa có dữ liệu tiến độ");

  await pm.getByLabel("Tên công việc").fill(taskTitle);
  await pm.getByLabel("Người phụ trách").selectOption({ label: "Phạm Quốc Dũng" });
  await pm.getByLabel("Ưu tiên").selectOption("high");
  await pm.getByRole("button", { name: "Giao việc" }).click();
  await expect(pm.getByText(`Đã giao việc “${taskTitle}”.`)).toBeVisible();
  await expect(pm.getByTestId("task-card").filter({ hasText: taskTitle })).toContainText("Cần làm");
  await expect(pm.getByTestId("detail-progress")).toHaveText("0%");
  const projectUrl = pm.url();

  // 2) Nhân viên thấy việc, gửi báo cáo ngày báo 100%
  const emp = await login(browser, "nhanvien1@hanapower.local");
  await emp.getByRole("link", { name: /Việc của tôi/ }).click();
  await expect(emp.getByTestId("my-task").filter({ hasText: taskTitle })).toBeVisible();
  await emp.getByRole("link", { name: "Báo cáo", exact: true }).click();
  const row = emp.getByTestId("report-row").filter({ hasText: taskTitle });
  await row.getByRole("checkbox").check();
  await row.getByLabel("Kết quả trong ngày").fill("Đã khảo sát 4 vị trí, chụp ảnh hiện trạng, đo khoảng cách tủ điện.");
  await row.getByLabel("Tiến độ (%)").fill("100");
  await expect(row.getByText("Sẽ chuyển Chờ duyệt")).toBeVisible();
  // Bỏ chọn các dòng mặc định khác để báo cáo chỉ gồm việc này
  for (const other of await emp.getByTestId("report-row").all()) {
    if (!(await other.textContent())?.includes(taskTitle)) {
      const cb = other.getByRole("checkbox");
      if (await cb.isChecked()) await cb.uncheck();
    }
  }
  const submit = emp.getByRole("button", { name: /Gửi báo cáo/ });
  // nhấn hai lần liên tiếp: chỉ một lần được xử lý
  await submit.dblclick();
  await expect(emp.getByTestId("report-submitted")).toBeVisible();
  await expect(emp.getByText(/0% → 100%/)).toBeVisible();

  // 3) Quản lý thấy tiến độ đổi; việc 100% chờ duyệt, chưa tính hoàn tất
  await pm.goto(projectUrl);
  await expect(pm.getByTestId("detail-progress")).toHaveText("100%");
  await expect(pm.getByTestId("detail-done")).toHaveText("0/1");
  await expect(pm.getByTestId("detail-review")).toHaveText("1");
  const card = pm.getByTestId("task-card").filter({ hasText: taskTitle });
  await expect(card).toContainText("Chờ duyệt");

  // Quản lý thấy dòng báo cáo thuộc dự án mình
  await pm.getByRole("link", { name: "Báo cáo", exact: true }).click();
  await expect(pm.getByTestId("team-report").filter({ hasText: "Phạm Quốc Dũng" })).toContainText(taskTitle);

  // 4) Duyệt → Hoàn tất
  await pm.goto(projectUrl);
  await card.getByRole("button", { name: "Duyệt hoàn tất" }).click();
  await expect(card).toContainText("Hoàn tất");
  await expect(pm.getByTestId("detail-done")).toHaveText("1/1");

  // 5) Nhân viên khác dự án không mở được dự án này
  const other = await login(browser, "nhanvien3@hanapower.local");
  await other.goto(projectUrl);
  await expect(other.getByRole("heading", { name: /Không tìm thấy trang hoặc bạn không có quyền xem/ })).toBeVisible();
});

test("trả lại công việc kèm lý do hiện cho nhân viên", async ({ browser }) => {
  const emp2 = await login(browser, "nhanvien2@hanapower.local");
  await emp2.getByRole("link", { name: /Việc của tôi/ }).click();
  const card = emp2.getByTestId("my-task").filter({ hasText: "Thiết kế bố trí tấm pin" });
  await card.getByRole("spinbutton", { name: "Tiến độ (%)" }).fill("100");
  await card.getByRole("button", { name: "Cập nhật" }).click();
  await expect(card).toContainText("Chờ duyệt");
  await expect(card.getByText("Đang chờ quản lý duyệt — chưa thể đổi tiến độ.")).toBeVisible();

  const pm = await login(browser, "quanlyduan@hanapower.local");
  await pm.goto("/du-an/00000000-0000-4000-d000-000000000001");
  const t = pm.getByTestId("task-card").filter({ hasText: "Thiết kế bố trí tấm pin" });
  await t.getByRole("button", { name: "Trả lại…" }).click();
  await t.getByLabel("Lý do trả lại (bắt buộc)").fill("Thiếu sơ đồ chuỗi khu B");
  await t.getByRole("button", { name: "Xác nhận trả lại" }).click();
  await expect(t).toContainText("Đã trả lại: Thiếu sơ đồ chuỗi khu B");
  await expect(t).toContainText("Đang làm");

  await emp2.reload();
  await expect(emp2.getByTestId("my-task").filter({ hasText: "Thiết kế bố trí tấm pin" })).toContainText("Bị trả lại: Thiếu sơ đồ chuỗi khu B");
});

test("điện thoại: Việc của tôi xếp một cột, menu thu gọn", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/dang-nhap");
  await page.getByLabel("Email công việc").fill("nhanvien1@hanapower.local");
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: /Việc của tôi/ }).click();
  const cards = page.getByTestId("my-task");
  await expect(cards.first()).toBeVisible();
  const boxes = await Promise.all((await cards.all()).slice(0, 2).map((c) => c.boundingBox()));
  expect(boxes[0]!.x).toBeCloseTo(boxes[1]!.x, 0);
  expect(boxes[0]!.width).toBeGreaterThan(300);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(390);
});
