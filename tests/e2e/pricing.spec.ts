// Luồng 1: tìm dịch vụ → so sánh giá → ước tính → thêm vào cơ hội; thiếu giá → đề nghị → duyệt → hiệu lực (giao diện thật, nhiều vai trò).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { DB_URL } from "../db/helpers";

const PASSWORD = "MatKhau@123";
async function login(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}
const num = (t: string | null) => Number((t ?? "").replace(/\D/g, ""));
async function sql(q: string, p: unknown[] = []) {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, p)).rows; } finally { await c.end(); }
}

test.describe.configure({ mode: "serial" });
let stdBook = "";
let partnerBook = "";
let product = "";
let requestId = "";
let opp = "";
const OPP_NAME = "Cơ hội E2E ước tính giá";

test("lập bảng giá đối tác, sản phẩm DV001 và hai dòng giá 5.000.000 / 4.500.000", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/bang-gia?tao=1");
  const f = l.locator("form").filter({ has: l.getByRole("button", { name: "Tạo bảng giá" }) });
  await f.getByLabel("Tên bảng giá *").fill("Bảng giá đối tác E2E");
  await f.getByRole("button", { name: "Tạo bảng giá" }).click();
  await expect(l).toHaveURL(/\/bang-gia\/[0-9a-f-]{36}/);
  partnerBook = l.url().match(/bang-gia\/([0-9a-f-]{36})/)![1]!;

  await l.goto("/san-pham?tao=1");
  const pf = l.locator("form").filter({ has: l.getByRole("button", { name: "Tạo sản phẩm" }) });
  await pf.getByLabel("Tên *").fill("Dịch vụ DV001");
  await pf.getByLabel("Mã", { exact: true }).fill("DV001");
  await pf.getByLabel("Đơn vị tính").selectOption({ label: "Video" });
  await pf.getByLabel("Bảng giá mặc định").selectOption({ label: "Bảng giá chuẩn 2026" });
  await pf.getByRole("button", { name: "Tạo sản phẩm" }).click();
  await expect(l).toHaveURL(/\/san-pham\/[0-9a-f-]{36}/);
  product = l.url().match(/san-pham\/([0-9a-f-]{36})/)![1]!;
  stdBook = (await sql("select id from price_books where name = 'Bảng giá chuẩn 2026'"))[0].id;
  // cơ hội mở dùng bảng chuẩn (các bài khác có thể đã đóng cơ hội mẫu)
  opp = (await sql("insert into opportunities (org_id, name, account_id, price_book_id, stage) select org_id, $1, id, $2, 'needs_analysis' from accounts order by created_at limit 1 returning id", [OPP_NAME, stdBook]))[0].id;

  // Thiếu dòng giá: báo ngay trên hồ sơ
  await expect(l.getByTestId("price-issue")).toContainText("thiếu dòng giá");
  for (const [book, price] of [[stdBook, "5000000"], [partnerBook, "4500000"]] as const) {
    await l.goto(`/bang-gia/${book}`);
    await l.getByLabel("Thêm sản phẩm vào bảng giá").selectOption({ label: "Dịch vụ DV001 (DV001)" });
    await l.getByRole("button", { name: "Thêm dòng" }).click();
    await l.getByLabel("Đơn giá Dịch vụ DV001 (DV001)").fill(price);
    await expect(l.getByTestId("dirty-count")).toContainText("1");
    await l.getByTestId("save-prices").click();
    await expect(l.getByText(/Đã lưu 1 dòng giá/)).toBeVisible();
  }
  await l.goto(`/san-pham/${product}`);
  await expect(l.getByTestId("price-issue")).toHaveCount(0); // đã đủ dòng giá cho bảng mặc định
});

