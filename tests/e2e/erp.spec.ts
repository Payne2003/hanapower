// CRM → báo giá → hợp đồng → dự án; chi phí duyệt → thanh toán; cộng tác viên; bảng lương — qua trình duyệt.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "MatKhau@123";

async function login(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept()); // xác nhận / nhập lý do bằng hộp thoại của trình duyệt
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}

const noError = async (p: Page) => {
  await expect(p.getByText("Không tải được dữ liệu")).toHaveCount(0);
  await expect(p.getByRole("heading").first()).toBeVisible();
};

test("quản trị mở được mọi trang của hệ thống mà không lỗi", async ({ browser }) => {
  const p = await login(browser, "admin@hanamedia.local");
  const paths = ["/", "/cong-viec", "/video", "/bao-cao", "/du-an", "/cong-tac-vien", "/lead", "/tai-khoan", "/lien-he", "/co-hoi", "/bao-gia", "/hop-dong", "/don-hang",
    "/san-pham", "/danh-muc", "/don-vi", "/bang-gia", "/nguon-lead", "/nganh-nghe", "/thu-chi", "/thu-chi?tab=tam-ung", "/thu-chi?tab=thu", "/thu-chi?tab=cong-no", "/thu-chi?tab=lai-lo",
    "/nhan-su", "/phong-ban", "/chuc-vu", "/cham-cong", "/luong", "/luong?tab=ho-so", "/luong?tab=thuong", "/luong?tab=cai-dat", "/thong-bao", "/tro-chuyen", "/cai-dat"];
  for (const path of paths) {
    const res = await p.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await noError(p);
  }
  // Thanh điều hướng có nhóm giống CRM
  await p.goto("/");
  const nav = p.getByRole("navigation", { name: "Điều hướng chính" });
  for (const t of ["Lead", "Tài khoản", "Liên hệ", "Cơ hội", "Báo giá", "Hợp đồng", "Đơn hàng", "Sản phẩm / dịch vụ", "Bảng giá", "Dự án", "Thu chi & công nợ", "Bảng lương"]) {
    await expect(nav.getByRole("link", { name: t, exact: true })).toBeVisible();
  }
});

test("danh mục CRM: tạo tài khoản rồi sửa; lead chuyển đổi thành khách + cơ hội", async ({ browser }) => {
  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/tai-khoan");
  await p.getByText("Thêm tài khoản").click();
  await p.getByLabel("Tên công ty *").fill("Công ty Thử Nghiệm E2E");
  await p.getByRole("button", { name: "Thêm mới" }).click();
  await expect(p.getByRole("heading", { name: "Công ty Thử Nghiệm E2E" })).toBeVisible();
  await p.getByLabel("Mã số thuế").fill("0101010101");
  await p.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(p.getByText("Đã lưu.")).toBeVisible();

  await p.goto("/lead");
  await p.getByRole("link", { name: /Quang Huy/ }).click();
  await p.getByRole("button", { name: "Chuyển đổi", exact: true }).click();
  await expect(p.getByRole("heading", { name: "Đã chuyển đổi" })).toBeVisible();
  await expect(p.getByRole("link", { name: "Cơ hội", exact: true }).first()).toBeVisible();
});

