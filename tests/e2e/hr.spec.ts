// Nhân sự: Phòng ban → Thành viên → Hồ sơ; Nhân viên → Tìm / Lọc → Chi tiết; chức vụ; liên hệ; tài liệu; quyền.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "MatKhau@123";

async function login(browser: Browser, email: string, mobile = false): Promise<Page> {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true } : { acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}
test("luồng Phòng ban → Thành viên → Hồ sơ → quay về phòng; thành viên hai chức vụ chỉ một dòng", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/phong-ban");
  await expect(a.getByTestId("dept-stats")).toContainText("Phòng ban");
  await a.getByTestId("dept-link").filter({ hasText: "Bộ phận Content" }).click();
  await expect(a.getByTestId("dept-overview")).toBeVisible();
  await a.getByTestId("dtab-thanh-vien").click();
  // Cho Hiếu giữ hai chức vụ trong cùng phòng
  const row = a.getByTestId("department-members").locator("tr[data-member]").filter({ hasText: "Hiếu" });
  await row.getByText("Sửa chức vụ").click();
  await row.getByLabel("Trưởng nhóm").check();
  await row.getByRole("button", { name: "Lưu chức vụ" }).click();
  await expect(a.getByTestId("department-members").locator("tr[data-member]").filter({ hasText: "Hiếu" })).toHaveCount(1);
  await expect(a.getByTestId("department-members").locator("tr[data-member]").filter({ hasText: "Hiếu" }).getByTestId("member-positions")).toContainText("Content");
  await expect(a.getByTestId("department-members").locator("tr[data-member]").filter({ hasText: "Hiếu" }).getByTestId("member-positions")).toContainText("Trưởng nhóm");
  // Tổng quan: số thành viên không đếm trùng
  await a.getByTestId("dtab-tong-quan").click();
  const memberRows = await a.getByTestId("dtab-thanh-vien").click().then(() => a.getByTestId("department-members").locator("tr[data-member]").count());
  await a.getByTestId("dtab-tong-quan").click();
  await expect(a.getByTestId("dept-overview")).toContainText(`Thành viên (mỗi người một lần)${memberRows}`);
  // Mở hồ sơ từ danh sách thành viên → đúng người, có đường quay về phòng
  await a.getByTestId("dtab-thanh-vien").click();
  await a.getByTestId("department-members").locator("tr[data-member]").filter({ hasText: "Hiếu" }).getByTestId("member-link").click();
  await expect(a.getByTestId("staff-profile")).toBeVisible();
  await expect(a.getByTestId("profile-name")).toHaveText("Hiếu");
  await expect(a.getByTestId("staff-compact")).toBeVisible(); // chế độ Chi tiết: danh sách thu gọn bên trái
  await a.getByTestId("ptab-cong-tac").click();
  await expect(a.getByTestId("assignments").locator("tr[data-dept]")).toHaveCount(1);
  await expect(a.getByTestId("assignments")).toContainText("Trưởng nhóm");
  await a.getByTestId("back-to-dept").click();
  await expect(a).toHaveURL(/\/phong-ban\/[0-9a-f-]{36}\?tab=thanh-vien/);
  await expect(a.getByTestId("department-members")).toContainText("Hiếu");
});

test("luồng Nhân viên → Tìm / Lọc / Sắp xếp / Phân trang → Chi tiết; giữ bộ lọc khi chuyển chế độ", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/nhan-su");
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(10);
  await expect(l.getByTestId("pager-range")).toHaveText("1–10 / 10");
  // tìm theo tên
  await l.getByLabel("Tìm theo tên hoặc mã nhân viên").fill("Duy");
  await l.getByRole("button", { name: "Lọc" }).click();
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(1);
  // tìm theo mã NV (mã tự sinh)
  await l.goto("/nhan-su?q=NV0005");
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(1);
  await expect(l.getByTestId("staff-table")).toContainText("Duy");
  // lọc phòng + chức vụ
  await l.goto("/nhan-su");
  await l.getByLabel("Lọc theo phòng ban").selectOption({ label: "Bộ phận Edit" });
  await l.getByLabel("Lọc theo chức vụ").selectOption({ label: "Editor" });
  await l.getByRole("button", { name: "Lọc" }).click();
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(3);
  await expect(l.getByTestId("pager-range")).toHaveText("1–3 / 3");
  // chuyển sang Chi tiết: giữ bộ lọc, chọn nhân viên đầu; bấm người khác mở hồ sơ tương ứng
  await l.getByTestId("mode-detail").click();
  await expect(l.getByTestId("staff-compact").locator("li[data-staff]")).toHaveCount(3);
  const name = await l.getByTestId("profile-name").textContent();
  const other = l.getByTestId("staff-compact").locator("li[data-staff]").filter({ hasNotText: name ?? "" }).first();
  const otherName = (await other.locator("span.truncate").first().textContent())!;
  await other.getByRole("link").click();
  await expect(l.getByTestId("profile-name")).toHaveText(otherName);
  await expect(l.getByTestId("staff-compact").locator("li[data-staff]")).toHaveCount(3); // bộ lọc còn nguyên
  await l.getByTestId("mode-list").click();
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(3);
  // sắp xếp theo mã giảm dần
  await l.goto("/nhan-su?sx=code&chieu=desc");
  const codes = await l.getByTestId("staff-table").locator("tr[data-staff] td:first-child").allTextContents();
  expect(codes).toEqual([...codes].sort().reverse());
  // thống kê chip mở danh sách đã lọc
  await l.goto("/nhan-su");
  await l.getByTestId("staff-summary").locator("summary").click();
  await l.getByTestId("summary-positions").getByRole("link", { name: /^Editor/ }).click();
  await expect(l.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(3);
  await l.goto("/nhan-su?q=khongcoai");
  await expect(l.getByText("Không có nhân viên phù hợp")).toBeVisible();
});

