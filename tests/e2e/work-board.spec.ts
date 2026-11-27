// Bảng công việc theo quy trình video: 4 tab, kéo thả, thẻ video không bỏ qua duyệt, lịch, việc của tôi, kịch bản BelAZ, phân quyền.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { newClient, ORG, U } from "../db/helpers";

const PASSWORD = "MatKhau@123";

async function login(browser: Browser, email: string, mobile = false): Promise<Page> {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}

const stage = (p: Page) => p.locator("header [data-stage]").first();
const col = (p: Page, id: string) => p.locator(`[data-column="${id}"]`);
const TODO = "not_started", DOING = "in_progress", DONE = "completed";
/** Thẻ đầu việc video theo mã (loại: nội dung / dựng). */
const editCard = (p: Page, code: string) => p.locator("[data-card]").filter({ hasText: code }).filter({ hasText: /Dựng bản nháp|Sửa bản dựng|Duyệt bản dựng/ });

function fridayOfThisWeek(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 4);
  return d.toISOString().slice(0, 10);
}

test("bốn tab, ba cột; thêm nhanh, kéo thả, đổi trạng thái bằng menu, tải lại vẫn đúng và không trùng thẻ", async ({ browser }) => {
  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/cong-viec");
  for (const t of ["Danh sách chờ", "Bảng công việc", "Lịch sản xuất", "Việc của tôi"]) await expect(p.getByRole("link", { name: new RegExp(`^${t}`) })).toBeVisible();
  await expect(p.getByRole("link", { name: /^Bảng công việc/ })).toHaveAttribute("aria-current", "page");
  for (const [id, name] of [[TODO, "Việc cần làm"], [DOING, "Đang tiến hành"], [DONE, "Xong"]]) await expect(col(p, id!).getByRole("heading", { name: new RegExp(name!) })).toBeVisible();

  const title = `Gọi khách BelAZ ${Date.now() % 100000}`;
  await p.getByRole("button", { name: 'Thêm việc vào "Việc cần làm"' }).click();
  await p.getByLabel('Tên công việc mới trong "Việc cần làm"').fill(title);
  await p.getByRole("button", { name: "Thêm", exact: true }).click();
  const card = p.locator("[data-card]").filter({ hasText: title });
  await expect(col(p, TODO).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await expect(p.getByLabel('Tên công việc mới trong "Việc cần làm"')).toHaveCount(0); // biểu mẫu đã đóng, bố cục ổn định

  // kéo thả (desktop): chờ dữ liệu từ máy chủ ổn định rồi mới kéo
  await p.waitForLoadState("networkidle");
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await card.dragTo(col(p, DOING).locator("header"), { sourcePosition: { x: 8, y: 8 } });
  await expect(col(p, DOING).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await p.reload();
  await expect(col(p, DOING).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await expect(p.locator("[data-card]").filter({ hasText: title })).toHaveCount(1);

  // menu "Chuyển đến" (dùng được trên điện thoại / bàn phím)
  await p.getByLabel(`Chuyển ${title} đến`).selectOption(DONE);
  await expect(col(p, DONE).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await p.reload();
  await expect(col(p, DONE).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await expect(p.getByTestId("count-completed")).not.toHaveText("0");
});

test("lỗi khi chuyển cột: thẻ trở về chỗ cũ kèm thông báo rõ", async ({ browser }) => {
  const a = await login(browser, "leader@hanamedia.local");
  await a.goto("/cong-viec");
  const title = `Việc sẽ bị xóa ${Date.now() % 100000}`;
  await a.getByRole("button", { name: 'Thêm việc vào "Việc cần làm"' }).click();
  await a.getByLabel('Tên công việc mới trong "Việc cần làm"').fill(title);
  await a.getByRole("button", { name: "Thêm", exact: true }).click();
  await expect(col(a, TODO).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  // phiên khác xóa việc này trong khi bảng của phiên a còn cũ
  const b = await login(browser, "leader@hanamedia.local");
  await b.goto("/cong-viec?tab=cho");
  await b.getByTestId("list-tasks").locator("tr").filter({ hasText: title }).getByRole("button", { name: "Xóa" }).click();
  await expect(b.getByTestId("list-tasks").locator("tr").filter({ hasText: title })).toHaveCount(0);
  await a.getByLabel(`Chuyển ${title} đến`).selectOption(DOING);
  await expect(a.getByTestId("board-error")).toBeVisible();
  await expect(col(a, TODO).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  await expect(col(a, DOING).locator("[data-card]").filter({ hasText: title })).toHaveCount(0);
});

test("thẻ video: kéo không bỏ qua bàn giao / nộp duyệt / duyệt — mở đúng thao tác hoặc báo lý do", async ({ browser }) => {
  test.setTimeout(120_000);
  const leader = await login(browser, "leader@hanamedia.local");
  await leader.goto("/cong-viec?q=D0010");
  const review = editCard(leader, "D0010");
  await expect(review).toHaveCount(1);
  await expect(col(leader, DOING)).toContainText("Chờ Leader duyệt"); // chờ duyệt vẫn ở "Đang tiến hành"
  await expect(review).toContainText("Duyệt bản dựng");
  await review.dragTo(col(leader, DONE).locator("header"), { sourcePosition: { x: 8, y: 8 } }); // Leader có quyền duyệt → mở bước duyệt, KHÔNG tự chuyển Xong
  await expect(leader).toHaveURL(/\/video\/[0-9a-f-]{36}#panel-review/);
  await expect(stage(leader)).toHaveText("Chờ duyệt");

  // Editor đang dựng D0002: kéo sang Xong → mở bước dựng (nộp duyệt), video vẫn "Đang dựng"
  const duy = await login(browser, "duy@hanamedia.local");
  await duy.goto("/cong-viec?q=D0002");
  await editCard(duy, "D0002").getByLabel(/Chuyển .* đến/).selectOption(DONE);
  await expect(duy).toHaveURL(/\/video\/[0-9a-f-]{36}#panel-edit/);
  await expect(stage(duy)).toHaveText("Đang dựng");

  // Editor D0010 (Duy) không có quyền duyệt → báo lý do, thẻ không đổi cột
  await duy.goto("/cong-viec?q=D0010");
  await editCard(duy, "D0010").getByLabel(/Chuyển .* đến/).selectOption(DONE);
  await expect(duy.getByTestId("board-error")).toContainText("Leader");
  await expect(col(duy, DOING).locator("[data-card]").filter({ hasText: "D0010" })).toHaveCount(1);
  // việc đã Xong không kéo lùi
  await leader.goto("/cong-viec?q=D0012");
  await leader.locator("[data-card]").filter({ hasText: "D0012" }).first().getByLabel(/Chuyển .* đến/).selectOption(DOING);
  await expect(leader.getByTestId("board-error")).toBeVisible();
});

test("kịch bản BelAZ: giao dựng thứ Sáu → Việc của tôi + lịch → 65% → nộp duyệt → sửa cảnh 167 → duyệt → Xong / Chờ đăng", async ({ browser }) => {
  test.setTimeout(180_000);
  const friday = fridayOfThisWeek();
  const leader = await login(browser, "leader@hanamedia.local");
  const duy = await login(browser, "duy@hanamedia.local");

  // 1) Leader đặt hạn thứ Sáu cho việc dựng D0002 trong ngăn chi tiết
  await leader.goto("/cong-viec?q=D0002");
  await editCard(leader, "D0002").getByTestId("card-title").click();
  const drawer = leader.getByTestId("task-drawer");
  await expect(drawer).toContainText("D0002");
  await drawer.getByLabel("Hạn hoàn thành").fill(`${friday}T17:00`);
  await drawer.getByRole("button", { name: "Lưu lịch" }).click();
  await expect(drawer.getByText("Đã lưu lịch.")).toBeVisible();

  // 2) Editor thấy ở "Việc của tôi → Cần tôi xử lý" và trên lịch đúng thứ Sáu
  await duy.goto("/cong-viec?tab=toi");
  await expect(duy.getByTestId("my-act").locator("[data-card]").filter({ hasText: "D0002" })).toContainText("Dựng video");
  await expect(duy.getByTestId("my-assigned").locator("[data-card]").filter({ hasText: "D0002" })).toHaveCount(1);
  await duy.goto(`/cong-viec?tab=lich&lich=tuan&ngay=${friday}`);
  const item = duy.locator("[data-cal-item]").filter({ hasText: "D0002" });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute("data-milestone", "1");
  expect(await item.locator("xpath=..").evaluate((el) => (el as HTMLElement).style.gridColumn)).toBe("5 / span 1");

  // 3) Editor cập nhật 65% → Leader thấy 65% trên thẻ; thẻ vẫn "Đang tiến hành"
  await duy.goto("/video");
  await duy.getByTestId("video-row").filter({ hasText: "D0002" }).getByRole("link", { name: "D0002" }).click();
  await expect(duy).toHaveURL(/\/video\/[0-9a-f-]{36}/);
  const videoUrl = duy.url();
  await duy.getByLabel("Tiến độ (%)").fill("65");
  await duy.getByLabel("Link bản dựng").fill("https://drive.google.com/file/d/belaz-v1");
  await duy.getByRole("button", { name: "Cập nhật tiến độ" }).click();
  await leader.goto("/cong-viec?q=D0002");
  await expect(col(leader, DOING).locator("[data-card]").filter({ hasText: "D0002" }).filter({ hasText: "65%" })).toContainText("Editor đang dựng");

  // 4) Nộp duyệt → "Chờ Leader duyệt", vẫn ở "Đang tiến hành"
  await duy.getByRole("button", { name: "Nộp duyệt" }).click();
  await expect(stage(duy)).toHaveText("Chờ duyệt");
  await leader.reload();
  const pending = col(leader, DOING).locator("[data-card]").filter({ hasText: "D0002" });
  await expect(pending).toContainText("Chờ Leader duyệt");
  await expect(pending).toContainText("Duyệt bản dựng");
  await expect(pending.getByRole("link", { name: "Mở bản dựng" })).toHaveAttribute("href", /belaz-v1/);
  await leader.goto("/cong-viec?tab=toi");
  await expect(leader.getByTestId("my-act").locator("[data-card]").filter({ hasText: "D0002" })).toContainText("Duyệt bản dựng");

  // 5) Leader yêu cầu sửa "Sửa cảnh 167" → Editor thấy ghi chú + lần sửa trên thẻ
  await leader.goto(videoUrl);
  await leader.getByRole("button", { name: "Yêu cầu sửa…" }).click();
  await leader.getByLabel("Cần sửa gì? (bắt buộc)").fill("Sửa cảnh 167");
  await leader.getByRole("button", { name: "Gửi yêu cầu sửa" }).click();
  await expect(stage(leader)).toHaveText("Đang dựng");
  await duy.goto("/cong-viec?q=D0002");
  const revise = col(duy, DOING).locator("[data-card]").filter({ hasText: "D0002" });
  await expect(revise).toContainText("Sửa bản dựng");
  await expect(revise).toContainText("Lần 1");
  await expect(revise).toContainText("Sửa cảnh 167");

  // 6) Nộp lại + duyệt → thẻ sang "Xong", video "Chờ đăng" (chưa "Đã đăng")
  await duy.goto(videoUrl);
  await duy.getByRole("button", { name: "Nộp duyệt" }).click();
  await expect(stage(duy)).toHaveText("Chờ duyệt");
  await leader.reload();
  await leader.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(stage(leader)).toHaveText("Chờ đăng");
  await leader.goto("/cong-viec?q=D0002");
  await expect(col(leader, DONE).locator("[data-card]").filter({ hasText: "D0002" })).toHaveCount(2); // việc Content + việc dựng
  await expect(col(leader, DOING).locator("[data-card]").filter({ hasText: "D0002" })).toHaveCount(0);
  await expect(editCard(leader, "D0002")).toContainText("Chờ đăng kênh");
  await leader.goto(videoUrl);
  await expect(stage(leader)).toHaveText("Chờ đăng"); // "Đã đăng" chỉ qua xác nhận đăng
});

test("tìm kiếm và bộ lọc: theo tên/mã video, người phụ trách, quá hạn, chờ duyệt, cần bổ sung", async ({ browser }) => {
  const p = await login(browser, "leader@hanamedia.local");
  await p.goto("/cong-viec?q=D0004");
  await expect(p.locator("[data-card]").filter({ hasText: "D0004" }).first()).toBeVisible();
  await expect(p.locator("[data-card]").filter({ hasText: "D0005" })).toHaveCount(0);
  await p.goto("/cong-viec?q=pallas"); // theo tên video
  await expect(p.locator("[data-card]").filter({ hasText: "D0004" }).first()).toBeVisible();
  await p.goto("/cong-viec?loc=review"); // chờ duyệt
  await expect(p.locator("[data-card]").filter({ hasText: "D0010" })).toHaveCount(1);
  await expect(p.locator("[data-card]").filter({ hasText: "D0004" })).toHaveCount(0);
  await p.goto("/cong-viec?loc=overdue"); // D0010 hạn 17/11 đã qua
  await expect(p.locator("[data-card]").filter({ hasText: "D0010" })).toContainText("Quá hạn");
  await p.goto("/cong-viec");
  await p.getByLabel("Lọc theo người phụ trách").selectOption({ label: "Duy" });
  await p.getByRole("button", { name: "Lọc" }).click();
  await expect(p.locator("[data-card]").filter({ hasText: "D0002" }).first()).toBeVisible();
  await expect(p.locator("[data-card]").filter({ hasText: "D0004" })).toHaveCount(0); // Editor của D0004 là Hoa
});

test("phân quyền: cộng tác viên và Editor khác không thấy việc video của người khác; Danh sách chờ giữ việc cũ nhiều người phụ trách", async ({ browser }) => {
  const ctv = await login(browser, "ctv@hanamedia.local");
  await ctv.goto("/cong-viec");
  await expect(ctv.getByRole("heading", { name: "Công việc", exact: true })).toBeVisible();
  await expect(ctv.locator("[data-card]").filter({ hasText: /D00\d\d/ })).toHaveCount(0);
  const hoa = await login(browser, "hoa@hanamedia.local");
  await hoa.goto("/cong-viec?q=D0002");
  await expect(hoa.locator("[data-card]")).toHaveCount(0);
  await hoa.goto("/cong-viec?tab=lich");
  await expect(hoa.locator("[data-cal-item]").filter({ hasText: "D0002" })).toHaveCount(0);

  // việc độc lập nhiều người phụ trách bằng biểu mẫu cũ
  const leader = await login(browser, "leader@hanamedia.local");
  await leader.goto("/cong-viec?tab=cho");
  const title = `Họp duyệt kịch bản ${Date.now() % 100000}`;
  await leader.locator("summary").filter({ hasText: "Thêm công việc" }).click();
  await leader.getByLabel("Tiêu đề *").fill(title);
  const checks = leader.locator("form").filter({ has: leader.getByLabel("Tiêu đề *") }).getByRole("checkbox");
  await checks.nth(1).check();
  await checks.nth(2).check();
  await leader.getByRole("button", { name: "Thêm công việc" }).click();
  const row = leader.getByTestId("list-tasks").locator("tr").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row.locator("p.text-xs")).toContainText(/,/); // ≥ 2 người phụ trách
});

test("điện thoại: bảng không tràn ngang; đổi cột bằng menu", async ({ browser }) => {
  const p = await login(browser, "hieu@hanamedia.local", true);
  await p.goto("/cong-viec");
  const title = `Việc điện thoại ${Date.now() % 100000}`;
  await p.getByRole("button", { name: 'Thêm việc vào "Việc cần làm"' }).click();
  await p.getByLabel('Tên công việc mới trong "Việc cần làm"').fill(title);
  await p.getByRole("button", { name: "Thêm", exact: true }).click();
  await p.getByLabel(`Chuyển ${title} đến`).selectOption(DOING);
  await expect(col(p, DOING).locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  const width = () => p.evaluate(() => document.documentElement.scrollWidth);
  await expect.poll(width).toBeLessThanOrEqual(390); // chờ ngăn điều hướng của khung ứng dụng đóng xong
  for (const tab of ["lich", "toi", "cho"]) {
    await p.goto(`/cong-viec?tab=${tab}`);
    await expect.poll(width).toBeLessThanOrEqual(390);
  }
  await p.goto("/cong-viec?xem=nhom");
  await expect.poll(width).toBeLessThanOrEqual(390);
});

test("nhóm công việc (thêm / xếp / đổi tên / xóa) và liên kết dự án (chọn khi tạo, lọc, chip, ngăn chi tiết)", async ({ browser }) => {
  test.setTimeout(120_000);
  const db = newClient();
  await db.connect();
  const code = `DA-E2E-${Date.now() % 100000}`;
  const pname = `Phim giới thiệu BelAZ ${code}`;
  await db.query("insert into projects (org_id, code, name, manager_id) values ($1, $2, $3, $4)", [ORG, code, pname, U.leader]);
  await db.end();

  const p = await login(browser, "leader@hanamedia.local");
  // tạo việc có dự án bằng biểu mẫu
  const title = `Duyệt storyboard ${Date.now() % 100000}`;
  await p.goto("/cong-viec");
  await p.locator("summary").filter({ hasText: "Thêm công việc" }).click();
  await p.getByLabel("Tiêu đề *").fill(title);
  await p.getByLabel("Dự án liên quan").selectOption({ label: `${code} · ${pname}` });
  await p.getByRole("button", { name: "Thêm công việc" }).click();
  const card = p.locator("[data-card]").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("card-project")).toHaveText(code);

  // lọc theo dự án
  await p.getByLabel("Lọc theo dự án").selectOption({ label: `${code} · ${pname}` });
  await p.getByRole("button", { name: "Lọc" }).click();
  await expect(p.locator("[data-card]")).toHaveCount(1);
  await expect(p.locator("[data-card]").filter({ hasText: title })).toHaveCount(1);
  // ngăn chi tiết có liên kết dự án
  await p.locator("[data-card]").getByTestId("card-title").click();
  await expect(p.getByTestId("drawer-project")).toContainText(pname);
  await p.getByRole("link", { name: "Đóng chi tiết" }).click();

  // nhóm công việc
  await p.goto("/cong-viec?xem=nhom");
  await expect(p.getByTestId("work-board")).toHaveAttribute("data-mode", "group");
  const gname = `Quay phim ${Date.now() % 10000}`;
  await p.getByLabel("Thêm nhóm công việc").locator("xpath=..").getByPlaceholder("Tên nhóm, ví dụ: Quay phim").fill(gname);
  await p.getByRole("button", { name: "Thêm nhóm" }).click();
  const group = p.locator("section[data-column]").filter({ has: p.getByRole("heading", { name: new RegExp(gname) }) });
  await expect(group).toHaveCount(1);
  // xếp việc vào nhóm bằng menu; tải lại vẫn ở nhóm; trạng thái không đổi
  const t2 = `Chọn địa điểm quay ${Date.now() % 100000}`;
  await p.getByRole("button", { name: 'Thêm việc vào "Chưa phân nhóm"' }).click();
  await p.getByLabel('Tên công việc mới trong "Chưa phân nhóm"').fill(t2);
  await p.getByRole("button", { name: "Thêm", exact: true }).click();
  await expect(p.locator("[data-card]").filter({ hasText: t2 })).toHaveCount(1);
  await p.getByLabel(`Chuyển ${t2} đến`).selectOption({ label: gname });
  await expect(group.locator("[data-card]").filter({ hasText: t2 })).toHaveCount(1);
  await p.reload();
  await expect(group.locator("[data-card]").filter({ hasText: t2 })).toHaveCount(1);
  await expect(group.locator("[data-card]").filter({ hasText: t2 })).toContainText("Chưa bắt đầu");
  // thẻ video cũng xếp được vào nhóm nhưng trạng thái (Đang dựng…) không đổi
  await p.goto("/cong-viec?xem=nhom&q=D0002");
  await editCard(p, "D0002").getByLabel(/Chuyển .* đến/).selectOption({ label: gname });
  await expect(group.locator("[data-card]").filter({ hasText: "D0002" })).toHaveCount(1);
  // xóa nhóm: việc trở về "Chưa phân nhóm", không mất việc
  await p.goto("/cong-viec?xem=nhom");
  await group.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(p.getByRole("heading", { name: new RegExp(gname) })).toHaveCount(0);
  await expect(p.locator("section[data-column=none] [data-card]").filter({ hasText: t2 })).toHaveCount(1);
});
