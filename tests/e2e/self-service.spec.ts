// Hồ sơ tự phục vụ: Cài đặt → Hồ sơ của tôi, ảnh đại diện, tài liệu HR yêu cầu nộp (giao – nộp – yêu cầu nộp lại – duyệt), phạm vi truy cập.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "MatKhau@123";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const HIEU = "00000000-0000-4000-c000-000000000003";
const D_CONTENT = "00000000-0000-4000-b000-000000000002";

async function login(browser: Browser, email: string, mobile = false): Promise<Page> {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const page = await ctx.newPage();
  page.on("dialog", (d) => (d.type() === "prompt" ? d.accept("Thiếu chữ ký bên B") : d.accept()));
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}

test("Cài đặt → Hồ sơ của tôi: nhân viên thường xem hồ sơ của mình và tự sửa địa chỉ, email, điện thoại", async ({ browser }) => {
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/cai-dat");
  await expect(h.getByTestId("my-profile-card")).toBeVisible();
  await h.getByRole("link", { name: "Mở hồ sơ của tôi" }).click();
  await expect(h).toHaveURL(/\/cai-dat\/ho-so/);
  await expect(h.getByTestId("my-name")).toHaveText("Hiếu");
  await expect(h.getByTestId("my-code")).toHaveText("NV0003");
  const work = h.getByTestId("work-info");
  await expect(work).toContainText("hieu@hanamedia.local");
  await expect(work).toContainText("Bộ phận Content");
  await expect(work).toContainText("Content");
  await expect(work).toContainText("Chính thức");
  await expect(h.getByTestId("my-salary")).toBeVisible(); // lương của chính mình
  // sửa thông tin
  await h.getByText("Chỉnh sửa thông tin").click();
  await h.getByLabel("Địa chỉ").fill("12 Lê Lợi, Quận 1");
  await h.getByRole("button", { name: "Lưu địa chỉ" }).click();
  await expect(h.getByText("Đã lưu thông tin.")).toBeVisible();
  const mail = `hieu.tu.sua.${Date.now() % 100000}@gmail.example`;
  await h.getByTestId("add-email").getByLabel("Email cá nhân").fill(mail);
  await h.getByTestId("add-email").getByLabel("Đặt làm email chính").check();
  await h.getByRole("button", { name: "Thêm email" }).click();
  await expect(h.getByTestId("my-emails").locator(`li[data-email="${mail}"]`)).toContainText("Chính");
  await h.getByTestId("add-phone").getByLabel("Số điện thoại").fill("0912 345 678");
  await h.getByRole("button", { name: "Thêm số điện thoại" }).click();
  await expect(h.getByTestId("my-phones")).toContainText("0912345678");
  await h.reload();
  await expect(h.getByTestId("personal-info")).toContainText("12 Lê Lợi, Quận 1");
  await expect(h.getByTestId("personal-info")).toContainText(mail);
  // email trùng bị từ chối với thông báo rõ
  await h.getByText("Chỉnh sửa thông tin").click();
  await h.getByTestId("add-email").getByLabel("Email cá nhân").fill(mail);
  await h.getByRole("button", { name: "Thêm email" }).click();
  await expect(h.getByRole("alert").filter({ hasText: "đã được dùng" })).toBeVisible();
  // các trường HR quản lý không có ô sửa
  await expect(h.getByLabel("Mã nhân viên")).toHaveCount(0);
  // đổi mật khẩu vẫn ở Cài đặt
  await h.getByRole("link", { name: "Cài đặt → Đổi mật khẩu" }).click();
  await expect(h.getByRole("button", { name: "Đổi mật khẩu" })).toBeVisible();
  // đổi ID trên URL không mở hồ sơ người khác
  await h.goto(`/cai-dat/ho-so?id=00000000-0000-4000-c000-000000000004`);
  await expect(h.getByTestId("my-name")).toHaveText("Hiếu");
});

