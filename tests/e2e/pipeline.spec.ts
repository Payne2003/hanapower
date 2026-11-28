// Quy trình sản xuất video qua trình duyệt:
// Content tạo video & chuẩn bị 4 hạng mục → bàn giao → Editor yêu cầu bổ sung → Content bổ sung
// → Editor nhận đủ, dựng, nộp duyệt → Leader yêu cầu sửa → Editor nộp lại → Leader duyệt → đăng kênh
// → báo cáo tháng + xuất CSV.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "MatKhau@123";

async function login(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}

const stage = (p: Page) => p.locator("header [data-stage]").first();

test("đăng nhập sai báo lỗi tiếng Việt", async ({ page }) => {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email công việc").fill("hieu@hanamedia.local");
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Email hoặc mật khẩu không đúng.")).toBeVisible();
});

test("bảng video tháng 11 giống bảng báo cáo gốc", async ({ browser }) => {
  const p = await login(browser, "tien@hanamedia.local");
  // Bảng gọn ở trang Video
  await p.goto("/video?thang=2026-11");
  await expect(p.getByTestId("video-row").filter({ hasText: "D0004" })).toContainText("Đã nhận đủ");
  // Bảng đầy đủ cột như Google Sheet ở Báo cáo tháng
  await p.goto("/bao-cao?thang=2026-11");
  const row = p.getByTestId("video-row").filter({ hasText: "D0004" });
  await expect(row).toContainText("báo tuyết và mèo pallas");
  await expect(row).toContainText("Hiếu");
  await expect(row).toContainText("Đã bàn giao");
  await expect(row).toContainText("Hòa");
  await expect(row).toContainText("Đã nhận đủ");
  await expect(row).toContainText("bổ sung những cảnh chạy rượt đuổi kịch tính hơn");
  await expect(p.getByTestId("video-row").filter({ hasText: "D0001" })).toContainText("Đang triển khai");
});