test("cơ hội → báo giá → hợp đồng → kích hoạt → dự án", async ({ browser }) => {
  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/co-hoi");
  await p.getByRole("link", { name: /Kênh YouTube du lịch Mặt Trời/ }).click();
  await expect(p.getByRole("heading", { name: "Kênh YouTube du lịch Mặt Trời" })).toBeVisible();
  await p.getByRole("button", { name: "Tạo báo giá từ các dòng trên" }).click();
  await expect(p).toHaveURL(/\/bao-gia\//);
  await expect(p.getByText("Nháp").first()).toBeVisible();
  await p.getByRole("button", { name: "Gửi duyệt" }).click();
  await p.getByRole("button", { name: "Duyệt báo giá" }).click();
  await p.getByRole("button", { name: "Đã gửi cho khách" }).click();
  await p.getByRole("button", { name: "Khách chấp nhận" }).click();
  await p.getByRole("button", { name: "Tạo hợp đồng" }).click();
  await expect(p).toHaveURL(/\/hop-dong\//);
  await p.getByRole("button", { name: "Gửi chờ hiệu lực" }).click();
  await p.getByRole("button", { name: "Kích hoạt hợp đồng" }).click();
  await expect(p.getByText("Đang hiệu lực").first()).toBeVisible();
  await p.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(p).toHaveURL(/\/du-an\//);
  await expect(p.getByRole("heading", { name: /DA0002/ })).toBeVisible();
  await p.getByRole("link", { name: "Nghiệm thu & thanh toán" }).click();
  await expect(p.getByText("Nghiệm thu & thanh toán").first()).toBeVisible();
});

test("dự án: thành viên không thấy tiền; người ngoài không thấy dự án", async ({ browser }) => {
  const m = await login(browser, "hieu@hanamedia.local");
  await m.goto("/du-an");
  await expect(m.getByTestId("list-projects")).toContainText("DA0001");
  await m.getByRole("link", { name: /DA0001/ }).click();
  await expect(m.getByRole("link", { name: "Nghiệm thu & thanh toán" })).toHaveCount(0);
  await expect(m.getByRole("link", { name: "Lãi / lỗ" })).toHaveCount(0);
  const o = await login(browser, "hoa@hanamedia.local");
  await o.goto("/du-an");
  await expect(o.getByText("Chưa có dự án nào bạn tham gia")).toBeVisible();
});

test("chi phí: nhân viên đề nghị → kế toán duyệt → thanh toán", async ({ browser }) => {
  const e = await login(browser, "duy@hanamedia.local");
  await e.goto("/thu-chi");
  await e.getByText("Đề nghị chi / ghi nhận chi phí").click();
  await e.getByLabel("Số tiền (₫) *").fill("750000");
  await e.getByLabel("Dự án").selectOption({ index: 1 }); // dự án DA0001 mà Duy là thành viên
  await e.getByLabel("Nội dung").fill("Mua thẻ nhớ E2E");
  await e.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(e.getByText("Đã lưu.")).toBeVisible();
  await expect(e.getByTestId("list-expenses")).toContainText("Mua thẻ nhớ E2E");
  await expect(e.getByTestId("list-expenses").locator("tr", { hasText: "Mua thẻ nhớ E2E" }).getByRole("button", { name: "Duyệt" })).toHaveCount(0);

  const k = await login(browser, "ketoan@hanamedia.local");
  await k.goto("/thu-chi");
  const row = k.getByTestId("list-expenses").locator("tr", { hasText: "Mua thẻ nhớ E2E" });
  await row.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(row.getByRole("button", { name: "Đã thanh toán" })).toBeVisible();
  await row.getByRole("button", { name: "Đã thanh toán" }).click();
  await expect(row).toContainText("Đã thanh toán");
  const dl = k.waitForEvent("download");
  await k.goto("/thu-chi?tab=lai-lo");
  await expect(k.getByText("DA0001").first()).toBeVisible();
  void dl.catch(() => undefined);
});

test("cộng tác viên chỉ thấy việc của mình; nhận việc → bàn giao → leader nghiệm thu", async ({ browser }) => {
  const c = await login(browser, "ctv@hanamedia.local");
  const nav = c.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: "Tài khoản" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Thu chi & công nợ" })).toHaveCount(0);
  await expect(c.getByTestId("collab-open")).toContainText("Thiết kế 4 thumbnail");
  await c.getByRole("link", { name: /Thiết kế 4 thumbnail/ }).click();
  await c.getByRole("button", { name: "Nhận việc" }).click();
  await c.getByLabel(/Link sản phẩm/).fill("https://drive.example.com/thumb");
  await c.getByRole("button", { name: "Bàn giao", exact: true }).click();
  await expect(c.getByText("Sản phẩm bàn giao:")).toBeVisible();
  await c.goto("/video");
  await expect(c.getByTestId("video-row")).toHaveCount(0);

  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/cong-tac-vien");
  await l.getByRole("link", { name: /Thiết kế 4 thumbnail/ }).first().click();
  await l.getByRole("button", { name: /Nghiệm thu & đề nghị chi/ }).click();
  await expect(l.getByText("Đã nghiệm thu").first()).toBeVisible();
});

test("lương: nhân sự tính & kiểm tra → kế toán duyệt & chi trả → nhân viên xem phiếu", async ({ browser }) => {
  const h = await login(browser, "nhansu@hanamedia.local");
  await h.goto("/cham-cong?m=2026-10");
  await h.getByRole("button", { name: "Điền đủ công T2–T6" }).first().click();
  await h.goto("/luong");
  await h.getByText("Tạo / tính lại bảng lương một tháng").click();
  await h.getByLabel("Năm *").fill("2026");
  await h.getByLabel("Tháng *").fill("10");
  await h.getByRole("button", { name: "Tạo bảng lương" }).click();
  await expect(h.getByRole("heading", { name: /Bảng lương tháng 10\/2026/ })).toBeVisible();
  await h.getByRole("button", { name: "Nhân sự xác nhận đã kiểm tra" }).click();
  await expect(h.getByText("Nhân sự đã kiểm tra").first()).toBeVisible();

  const k = await login(browser, "ketoan@hanamedia.local");
  await k.goto("/luong");
  await k.getByRole("link", { name: /Tháng 10\/2026/ }).click();
  await k.getByRole("button", { name: "Kế toán duyệt bảng lương" }).click();
  await k.getByRole("button", { name: "Xác nhận đã chi trả" }).click();
  await expect(k.getByText(/Đã chi trả ngày/)).toBeVisible();

  const e = await login(browser, "duy@hanamedia.local");
  await e.goto("/luong");
  await expect(e.getByRole("heading", { name: "Phiếu lương của tôi" })).toBeVisible();
  await expect(e.getByText("Tháng 10/2026")).toBeVisible();
  const res = await e.request.get("/luong/xuat");
  expect(res.status()).toBe(404);
});

test("báo giá PDF: người có quyền tải được tệp PDF hợp lệ, người không có quyền CRM không thấy", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/bao-gia");
  await l.getByRole("link", { name: /BG0001/ }).click();
  await expect(l.getByRole("link", { name: "Tải PDF" })).toBeVisible();
  const url = new URL(l.url()).pathname;
  const res = await l.request.get(`${url}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(10_000);
  const dl = await l.request.get(`${url}/pdf?tai=1`);
  expect(dl.headers()["content-disposition"]).toContain('attachment; filename="BG0001.pdf"');

  const e = await login(browser, "hoa@hanamedia.local");
  expect((await e.request.get(`${url}/pdf`)).status()).toBe(404);
});

test("nhập khách hàng từ Excel: xem trước, loại trùng, nhập, nhập lại không tạo trùng", async ({ browser }) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Khách hàng");
  ws.addRow(["Tên công ty", "Mã số thuế", "Điện thoại", "Email", "Ngành nghề", "Người phụ trách"]);
  ws.addRow(["Công ty Excel Một", "0201020304", 901234500, "mot@excel.vn", "Du lịch", "Leader Sản xuất"]);
  ws.addRow(["Công ty Excel Hai", "", "0987000111", "email-hong", "", ""]);
  ws.addRow(["Công ty TNHH Nông sản Xanh", "0312345678", "", "", "", ""]); // đã có trong hệ thống
  ws.addRow(["", "", "0900000000", "", "", ""]); // thiếu tên
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/tai-khoan");
  await p.getByRole("link", { name: "Nhập từ Excel" }).click();
  const tpl = await p.request.get("/nhap-khach-hang/tai-khoan/mau");
  expect(tpl.status()).toBe(200);
  expect(tpl.headers()["content-type"]).toContain("spreadsheetml");

  await p.getByLabel(/Tệp \.xlsx/).setInputFiles({ name: "khach.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await p.getByRole("button", { name: "Đọc tệp và xem trước" }).click();
  const sum = p.getByTestId("import-summary");
  await expect(sum).toContainText("2 bản ghi mới");
  await expect(sum).toContainText("1 trùng");
  await expect(sum).toContainText("1 lỗi");
  await expect(p.getByText(/email-hong.*không hợp lệ/)).toBeVisible();
  await p.getByRole("button", { name: "Nhập 2 bản ghi" }).click();
  await expect(p.getByTestId("import-done")).toContainText("Đã nhập 2 bản ghi");

  await p.goto("/tai-khoan?q=Excel");
  await expect(p.getByTestId("list-account")).toContainText("Công ty Excel Một");
  await expect(p.getByTestId("list-account")).toContainText("Công ty Excel Hai");

  // Nhập lại cùng tệp: tất cả đã có
  await p.goto("/nhap-khach-hang/tai-khoan");
  await p.getByLabel(/Tệp \.xlsx/).setInputFiles({ name: "khach.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await p.getByRole("button", { name: "Đọc tệp và xem trước" }).click();
  await expect(p.getByTestId("import-summary")).toContainText("0 bản ghi mới");
  await expect(p.getByRole("button", { name: "Không có bản ghi mới" })).toBeDisabled();

  // Người không có quyền CRM không vào được trang nhập
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/nhap-khach-hang/tai-khoan");
  await expect(h).toHaveURL(/\/tai-khoan$/);
});

test("hợp đồng PDF: tải được tệp hợp lệ; sửa điều khoản bổ sung; người không có quyền không thấy", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/hop-dong");
  await l.getByRole("link", { name: /HD0001/ }).click();
  await expect(l.getByRole("link", { name: "Tải PDF" })).toBeVisible();
  const url = new URL(l.url()).pathname;
  const res = await l.request.get(`${url}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(10_000);
  expect((await l.request.get(`${url}/pdf?tai=1`)).headers()["content-disposition"]).toContain('attachment; filename="HD0001.pdf"');

  // Hợp đồng đang hiệu lực: ghi nhận chữ ký được, không đổi được ngày
  await l.getByText("Sửa ngày hiệu lực, điều khoản bổ sung, thông tin chữ ký").click();
  await l.getByLabel("Người đại diện khách ký").fill("Chị Thu Hà");
  await l.getByRole("button", { name: "Lưu hợp đồng" }).click();
  await expect(l.getByText("Đã lưu.")).toBeVisible();
  await l.getByLabel(/Điều khoản bổ sung/).fill("Điều khoản mới");
  await l.getByRole("button", { name: "Lưu hợp đồng" }).click();
  await expect(l.getByText(/chỉ ghi nhận được thông tin chữ ký/)).toBeVisible();

  const e = await login(browser, "hoa@hanamedia.local");
  expect((await e.request.get(`${url}/pdf`)).status()).toBe(404);
});

test("nhập sản phẩm từ Excel: khớp danh mục, tự tạo danh mục mới, bỏ trùng", async ({ browser }) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bảng giá");
  ws.addRow(["Dịch vụ", "Mã", "Nhóm", "ĐVT", "Đơn giá"]);
  ws.addRow(["Thiết kế thumbnail E2E", "TB-E2E", "Thiết kế E2E", "Ảnh", "300000"]);
  ws.addRow(["Lồng tiếng E2E", "LT-E2E", "Hậu kỳ", "Phút", "1.200.000"]);
  ws.addRow(["Dựng hậu kỳ video", "", "Hậu kỳ", "Video", "4000000"]); // trùng tên với dữ liệu mẫu
  ws.addRow(["Giá hỏng E2E", "", "", "", "abc"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const file = { name: "san-pham.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer };

  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/san-pham");
  await p.getByRole("link", { name: "Nhập từ Excel" }).click();
  expect((await p.request.get("/nhap-khach-hang/san-pham/mau")).status()).toBe(200);
  await p.getByLabel(/Tệp \.xlsx/).setInputFiles(file);
  await p.getByRole("button", { name: "Đọc tệp và xem trước" }).click();
  const sum = p.getByTestId("import-summary");
  await expect(sum).toContainText("2 bản ghi mới");
  await expect(sum).toContainText("1 trùng");
  await expect(sum).toContainText("1 lỗi");
  await expect(p.getByText(/Danh mục "Thiết kế E2E" chưa có/)).toBeVisible();
  await p.getByRole("button", { name: "Nhập 2 bản ghi" }).click();
  await expect(p.getByTestId("import-done")).toContainText("tạo mới 2 danh mục / đơn vị");

  await p.goto("/san-pham?q=E2E");
  await expect(p.getByTestId("list-product")).toContainText("Thiết kế thumbnail E2E");
  await expect(p.getByTestId("list-product")).toContainText("1.200.000");
  await p.goto("/danh-muc?q=E2E");
  await expect(p.getByTestId("list-category")).toContainText("Thiết kế E2E");

  await p.goto("/nhap-khach-hang/san-pham");
  await p.getByLabel(/Tệp \.xlsx/).setInputFiles(file);
  await p.getByRole("button", { name: "Đọc tệp và xem trước" }).click();
  await expect(p.getByTestId("import-summary")).toContainText("0 bản ghi mới");
});

test("Dashboard có biểu đồ thống kê theo quyền; báo cáo bán hàng chỉ cho người có quyền CRM", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await expect(l.getByRole("heading", { name: "Biểu đồ thống kê" })).toBeVisible();
  for (const name of [/^Thu chi theo tháng/, /^Cơ hội theo giai đoạn/, /^Video theo tuần/, /^Nhân sự theo phòng ban/]) {
    await expect(l.getByRole("img", { name })).toBeVisible();
  }
  await l.getByRole("link", { name: "Báo cáo bán hàng →" }).click();
  await expect(l.getByRole("heading", { name: "Báo cáo bán hàng" })).toBeVisible();
  await expect(l.getByText("Tỷ lệ thắng")).toBeVisible();
  await expect(l.getByRole("heading", { name: "Dự báo doanh thu theo tháng dự kiến chốt" })).toBeVisible();
  await expect(l.getByRole("heading", { name: "Phễu cơ hội" })).toBeVisible();

  const h = await login(browser, "hieu@hanamedia.local");
  await expect(h.getByRole("heading", { name: "Biểu đồ thống kê" })).toBeVisible();
  await expect(h.getByRole("img", { name: /^Thu chi theo tháng/ })).toHaveCount(0);
  await expect(h.getByRole("img", { name: /^Cơ hội theo giai đoạn/ })).toHaveCount(0);
  await expect(h.getByRole("img", { name: /^Video theo tuần/ })).toBeVisible();
  await h.goto("/bao-cao-ban-hang");
  await expect(h.getByText("Bạn chưa có quyền xem mục này")).toBeVisible();
});

test("Phòng ban chứa nhân viên: xem cơ cấu, thêm / đặt trưởng phòng / gỡ nhân viên (chỉ quản trị)", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/phong-ban");
  await expect(a.getByTestId("department-cards")).toContainText("Bộ phận Content");
  await a.getByRole("link", { name: /Bộ phận Content/ }).click();
  await expect(a.getByTestId("department-members")).toContainText("Hiếu");
  await expect(a.getByTestId("department-members")).not.toContainText("Hòa");
  await a.getByLabel("Nhân viên *").selectOption({ label: "Hòa — Editor" });
  await a.getByRole("button", { name: "Thêm vào phòng" }).click();
  await expect(a.getByTestId("department-members")).toContainText("Hòa");
  const row = a.getByTestId("department-members").locator("tr", { hasText: "Hòa" });
  await row.getByRole("button", { name: "Đặt làm trưởng phòng" }).click();
  await expect(a.getByText("Trưởng phòng: Hòa").first()).toBeVisible();
  await a.getByTestId("department-members").locator("tr", { hasText: "Hòa" }).getByRole("button", { name: "Gỡ khỏi phòng" }).click();
  await expect(a.getByTestId("department-members")).not.toContainText("Hòa");

  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/phong-ban");
  await expect(l.getByTestId("department-cards")).toContainText("Bộ phận Edit");
  await l.getByRole("link", { name: /Bộ phận Edit/ }).click();
  await expect(l.getByTestId("department-members")).toContainText("Duy");
  await expect(l.getByRole("button", { name: "Thêm vào phòng" })).toHaveCount(0);
});

test("Kanban cơ hội và lead: chuyển cột lưu lại; cột 'Thắng' tự động nên không chuyển tay", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/co-hoi");
  await l.getByText("Thêm cơ hội").click();
  await l.getByLabel("Tên cơ hội *").fill("Cơ hội Kanban E2E");
  await l.getByLabel("Khách hàng *").selectOption({ index: 1 });
  await l.getByRole("button", { name: "Thêm mới" }).click();
  await expect(l.getByRole("heading", { name: "Cơ hội Kanban E2E" })).toBeVisible();
  await l.goto("/co-hoi?view=kanban");
  const col = (v: string) => l.locator(`[data-column="${v}"]`);
  await expect(col("needs_analysis")).toContainText("Cơ hội Kanban E2E");
  await l.getByLabel("Chuyển Cơ hội Kanban E2E đến").selectOption({ label: "Trình bày giải pháp" });
  await expect(col("presentation")).toContainText("Cơ hội Kanban E2E");
  await l.reload();
  await expect(col("presentation")).toContainText("Cơ hội Kanban E2E");
  expect(await l.getByLabel("Chuyển Cơ hội Kanban E2E đến").locator("option", { hasText: "Thắng" }).evaluate((o) => (o as HTMLOptionElement).disabled)).toBe(true);

  await l.goto("/lead?view=kanban");
  await expect(l.locator('[data-column="new"]')).toContainText("Lan Phạm");
  await l.getByLabel(/Chuyển .*Lan Phạm.* đến/).selectOption({ label: "Đã liên hệ" });
  await expect(l.locator('[data-column="contacted"]')).toContainText("Lan Phạm");
  await l.goto("/lead?view=kanban");
  await expect(l.locator('[data-column="contacted"]')).toContainText("Lan Phạm");
});

test("Ghi chú & hoạt động trên bản ghi, tìm kiếm nhanh, xuất CSV danh sách", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/tai-khoan");
  await l.getByRole("link", { name: /Nông sản Xanh/ }).click();
  await l.getByLabel("Ghi chú mới").fill("Khách muốn thêm gói quản lý kênh E2E");
  await l.getByRole("button", { name: "Thêm ghi chú" }).click();
  await expect(l.getByTestId("timeline")).toContainText("Khách muốn thêm gói quản lý kênh E2E");
  await l.getByRole("button", { name: "Ghim" }).first().click();
  await expect(l.getByText("Đã ghim")).toBeVisible();

  await l.getByRole("searchbox", { name: "Tìm kiếm nhanh" }).fill("nông sản");
  await l.getByRole("searchbox", { name: "Tìm kiếm nhanh" }).press("Enter");
  await expect(l).toHaveURL(/\/tim-kiem\?q=/);
  await expect(l.getByTestId("search-results")).toContainText("Công ty TNHH Nông sản Xanh");
  await expect(l.getByTestId("search-results")).toContainText("DA0001");

  const csv = await l.request.get("/xuat/tai-khoan");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.startsWith("﻿")).toBe(true);
  expect(text).toContain("Tên công ty");
  expect(text).toContain("Công ty TNHH Nông sản Xanh");
  const filtered = await (await l.request.get("/xuat/tai-khoan?q=Mặt Trời")).text();
  expect(filtered).toContain("Du lịch Mặt Trời");
  expect(filtered).not.toContain("Nông sản Xanh");

  const h = await login(browser, "hieu@hanamedia.local");
  expect((await h.request.get("/xuat/tai-khoan")).status()).toBe(403);
});