test("ảnh đại diện: xem trước, lưu, hiện ở mọi nơi; tệp sai / quá lớn bị từ chối và vẫn giữ ảnh cũ; gỡ ảnh về chữ cái đầu", async ({ browser }) => {
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/cai-dat/ho-so");
  const up = h.getByTestId("avatar-uploader");
  await expect(up.locator('[data-avatar="initials"]')).toBeVisible(); // chưa có ảnh: chữ cái đầu
  // tệp sai loại / quá lớn bị chặn ngay ở giao diện
  await up.getByLabel("Chọn ảnh đại diện").setInputFiles({ name: "a.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(up.getByRole("alert")).toContainText("JPEG, PNG hoặc WebP");
  await up.getByLabel("Chọn ảnh đại diện").setInputFiles({ name: "lon.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]) });
  await expect(up.getByRole("alert")).toContainText("2 MB");
  // ảnh hợp lệ: xem trước rồi lưu
  await up.getByLabel("Chọn ảnh đại diện").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(up.getByTestId("avatar-preview")).toBeVisible();
  await up.getByRole("button", { name: "Lưu ảnh" }).click();
  await expect(up.getByText("Đã cập nhật ảnh đại diện.")).toBeVisible();
  await expect(up.locator('[data-avatar="image"]')).toBeVisible();
  const src = (await up.locator('[data-avatar="image"] img').getAttribute("src"))!;
  expect(src).toMatch(new RegExp(`^/anh-dai-dien/${HIEU}\\?v=\\d+$`));
  const img = await h.request.get(src);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  // thẻ tài khoản cuối sidebar, danh sách nhân viên, chi tiết phòng ban đều hiện ảnh
  await expect(h.getByTestId("sidebar-profile").locator('[data-avatar="image"]:visible')).toBeVisible();
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/nhan-su?q=Hiếu");
  await expect(l.locator('tr[data-staff] [data-avatar="image"]')).toHaveCount(1);
  await l.goto("/nhan-su?xem=chi-tiet&q=Hiếu");
  await expect(l.getByTestId("staff-profile").locator('[data-avatar="image"]')).toBeVisible();
  await l.goto(`/phong-ban/${D_CONTENT}?tab=thanh-vien`);
  await expect(l.locator('tr[data-member] [data-avatar="image"]')).toHaveCount(1);
  // tải thất bại (nội dung không phải ảnh dù tên .png) → báo lỗi, ảnh hiện tại vẫn được giữ
  await h.goto("/cai-dat/ho-so");
  await h.getByTestId("avatar-uploader").getByLabel("Chọn ảnh đại diện").setInputFiles({ name: "gia.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await h.getByTestId("avatar-uploader").getByRole("button", { name: "Lưu ảnh" }).click();
  await expect(h.getByTestId("avatar-uploader").getByRole("alert")).toContainText("hợp lệ");
  await h.reload();
  await expect(h.getByTestId("avatar-uploader").locator('[data-avatar="image"]')).toBeVisible();
  expect((await h.request.get(src)).status()).toBe(200);
  // người khác không đổi được ảnh của Hiếu; cộng tác viên không xem ảnh nhân viên
  const c = await login(browser, "ctv@hanamedia.local");
  expect((await c.request.get(`/anh-dai-dien/${HIEU}`)).status()).toBe(404);
  // gỡ ảnh
  await h.getByRole("button", { name: "Gỡ ảnh" }).click();
  await expect(h.getByTestId("avatar-uploader").locator('[data-avatar="initials"]')).toBeVisible();
  expect((await h.request.get(src)).status()).toBe(404);
  await expect(h.getByTestId("sidebar-profile").locator('[data-avatar="initials"]:visible')).toBeVisible();
});

test("tài liệu HR yêu cầu: giao theo phòng → nộp → yêu cầu nộp lại kèm lý do → nộp bản mới → duyệt; hoàn thành theo tài liệu bắt buộc", async ({ browser }) => {
  test.setTimeout(150_000);
  const hr = await login(browser, "nhansu@hanamedia.local");
  const h = await login(browser, "hieu@hanamedia.local");
  await hr.goto("/nhan-su/giay-to");
  await expect(hr.getByTestId("doc-summary")).toBeVisible();
  // 1) HR giao "Hợp đồng lao động đã ký" (bắt buộc, chỉ PDF) cho cả phòng Content
  await hr.getByText("Giao yêu cầu tài liệu").click();
  const bulk = hr.getByTestId("assign-bulk");
  await bulk.getByLabel("Loại tài liệu *").selectOption({ label: "Hợp đồng lao động đã ký (bắt buộc)" });
  await bulk.getByLabel("Cả phòng ban").selectOption({ label: "Bộ phận Content" });
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await bulk.getByLabel("Hạn nộp").fill(due);
  await bulk.getByLabel("Ghi chú hướng dẫn").fill("Ký đủ hai bên rồi quét PDF");
  await bulk.getByRole("button", { name: "Giao yêu cầu" }).click();
  await expect(bulk.getByText("Đã giao yêu cầu.")).toBeVisible();
  // 2) Hiếu thấy thông báo và yêu cầu trong Hồ sơ của tôi
  await h.goto("/thong-bao");
  await expect(h.getByTestId("notifications")).toContainText("Hợp đồng lao động đã ký");
  await h.goto("/cai-dat/ho-so");
  const row = h.locator('li[data-request]').filter({ hasText: "Hợp đồng lao động đã ký" });
  await expect(row).toHaveAttribute("data-status", "pending");
  await expect(row).toContainText("Bắt buộc");
  await expect(row).toContainText("Chưa nộp");
  await expect(row).toContainText("Hạn nộp");
  await expect(row).toContainText("Ký đủ hai bên rồi quét PDF");
  // 3) nộp sai định dạng / giả PDF bị từ chối, trạng thái không đổi
  await row.getByLabel("Chọn tệp").setInputFiles({ name: "hd.png", mimeType: "image/png", buffer: PNG });
  await row.getByRole("button", { name: "Nộp tài liệu" }).click();
  await expect(row.getByRole("alert")).toContainText("Chỉ nhận định dạng");
  await row.getByLabel("Chọn tệp").setInputFiles({ name: "hd.pdf", mimeType: "application/pdf", buffer: Buffer.from("không phải pdf") });
  await row.getByRole("button", { name: "Nộp tài liệu" }).click();
  await expect(row.getByRole("alert")).toContainText("không phải .pdf hợp lệ");
  await expect(row).toHaveAttribute("data-status", "pending");
  // 4) nộp hợp lệ → Chờ duyệt
  await row.getByLabel("Chọn tệp").setInputFiles({ name: "hd-hieu.pdf", mimeType: "application/pdf", buffer: PDF });
  await row.getByRole("button", { name: "Nộp tài liệu" }).click();
  await expect(row).toHaveAttribute("data-status", "submitted");
  await expect(row.getByTestId("req-status")).toContainText("Chờ duyệt");
  await expect(row).toContainText("hd-hieu.pdf");
  // 5) HR được thông báo, mở hồ sơ → yêu cầu nộp lại kèm lý do
  await hr.goto("/thong-bao");
  await expect(hr.getByTestId("notifications")).toContainText("Hiếu đã nộp tài liệu: Hợp đồng lao động đã ký");
  await hr.goto(`/nhan-su?xem=chi-tiet&id=${HIEU}&muc=tai-lieu`);
  const hrRow = hr.locator("li[data-request]").filter({ hasText: "Hợp đồng lao động đã ký" });
  await expect(hrRow).toHaveAttribute("data-status", "submitted");
  const [dl] = await Promise.all([hr.waitForEvent("download"), hrRow.getByRole("link", { name: "Xem / tải" }).click()]);
  expect(dl.suggestedFilename()).toBe("hd-hieu.pdf");
  await hrRow.getByRole("button", { name: "Yêu cầu nộp lại…" }).click();
  await expect(hrRow).toHaveAttribute("data-status", "rejected");
  // 6) Hiếu thấy lý do ngay dưới tài liệu, nộp bản thay thế → Chờ duyệt, lý do biến mất
  await h.reload();
  await expect(row).toHaveAttribute("data-status", "rejected");
  await expect(row.getByTestId("reject-reason")).toContainText("Thiếu chữ ký bên B");
  await expect(row.getByTestId("req-status")).toContainText("Cần nộp lại");
  await h.goto("/thong-bao");
  await expect(h.getByTestId("notifications")).toContainText("Cần nộp lại tài liệu");
  await h.goto("/cai-dat/ho-so");
  await row.getByLabel("Chọn tệp").setInputFiles({ name: "hd-hieu-v2.pdf", mimeType: "application/pdf", buffer: PDF });
  await row.getByRole("button", { name: "Nộp bản thay thế" }).click();
  await expect(row).toHaveAttribute("data-status", "submitted");
  await expect(row.getByTestId("reject-reason")).toHaveCount(0);
  await expect(row).toContainText("hd-hieu-v2.pdf");
  // 7) HR duyệt bản mới; Hiếu không còn nộp / thay được
  await hr.reload();
  await hrRow.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(hrRow).toHaveAttribute("data-status", "approved");
  await expect(hrRow).toContainText("Đã duyệt bởi");
  await h.reload();
  await expect(row).toHaveAttribute("data-status", "approved");
  await expect(row.getByLabel("Chọn tệp")).toHaveCount(0);
  // 8) tình trạng: Hiếu đủ giấy tờ (1/1), các thành viên khác trong phòng chưa đủ; lọc theo phòng + tình trạng
  await hr.goto(`/nhan-su/giay-to?phong=${D_CONTENT}&tinh-trang=complete`);
  await expect(hr.getByTestId("doc-status-table").locator("tr[data-staff]")).toHaveCount(1);
  await expect(hr.getByTestId("doc-status-table")).toContainText("Hiếu");
  await expect(hr.getByTestId("doc-status-table")).toContainText("1/1");
  await hr.goto(`/nhan-su/giay-to?phong=${D_CONTENT}&tinh-trang=incomplete`);
  await expect(hr.getByTestId("doc-status-table").locator("tr[data-staff]")).toHaveCount(2);
  await expect(hr.getByTestId("doc-status-table")).not.toContainText("Hiếu");
});

test("phạm vi truy cập: người khác không xem / sửa / tải / nộp thay hồ sơ của nhân viên", async ({ browser }) => {
  test.setTimeout(120_000);
  const hr = await login(browser, "nhansu@hanamedia.local");
  const h = await login(browser, "hieu@hanamedia.local");
  // chuẩn bị: HR giao + Hiếu nộp một tài liệu
  await hr.goto(`/nhan-su?xem=chi-tiet&id=${HIEU}&muc=tai-lieu`);
  await hr.getByTestId("assign-one").locator("summary").click();
  await hr.getByTestId("assign-one").getByLabel("Loại tài liệu *").selectOption({ label: "Bằng cấp / chứng chỉ" });
  await hr.getByTestId("assign-one").getByRole("button", { name: "Giao yêu cầu" }).click();
  await expect(hr.getByText("Đã giao yêu cầu.")).toBeVisible();
  await h.goto("/cai-dat/ho-so");
  const row = h.locator("li[data-request]").filter({ hasText: "Bằng cấp / chứng chỉ" });
  await expect(row).toContainText("Tùy chọn");
  await row.getByLabel("Chọn tệp").setInputFiles({ name: "bang.pdf", mimeType: "application/pdf", buffer: PDF });
  await row.getByRole("button", { name: "Nộp tài liệu" }).click();
  await expect(row).toHaveAttribute("data-status", "submitted");
  await hr.reload();
  const href = (await hr.locator("li[data-request]").filter({ hasText: "Bằng cấp" }).getByRole("link", { name: "Xem / tải" }).getAttribute("href"))!;
  expect((await h.request.get(href)).status()).toBe(200); // chính chủ tải được
  // Phong (cùng phòng) và Leader / CTV: không tải được tệp, không thấy mục riêng tư, không vào trang quản lý HR
  for (const who of ["phong@hanamedia.local", "leader@hanamedia.local", "ctv@hanamedia.local"]) {
    const o = await login(browser, who);
    expect((await o.request.get(href)).status()).toBe(404);
    await o.goto(`/nhan-su?xem=chi-tiet&id=${HIEU}&muc=tai-lieu`);
    if (!who.startsWith("ctv")) {
      await expect(o.getByTestId("ptab-tai-lieu")).toHaveCount(0);
      await expect(o.getByTestId("ptab-lien-he")).toHaveCount(0);
      await expect(o.getByTestId("requests-card")).toHaveCount(0);
    }
    await o.goto("/nhan-su/giay-to");
    await expect(o.getByText("Bạn chưa có quyền xem mục này")).toBeVisible();
    // trang tự phục vụ luôn là hồ sơ của chính họ, dù đổi ID
    if (!who.startsWith("ctv")) {
      await o.goto(`/cai-dat/ho-so?id=${HIEU}&user=${HIEU}`);
      await expect(o.getByTestId("my-name")).not.toHaveText("Hiếu");
      await expect(o.locator("li[data-request]").filter({ hasText: "Bằng cấp" })).toHaveCount(0); // yêu cầu này chỉ giao cho Hiếu
    }
  }
  // chưa đăng nhập
  const anon = await (await browser.newContext()).newPage();
  const r = await anon.request.get(href, { maxRedirects: 0 });
  expect([302, 307, 308, 401]).toContain(r.status());
});

test("điện thoại: Hồ sơ của tôi và Giấy tờ nhân viên không tràn ngang", async ({ browser }) => {
  const h = await login(browser, "hieu@hanamedia.local", true);
  const width = () => h.evaluate(() => document.documentElement.scrollWidth);
  await h.goto("/cai-dat/ho-so");
  await expect.poll(width).toBeLessThanOrEqual(390);
  const hr = await login(browser, "nhansu@hanamedia.local", true);
  const w2 = () => hr.evaluate(() => document.documentElement.scrollWidth);
  await hr.goto("/nhan-su/giay-to");
  await expect.poll(w2).toBeLessThanOrEqual(390);
});
