// Dự án → Mốc thanh toán → Ghi nhận thu → Kỳ tài chính → Chứng từ → quay lại Dự án (giao diện thật, nhiều vai trò).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
/** Số tiền đầu tiên (có ₫) trong chuỗi — bỏ qua số đếm trong phần mô tả. */
const num = (t: string | null) => Number(((t ?? "").match(/([\d.]+)\s*₫/)?.[1] ?? "0").replace(/\./g, ""));
const NAME = "Video quảng bá E2E nghiệm thu";

test.describe.configure({ mode: "serial" });

let projectId = "";
let before = { income: 0, expense: 0 };
let year = 0;
let month = 0;

test("quản lý tạo dự án, thêm đồng quản lý và ba mốc 30 / 40 / 30 triệu", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/du-an");
  await l.getByRole("button", { name: "Tạo dự án" }).or(l.getByRole("link", { name: "Tạo dự án" })).first().click();
  const form = l.locator("form").filter({ has: l.getByRole("button", { name: "Tạo dự án", exact: true }) });
  await form.getByLabel("Tên dự án *").fill(NAME);
  await form.getByLabel("Khách hàng", { exact: true }).selectOption({ index: 1 });
  await form.getByLabel("Giá trị hợp đồng (₫)").fill("100000000");
  await form.getByLabel("Ngân sách chi (₫)").fill("40000000");
  await form.getByLabel("Bắt đầu").fill("2026-11-01");
  await form.getByLabel("Kết thúc").fill("2027-01-31");
  await form.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(l).toHaveURL(/\/du-an\/[0-9a-f-]{36}/);
  projectId = l.url().match(/\/du-an\/([0-9a-f-]{36})/)![1]!;
  await expect(l.getByRole("heading", { name: new RegExp(NAME) })).toBeVisible();

  // hai quản lý, mỗi người đúng một lần
  await l.getByTestId("tab-con-nguoi").click();
  await l.getByText("Đổi người quản lý (nhiều người)").click();
  await l.getByLabel("Trưởng nhóm Bình").first().check();
  await l.getByRole("button", { name: "Lưu quản lý" }).click();
  await expect(l.getByTestId("project-people").locator("li")).toHaveCount(2);
  await expect(l.getByTestId("project-people")).toContainText("Trưởng nhóm Bình");

  // ba mốc: 30 / 40 / 30 triệu
  await l.getByTestId("tab-thanh-toan").click();
  await l.getByText("Thêm mốc thanh toán").click();
  for (const [name, amount, due] of [["Tạm ứng", "30000000", "2026-11-20"], ["Giữa kỳ", "40000000", "2026-12-20"], ["Bàn giao", "30000000", "2027-01-25"]] as const) {
    const f = l.locator("form").filter({ has: l.getByRole("button", { name: "Thêm mốc", exact: true }) });
    await f.getByLabel("Tên mốc *").fill(name);
    await f.getByLabel("Số tiền (₫) *").fill(amount);
    await f.getByLabel("Hạn thu").fill(due);
    await f.getByRole("button", { name: "Thêm mốc", exact: true }).click();
    await expect(l.getByTestId("project-milestones")).toContainText(name);
  }
  await expect(l.getByTestId("milestone-total")).toContainText("100.000.000");
  await expect(l.getByTestId("schedule-gap")).toHaveCount(0); // 30+40+30 = hợp đồng, không còn phần chưa phân bổ
  // quản lý dự án không có nút ghi nhận thu
  await expect(l.getByText("Ghi nhận thu —")).toHaveCount(0);
});