test("Chức vụ: số người đang giữ → danh sách đã lọc; người thường xem được nhưng không sửa", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/chuc-vu");
  const row = a.getByTestId("position-table").locator("tr[data-position]").filter({ hasText: "Editor" });
  await expect(row).toContainText("3");
  await row.getByTestId("position-staff-link").click();
  await expect(a).toHaveURL(/chuc-vu=/);
  await expect(a.getByTestId("staff-table").locator("tr[data-staff]")).toHaveCount(3);
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/chuc-vu");
  await expect(h.getByTestId("position-table")).toContainText("Editor");
  await expect(h.getByRole("link", { name: "Sửa" })).toHaveCount(0);
});

test("liên hệ: thêm email / điện thoại, đổi mục chính; người khác không thấy liên hệ riêng", async ({ browser }) => {
  const n = await login(browser, "nhansu@hanamedia.local");
  await n.goto("/nhan-su?q=Hiếu");
  await n.getByTestId("staff-link").first().click();
  await n.getByTestId("ptab-lien-he").click();
  const e1 = `hieu.rieng.${Date.now() % 100000}@gmail.example`;
  const e2 = `hieu.phu.${Date.now() % 100000}@gmail.example`;
  for (const [mail, primary] of [[e1, false], [e2, false]] as const) {
    await n.getByLabel("Email cá nhân *").fill(mail);
    if (primary) await n.getByLabel("Đặt làm email chính").first().check();
    await n.getByRole("button", { name: "Thêm email" }).click();
    await expect(n.getByTestId("email-list").locator(`li[data-email="${mail}"]`)).toHaveCount(1);
  }
  await expect(n.getByTestId("email-list").locator(`li[data-email="${e1}"]`)).toContainText("Chính"); // mục đầu tự là chính
  await n.getByTestId("email-list").locator(`li[data-email="${e2}"]`).getByRole("button", { name: "Đặt làm chính" }).click();
  await expect(n.getByTestId("email-list").locator(`li[data-email="${e2}"]`)).toContainText("Chính");
  await expect(n.getByTestId("email-list").getByText("Chính", { exact: true })).toHaveCount(1);
  // email trùng bị từ chối
  await n.getByLabel("Email cá nhân *").fill(e2);
  await n.getByRole("button", { name: "Thêm email" }).click();
  await expect(n.getByRole("alert").filter({ hasText: "đã được dùng" })).toBeVisible();
  // điện thoại
  await n.getByLabel("Số điện thoại *").fill("0912 345 678");
  await n.getByRole("button", { name: "Thêm số điện thoại" }).click();
  await expect(n.getByTestId("phone-list")).toContainText("0912345678");
  // người khác (Content khác) mở hồ sơ Hiếu: không có mục Liên hệ / Tài liệu
  const p = await login(browser, "phong@hanamedia.local");
  await p.goto("/nhan-su?q=Hiếu");
  await p.getByTestId("staff-link").first().click();
  await expect(p.getByTestId("profile-name")).toHaveText("Hiếu");
  await expect(p.getByTestId("ptab-lien-he")).toHaveCount(0);
  await expect(p.getByTestId("ptab-tai-lieu")).toHaveCount(0);
  await expect(p.getByTestId("ptab-luong")).toHaveCount(0);
  await expect(p.getByTestId("ptab-tai-khoan")).toHaveCount(0);
  await expect(p.getByText(e1)).toHaveCount(0);
  // chính chủ thấy
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/nhan-su?q=Hiếu");
  await h.getByTestId("staff-link").first().click();
  await h.getByTestId("ptab-lien-he").click();
  await expect(h.getByTestId("email-list")).toContainText(e2);
});