test("so sánh giá, ước tính 3 × 4.500.000 = 13.500.000 và thêm vào cơ hội (khác bảng giá → chọn cách xử lý)", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/san-pham/${product}?tab=bang-gia`);
  const row = l.getByTestId("price-compare").locator("tr", { hasText: "Bảng giá đối tác E2E" });
  await expect(row).toContainText("−500.000");
  await expect(row).toContainText("−10%");

  await l.goto(`/san-pham/${product}`);
  await l.getByLabel("Bảng giá", { exact: true }).selectOption({ label: "Bảng giá đối tác E2E" });
  await l.getByLabel(/Số lượng/).fill("3");
  await expect(l.getByTestId("est-subtotal")).toContainText("13.500.000");
  await expect(l.getByTestId("est-total")).toContainText("13.500.000");
  await l.getByTestId("add-to-opp").click();
  const oppValue = await l.locator("#est-opp option", { hasText: OPP_NAME }).getAttribute("value");
  await l.getByLabel("Chọn cơ hội").selectOption(oppValue!);
  await l.getByRole("button", { name: "Thêm vào cơ hội đã chọn" }).click();
  await expect(l.getByTestId("book-mismatch")).toContainText("Bảng giá chuẩn 2026");
  await l.getByLabel("Dùng giá bảng đã chọn cho riêng dòng này (giữ bảng giá của cơ hội)").check();
  await l.getByRole("button", { name: "Xác nhận thêm" }).click();
  await expect(l.getByText(/Đã thêm 3 × Dịch vụ DV001/)).toBeVisible();
  await l.getByTestId("open-opp").click();
  const line = l.locator("tr", { hasText: "Dịch vụ DV001" }).first();
  await expect(line).toContainText("4.500.000");
  await expect(line).toContainText("Video");
  await expect(line).toContainText("13.500.000");
});

test("đề nghị tăng giá: người lập không tự duyệt; +200.000 / +4%; trước hiệu lực giá cũ, sau hiệu lực giá mới", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/bang-gia/${stdBook}?tab=thong-tin`);
  await l.getByText("Bật quy trình phê duyệt giá").click();
  await l.getByRole("button", { name: "Bật phê duyệt" }).click();
  await l.goto(`/bang-gia/${stdBook}`);
  await expect(l.getByText("Cần phê duyệt").first()).toBeVisible();

  const t = await login(browser, "truongnhom@hanamedia.local");
  await t.goto(`/bang-gia/${stdBook}`);
  await t.getByLabel("Đơn giá Dịch vụ DV001").fill("5200000");
  const tomorrow = new Date(Date.now() + 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  await t.getByTestId("effective-date").fill(tomorrow);
  await t.getByTestId("change-reason").fill("Tăng giá theo thị trường");
  await t.getByTestId("save-prices").click(); // "Gửi đề nghị thay đổi (1 dòng)"
  await expect(t).toHaveURL(/\/bang-gia\/de-nghi\/[0-9a-f-]{36}/);
  requestId = t.url().match(/de-nghi\/([0-9a-f-]{36})/)![1]!;
  await expect(t.getByTestId("request-status")).toContainText("Chờ duyệt");
  await expect(t.getByTestId("line-diff")).toContainText("+200.000");
  await expect(t.getByTestId("line-diff-pct")).toContainText("+4%");
  await expect(t.getByRole("button", { name: /Duyệt đề nghị/ })).toHaveCount(0); // người lập không có nút duyệt

  await l.goto(`/bang-gia/de-nghi/${requestId}`);
  await l.getByRole("button", { name: /Duyệt đề nghị/ }).click();
  await expect(l.getByTestId("request-status")).toContainText("chờ hiệu lực");
  // trước ngày hiệu lực: giá chuẩn vẫn 5.000.000
  await l.goto(`/san-pham/${product}`);
  await l.getByLabel("Bảng giá", { exact: true }).selectOption({ label: "Bảng giá chuẩn 2026" });
  await expect(l.getByTestId("est-unit-price")).toContainText("5.000.000");

  // tới ngày hiệu lực
  await sql("update price_change_requests set effective_date = current_date where id = $1", [requestId]);
  await l.goto(`/san-pham/${product}`);
  await l.getByLabel("Bảng giá", { exact: true }).selectOption({ label: "Bảng giá chuẩn 2026" });
  await expect(l.getByTestId("est-unit-price")).toContainText("5.200.000");
  await l.goto(`/bang-gia/de-nghi/${requestId}`);
  await expect(l.getByTestId("request-status")).toContainText("Đang áp dụng");
  await expect(l.getByTestId("request-events")).toContainText("Có hiệu lực");
  // báo giá mới của cơ hội đã có dòng giá cũ → hiện chênh lệch để xác nhận, không tự đổi
  await l.goto(`/co-hoi/${opp}`);
  await expect(l.getByTestId("price-diff")).toBeVisible();
});