test("kế toán ghi nhận đợt 1: hiện kỳ đích trước khi lưu, đính kèm chứng từ, bấm đúp chỉ một khoản thu", async ({ browser }) => {
  const k = await login(browser, "ketoan@hanamedia.local");
  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth() + 1;
  await k.goto(`/thu-chi?tab=ky&nam=${year}&thang=${month}`);
  await expect(k.getByTestId("period-detail")).toBeVisible();
  before = { income: num(await k.getByTestId("pd-income").innerText()), expense: num(await k.getByTestId("pd-expense").innerText()) };

  await k.goto(`/du-an/${projectId}?tab=thanh-toan`);
  await k.getByText("Ghi nhận thu — Tạm ứng").click();
  const form = k.getByTestId("receipt-form").first();
  await expect(form.getByTestId("receipt-period")).toContainText("Khoản thu sẽ ghi vào Tháng");
  const voucher = join(tmpdir(), "phieu-thu-e2e.txt");
  writeFileSync(voucher, "Phiếu thu E2E");
  await form.getByLabel("Chứng từ (có thể chọn nhiều tệp)").setInputFiles(voucher);
  await form.getByRole("button", { name: /Ghi nhận đã thu/ }).dblclick(); // bấm đúp
  await expect(k.getByTestId("project-milestones").locator("tr", { hasText: "Tạm ứng" })).toContainText("Đã thanh toán");

  await k.goto(`/thu-chi?tab=thu&da=${projectId}&tu=2000-01-01&den=2999-12-31`);
  await expect(k.getByTestId("list-incomes").locator("tbody tr")).toHaveCount(1); // đúng một khoản
  await expect(k.getByTestId("sum-income")).toContainText("30.000.000");
  await expect(k.getByTestId("list-incomes")).toContainText("Thu theo mốc");
  await expect(k.getByTestId("list-incomes")).toContainText("1 chứng từ");
});