test("quy trình đầy đủ từ ý tưởng đến đăng kênh", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-5);
  const title = `linh cẩu và đàn sư tử ${stamp}`;

  // 1) Content (Hiếu) tạo video, chọn Editor Duy
  const hieu = await login(browser, "hieu@hanamedia.local");
  await hieu.getByRole("link", { name: "Video", exact: true }).click();
  await hieu.getByTestId("create-video").click();
  await hieu.getByLabel("Tên video / chủ đề").fill(title);
  await hieu.getByLabel("Ý tưởng / yêu cầu").fill("Góc kể: linh cẩu phản công, tham khảo video đối thủ.");
  await hieu.getByLabel("Editor tiếp nhận").selectOption({ label: "Duy" });
  await hieu.getByRole("button", { name: /Tạo video/ }).click();
  await expect(hieu.getByRole("heading", { name: title })).toBeVisible();
  await expect(stage(hieu)).toHaveText("Ý tưởng");
  const code = (await hieu.locator("header .font-mono").first().textContent())!.trim();
  expect(code).toMatch(/^D\d{4}$/);
  const url = hieu.url();

  // Bàn giao khi chưa đủ → báo thiếu
  await hieu.getByRole("button", { name: "Lưu & bàn giao cho Editor" }).click();
  await expect(hieu.getByRole("alert").filter({ hasText: "Chưa hoàn thành" })).toBeVisible();

  // Hoàn thành 4 hạng mục + link → bàn giao
  for (const label of ["Nguồn thật", "Video AI", "Kịch bản / VO", "Sơ đồ dựng"]) {
    await hieu.getByRole("group", { name: label, exact: true }).getByText("Hoàn thành").click();
  }
  await hieu.getByLabel("Link tài nguyên (Google Drive…)").fill("https://drive.google.com/drive/folders/thu-nghiem");
  await hieu.getByRole("button", { name: "Lưu & bàn giao cho Editor" }).click();
  await expect(hieu.getByText("Đã bàn giao cho Editor.")).toBeVisible();
  await expect(stage(hieu)).toHaveText("Chờ bàn giao");

  // 2) Editor (Duy): thấy việc trên Tổng quan → yêu cầu bổ sung
  const duy = await login(browser, "duy@hanamedia.local");
  await expect(duy.getByTestId("my-todo").getByRole("link").filter({ hasText: title })).toContainText("Xác nhận bàn giao");
  await duy.goto(url);
  await duy.getByRole("button", { name: "Yêu cầu bổ sung…" }).click();
  await duy.getByLabel("Cần bổ sung gì? (bắt buộc)").fill("Thiếu cảnh linh cẩu cắn trả cận cảnh");
  await duy.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
  await expect(duy.getByText("Đã gửi yêu cầu bổ sung cho Content.")).toBeVisible();
  await expect(stage(duy)).toHaveText("Đang chuẩn bị");

  // 3) Content nhận thông báo, bổ sung và bàn giao lại
  await hieu.goto("/thong-bao");
  await expect(hieu.getByTestId("notifications")).toContainText(`Editor yêu cầu bổ sung video ${code}`);
  await hieu.goto(url);
  await expect(hieu.getByText("Editor yêu cầu bổ sung: Thiếu cảnh linh cẩu cắn trả cận cảnh")).toBeVisible();
  await hieu.getByLabel("Link tài nguyên (Google Drive…)").fill("https://drive.google.com/drive/folders/thu-nghiem-v2");
  await hieu.getByRole("button", { name: "Lưu & bàn giao cho Editor" }).click();
  await expect(stage(hieu)).toHaveText("Chờ bàn giao");

  // 4) Editor nhận đủ → dựng → nộp duyệt
  await duy.reload();
  await duy.getByLabel("Ghi chú Edit (tùy chọn)").fill("Sẽ thêm nhạc dồn dập đoạn cuối");
  await duy.getByRole("button", { name: "Đã nhận đủ" }).click();
  await expect(duy.getByText("Đã xác nhận nhận đủ — chuyển sang Đang dựng.")).toBeVisible();
  await expect(stage(duy)).toHaveText("Đang dựng");
  await duy.getByLabel("Tiến độ (%)").fill("70");
  await duy.getByLabel("Link bản dựng").fill("https://drive.google.com/file/d/ban-dung-1");
  await duy.getByRole("button", { name: "Nộp duyệt" }).click();
  await expect(stage(duy)).toHaveText("Chờ duyệt");

  // 5) Leader yêu cầu sửa
  const leader = await login(browser, "leader@hanamedia.local");
  await expect(leader.getByTestId("my-todo").getByRole("link").filter({ hasText: title })).toContainText("Duyệt bản dựng");
  await leader.goto(url);
  await leader.getByRole("button", { name: "Yêu cầu sửa…" }).click();
  await leader.getByLabel("Cần sửa gì? (bắt buộc)").fill("Phụ đề đoạn giữa bị lệch");
  await leader.getByRole("button", { name: "Gửi yêu cầu sửa" }).click();
  await expect(stage(leader)).toHaveText("Đang dựng");

  // 6) Editor sửa, nộp lại
  await duy.reload();
  await expect(duy.getByText("Leader yêu cầu sửa (lần 1): Phụ đề đoạn giữa bị lệch")).toBeVisible();
  await duy.getByLabel("Link bản dựng").fill("https://drive.google.com/file/d/ban-dung-2");
  await duy.getByRole("button", { name: "Nộp duyệt" }).click();
  await expect(stage(duy)).toHaveText("Chờ duyệt");

  // 7) Leader duyệt → đăng kênh
  await leader.reload();
  await leader.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(stage(leader)).toHaveText("Chờ đăng");
  await leader.getByLabel("Link video đã đăng").fill("https://www.youtube.com/watch?v=thunghiem");
  await leader.getByRole("button", { name: "Xác nhận đã đăng" }).click();
  await expect(stage(leader)).toHaveText("Đã đăng");
  await expect(leader.getByTestId("history")).toContainText("Editor yêu cầu bổ sung");
  await expect(leader.getByTestId("history")).toContainText("Yêu cầu sửa");

  // 8) Báo cáo tháng có video + xuất CSV đúng cột của bảng gốc
  await leader.goto("/bao-cao");
  await expect(leader.getByTestId("video-row").filter({ hasText: code })).toContainText("Đã đăng");
  const [download] = await Promise.all([leader.waitForEvent("download"), leader.getByRole("link", { name: /Xuất Excel/ }).click()]);
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  const csv = readFileSync(path!, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Mã dự án,Tên dự án / video,Content phụ trách,Nguồn thật,Video AI");
  expect(csv).toContain(`${code},${title},Hiếu,Hoàn thành,Hoàn thành,Hoàn thành,Hoàn thành`);
});

test("Editor không thấy nút thao tác của bước không thuộc mình", async ({ browser }) => {
  const hoa = await login(browser, "hoa@hanamedia.local");
  await hoa.goto("/video?thang=2026-11");
  await hoa.getByTestId("video-row").filter({ hasText: "D0008" }).getByRole("link", { name: "D0008" }).click();
  await expect(stage(hoa)).toHaveText("Chờ bàn giao");
  await expect(hoa.getByRole("button", { name: "Đã nhận đủ" })).toHaveCount(0); // Editor của D0008 là Tiện
  await expect(hoa.getByRole("button", { name: "Lưu & bàn giao cho Editor" })).toHaveCount(0);
});

test("điện thoại: danh sách video dạng thẻ, không cuộn ngang", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/dang-nhap");
  await page.getByLabel("Email công việc").fill("hieu@hanamedia.local");
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: "Video", exact: true }).click();
  await page.goto("/video?thang=2026-11");
  await expect(page.getByTestId("video-card").first()).toBeVisible();
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
});