test("tài liệu: nhân sự tải lên, chính chủ tải về; người khác nhận 404 qua URL trực tiếp", async ({ browser }) => {
  const n = await login(browser, "nhansu@hanamedia.local");
  await n.goto("/nhan-su?q=Hiếu");
  await n.getByTestId("staff-link").first().click();
  await n.getByTestId("ptab-tai-lieu").click();
  const name = `hop-dong-${Date.now() % 100000}.txt`;
  await n.getByLabel("Chọn tệp").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("Nội dung hợp đồng thử nghiệm") });
  await n.getByRole("button", { name: "Tải lên" }).click();
  const row = n.getByTestId("document-list").locator("tr").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  const href = (await row.getByRole("link", { name: "Tải về" }).getAttribute("href"))!;
  const [dl] = await Promise.all([n.waitForEvent("download"), row.getByRole("link", { name: "Tải về" }).click()]);
  expect(dl.suggestedFilename()).toBe(name);
  // chính chủ tải được
  const h = await login(browser, "hieu@hanamedia.local");
  const own = await h.request.get(href);
  expect(own.status()).toBe(200);
  expect(await own.text()).toContain("hợp đồng thử nghiệm");
  // người khác, cộng tác viên: 404; chưa đăng nhập: chuyển về đăng nhập
  for (const who of ["phong@hanamedia.local", "leader@hanamedia.local", "ctv@hanamedia.local"]) {
    const o = await login(browser, who).catch(() => null);
    if (!o) continue;
    expect((await o.request.get(href)).status()).toBe(404);
  }
  const anon = await (await browser.newContext()).newPage();
  const r = await anon.request.get(href, { maxRedirects: 0 });
  expect([307, 308, 302, 401]).toContain(r.status());
  // Hiếu không tự tải lên được (không có ô tải)
  await h.goto("/nhan-su?q=Hiếu");
  await h.getByTestId("staff-link").first().click();
  await h.getByTestId("ptab-tai-lieu").click();
  await expect(h.getByRole("button", { name: "Tải lên" })).toHaveCount(0);
});

test("lương & tài khoản chỉ đúng người; xuất CSV theo bộ lọc không chứa dữ liệu riêng tư", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/nhan-su?xem=chi-tiet&q=Hiếu");
  await expect(a.getByTestId("ptab-tai-khoan")).toBeVisible();
  await a.getByTestId("ptab-luong").click();
  await expect(a.getByTestId("salary-info")).toBeVisible();
  await a.getByTestId("ptab-tai-khoan").click();
  await expect(a.getByText("Lưu vai trò")).toBeVisible();
  await expect(a.getByText("Đặt lại mật khẩu")).toBeVisible();
  const csv = await a.request.get("/nhan-su/xuat?q=Duy");
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("Mã NV");
  expect(body).toContain("Duy");
  expect(body).not.toContain("Hiếu");
  expect(body).not.toMatch(/lương|Lương|CCCD|mật khẩu|password|token/i);
  const depts = await a.request.get("/nhan-su/xuat?loai=phong-ban");
  expect(await depts.text()).toContain("Bộ phận Edit");
  // kế toán xem lương người khác được (payroll.view) nhưng không có tab Tài khoản
  const k = await login(browser, "ketoan@hanamedia.local");
  await k.goto("/nhan-su?xem=chi-tiet&q=Duy");
  await expect(k.getByTestId("ptab-luong")).toBeVisible();
  await expect(k.getByTestId("ptab-tai-khoan")).toHaveCount(0);
  await expect(k.getByTestId("ptab-tai-lieu")).toHaveCount(0);
  // cộng tác viên không vào được; xuất CSV bị chặn
  const c = await login(browser, "ctv@hanamedia.local");
  await c.goto("/nhan-su");
  await expect(c.getByText("Bạn chưa có quyền xem mục này")).toBeVisible();
  expect((await c.request.get("/nhan-su/xuat")).status()).toBe(403);
});

test("công việc trong hồ sơ: một task nhiều người giao chỉ một dòng ở phòng; quá hạn theo hạn của Công việc", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/cong-viec");
  await a.locator("summary").filter({ hasText: "Thêm công việc" }).click();
  const title = `Dựng teaser nhóm ${Date.now() % 100000}`;
  await a.getByLabel("Tiêu đề *").fill(title);
  await a.getByLabel("Thời hạn / giờ hẹn").fill("2026-01-05T10:00");
  for (const who of ["Duy", "Hòa"]) await a.getByLabel(who, { exact: true }).check();
  await a.getByRole("button", { name: "Thêm công việc" }).click();
  await expect(a.locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await a.goto("/phong-ban");
  await a.getByTestId("dept-link").filter({ hasText: "Bộ phận Edit" }).click();
  await a.getByTestId("dtab-cong-viec").click();
  const tr = a.getByTestId("dept-tasks").locator("tr[data-task]").filter({ hasText: title });
  await expect(tr).toHaveCount(1);
  await expect(tr).toContainText("Quá hạn");
  await a.goto("/nhan-su?xem=chi-tiet&q=Duy");
  await a.getByTestId("ptab-cong-viec").click();
  await expect(a.getByTestId("profile-tasks").locator("tr[data-task]").filter({ hasText: title })).toHaveCount(1);
  await expect(a.getByTestId("task-summary")).toContainText("quá hạn");
});

test("điện thoại: danh sách, chi tiết, phòng ban không tràn ngang", async ({ browser }) => {
  const p = await login(browser, "leader@hanamedia.local", true);
  const width = () => p.evaluate(() => document.documentElement.scrollWidth);
  for (const url of ["/nhan-su", "/nhan-su?xem=chi-tiet", "/phong-ban", "/chuc-vu"]) {
    await p.goto(url);
    await expect.poll(width).toBeLessThanOrEqual(390);
  }
});