test("điều hành giá: sản phẩm thiếu giá đếm một lần; chọn bảng mặc định → bổ sung dòng giá → cảnh báo biến mất", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/san-pham?tao=1");
  const pf = l.locator("form").filter({ has: l.getByRole("button", { name: "Tạo sản phẩm" }) });
  await pf.getByLabel("Tên *").fill("Dịch vụ thiếu giá E2E");
  await pf.getByLabel("Đơn vị tính").selectOption({ label: "Video" });
  await pf.getByRole("button", { name: "Tạo sản phẩm" }).click();
  await expect(l).toHaveURL(/\/san-pham\/[0-9a-f-]{36}/);
  const id = l.url().match(/san-pham\/([0-9a-f-]{36})/)![1]!;

  await l.goto("/san-pham/dieu-hanh");
  const before = num(await l.getByTestId("ph-missing").innerText());
  await expect(l.locator(`li[data-product="${id}"]`)).toHaveCount(1);
  await expect(l.locator(`li[data-product="${id}"]`)).toContainText("Chưa chọn bảng giá mặc định");
  await l.locator(`li[data-product="${id}"]`).getByLabel("Bảng giá mặc định").selectOption({ label: "Bảng giá đối tác E2E" });
  await l.locator(`li[data-product="${id}"]`).getByRole("button", { name: "Chọn bảng mặc định" }).click();
  const row = l.locator(`li[data-product="${id}"]`);
  await expect(row).toContainText("Bảng mặc định thiếu dòng giá"); // vẫn một dòng lỗi, đổi loại lỗi
  await expect(l.getByTestId("ph-missing")).toContainText(String(before)); // đếm theo product_id duy nhất, không tăng
  await row.getByTestId("add-line-action").click();
  await expect(l).toHaveURL(/\/bang-gia\/[0-9a-f-]{36}\?them=/);
  await l.getByLabel("Đơn giá Dịch vụ thiếu giá E2E").fill("0"); // giá 0 là hợp lệ
  await l.getByTestId("save-prices").click();
  await expect(l.getByText(/Đã lưu 1 dòng giá/)).toBeVisible();
  await l.goto("/san-pham/dieu-hanh");
  await expect(l.locator(`li[data-product="${id}"]`)).toHaveCount(0);
  expect(num(await l.getByTestId("ph-missing").innerText())).toBe(before - 1);
});

test("phân quyền: kế toán chỉ xem; nhân viên không vào điều hành; ảnh sản phẩm lỗi giữ ảnh cũ", async ({ browser }) => {
  const k = await login(browser, "ketoan@hanamedia.local");
  await k.goto(`/bang-gia/${partnerBook}`);
  await expect(k.getByText(/chỉ có quyền xem bảng giá/)).toBeVisible();
  await expect(k.getByTestId("save-prices")).toHaveCount(0);
  await k.goto("/san-pham/dieu-hanh");
  await expect(k.getByText("Bạn chưa có quyền xem mục này")).toBeVisible();
  const d = await login(browser, "duy@hanamedia.local");
  await d.goto("/bang-gia");
  await expect(d.getByText("Bạn chưa có quyền xem mục này")).toBeVisible();

  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/san-pham/${product}?tab=tep`);
  const png = join(tmpdir(), "dv001.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  await l.getByLabel("Loại").selectOption("image");
  await l.getByLabel("Chọn tệp").setInputFiles(png);
  await l.getByRole("button", { name: "Tải lên" }).click();
  await expect(l.getByText("Đã cập nhật ảnh sản phẩm.")).toBeVisible();
  const imgBefore = await sql("select image_file_id from products where id = $1", [product]);
  expect(imgBefore[0].image_file_id).toBeTruthy();
  // tệp giả mạo (đuôi .png nhưng nội dung văn bản) bị từ chối, ảnh cũ giữ nguyên
  const fake = join(tmpdir(), "gia-mao.png");
  writeFileSync(fake, "đây không phải ảnh");
  await l.getByLabel("Loại").selectOption("image");
  await l.getByLabel("Chọn tệp").setInputFiles(fake);
  await l.getByRole("button", { name: "Tải lên" }).click();
  await expect(l.getByText(/Nội dung tệp không phải/)).toBeVisible();
  expect((await sql("select image_file_id from products where id = $1", [product]))[0].image_file_id).toBe(imgBefore[0].image_file_id);
  const res = await l.request.get(`/san-pham/tep/${imgBefore[0].image_file_id}?xem=1`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  // người ngoài CRM nhận 404 khi gọi trực tiếp
  const dres = await d.request.get(`/san-pham/tep/${imgBefore[0].image_file_id}?xem=1`);
  expect(dres.status()).toBe(404);
});

test("danh mục / đơn vị: số sản phẩm đang dùng mở đúng danh sách; không ngừng đơn vị đang dùng", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/don-vi");
  const row = l.getByTestId("list-unit").locator("tr", { hasText: "Video" }).first();
  await row.getByTestId("usage-link").click();
  await expect(l).toHaveURL(/\/san-pham\?donvi=/);
  await expect(l.getByTestId("list-product")).toContainText("Dịch vụ DV001");
  await l.goto("/don-vi");
  const r2 = l.getByTestId("list-unit").locator("tr", { hasText: "Video" }).first();
  await r2.getByText("Sửa").click();
  await r2.getByRole("checkbox").uncheck();
  await r2.getByRole("button", { name: "Lưu" }).click();
  await expect(r2.getByText(/sản phẩm đang bán dùng mục này/)).toBeVisible();
});