test("chi dựng phim 12 triệu: dự án hiện thu 30tr, chi 12tr, chênh lệch 18tr, còn 70tr theo lịch", async ({ browser }) => {
  const a = await login(browser, "admin@hanamedia.local");
  await a.goto("/thu-chi?tab=chi");
  await a.getByText("Đề nghị chi / ghi nhận chi phí").click();
  const f = a.locator("form").filter({ has: a.getByRole("button", { name: "Gửi duyệt", exact: true }) });
  await f.getByLabel("Số tiền (₫) *").fill("12000000");
  await f.getByLabel("Dự án", { exact: true }).selectOption({ value: projectId });
  await f.getByLabel("Nội dung", { exact: true }).fill("Dựng phim E2E");
  await f.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(a.getByTestId("list-expenses")).toContainText("Dựng phim E2E");
  await a.getByTestId("list-expenses").locator("tr", { hasText: "Dựng phim E2E" }).getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(a.getByTestId("list-expenses").locator("tr", { hasText: "Dựng phim E2E" })).toContainText("Đã duyệt");

  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/du-an/${projectId}?tab=tai-chinh`);
  await expect(l.getByTestId("m-income")).toContainText("30.000.000");
  await expect(l.getByTestId("m-expense")).toContainText("12.000.000");
  await expect(l.getByTestId("m-diff")).toContainText("18.000.000");
  await expect(l.getByTestId("m-open")).toContainText("70.000.000");
  await expect(l.getByTestId("budget-line")).toContainText("28.000.000"); // ngân sách chi 40tr − 12tr
  await l.getByTestId("tab-thanh-toan").click();
  await expect(l.getByText("Quá hạn thu").first()).toBeVisible();
});

test("kỳ tài chính cộng đúng; chứng từ có tệp; từ khoản thu quay lại dự án", async ({ browser }) => {
  const k = await login(browser, "ketoan@hanamedia.local");
  await k.goto(`/thu-chi?tab=ky&nam=${year}&thang=${month}`);
  expect(num(await k.getByTestId("pd-income").innerText())).toBe(before.income + 30_000_000);
  expect(num(await k.getByTestId("pd-expense").innerText())).toBe(before.expense + 12_000_000);
  // "Chênh lệch thu–chi" không phải lợi nhuận
  await expect(k.getByTestId("period-detail")).toContainText("Không phải lợi nhuận kế toán");
  // đối chiếu liệt kê, không tự tạo tiền
  await expect(k.getByTestId("reconcile")).toBeVisible();

  await k.goto("/thu-chi?tab=chung-tu&ct=has&loai-ct=income&tu=2000-01-01&den=2999-12-31");
  const row = k.getByTestId("voucher-row").filter({ hasText: "Tạm ứng" });
  await expect(row.getByRole("link", { name: "phieu-thu-e2e.txt" })).toBeVisible();
  const dl = k.waitForEvent("download");
  await row.getByRole("link", { name: "tải" }).click();
  expect((await dl).suggestedFilename()).toBe("phieu-thu-e2e.txt");

  // Khoản thu → dự án
  await k.goto(`/thu-chi?tab=thu&da=${projectId}&tu=2000-01-01&den=2999-12-31`);
  await k.getByTestId("list-incomes").getByRole("link", { name: /DA\d+ · / }).first().click();
  await expect(k).toHaveURL(new RegExp(`/du-an/${projectId}\\?tab=thanh-toan`));
  await expect(k.getByTestId("project-milestones")).toContainText("Đã thanh toán");

  // Xuất CSV đúng bộ lọc
  const csv = await k.request.get(`/thu-chi/xuat?type=incomes&da=${projectId}&tu=2000-01-01&den=2999-12-31`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("30000000");
});

test("quyền: quản lý dự án không ghi nhận được tiền; nhân viên không vào tổng quan / báo cáo / xuất", async ({ browser }) => {
  const t = await login(browser, "truongnhom@hanamedia.local");
  await t.goto(`/du-an/${projectId}?tab=thanh-toan`);
  await expect(t.getByTestId("project-milestones")).toContainText("Tạm ứng");
  await expect(t.getByText("Ghi nhận thu —")).toHaveCount(0);
  await expect(t.getByRole("button", { name: "Hủy khoản thu" })).toHaveCount(0);

  const d = await login(browser, "duy@hanamedia.local");
  await d.goto("/thu-chi?tab=bao-cao");
  await expect(d.getByTestId("finance-tabs")).not.toContainText("Báo cáo");
  const res = await d.request.get("/thu-chi/xuat?type=report");
  expect(res.status()).toBe(403);
  const inc = await d.request.get(`/thu-chi/xuat?type=incomes&da=${projectId}&tu=2000-01-01&den=2999-12-31`);
  expect((await inc.text()).includes("30000000")).toBe(false); // RLS: không thấy khoản thu → không xuất
});

test("danh sách dự án: quick view, giữ bộ lọc khi mở hồ sơ rồi quay lại, ba kiểu hiển thị", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/du-an?xem=mine&q=${encodeURIComponent("quảng bá E2E")}`);
  await expect(l.getByTestId("project-row")).toHaveCount(1);
  await l.getByRole("link", { name: /Xem nhanh Video quảng bá E2E/ }).click();
  await expect(l.getByTestId("quick-view")).toContainText("Mốc thu kế tiếp");
  await expect(l.getByTestId("quick-view")).toContainText("Giữa kỳ");
  await l.getByTestId("open-project").click();
  await expect(l).toHaveURL(/\/du-an\/[0-9a-f-]{36}/);
  await l.getByTestId("back-to-list").click();
  await expect(l).toHaveURL(/xem=mine/);
  await expect(l).toHaveURL(/q=/);
  await expect(l.getByTestId("project-row")).toHaveCount(1);
  // Kanban và Dòng thời gian
  await l.getByTestId("mode-kanban").click();
  await expect(l.getByTestId("kanban")).toContainText("Video quảng bá E2E");
  await l.getByTestId("mode-dong-thoi").click();
  await expect(l.getByTestId("timeline")).toContainText("Video quảng bá E2E");
  // chế độ "có mốc thu quá hạn": dự án mới có mốc hạn 20/11 đã thu → không quá hạn; mốc 20/12 chưa tới hạn (trừ khi chạy muộn)
  await l.goto("/du-an?xem=overdue_pay");
  await expect(l.getByTestId("quick-views")).toBeVisible();
});

test("điện thoại: Thu chi và Dự án không tràn ngang", async ({ browser }) => {
  const m = await login(browser, "ketoan@hanamedia.local", true);
  for (const url of ["/thu-chi", "/thu-chi?tab=phai-thu", "/thu-chi?tab=ky", "/du-an", `/du-an/${projectId}?tab=thanh-toan`]) {
    await m.goto(url);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${url} tràn ngang ${over}px`).toBeLessThanOrEqual(1);
  }
});
