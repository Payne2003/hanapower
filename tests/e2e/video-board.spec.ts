// Trang Video "Quản lý sản xuất": video nào cần xử lý, ai phụ trách, việc tiếp theo là gì.
// Ca nghiệm thu: D0012 đủ 4/4 nhưng chờ Editor xác nhận; D0028 chưa có Editor và 0/4; D0020 đã nhận đủ nhưng đang tạm dừng.
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { DB_URL } from "../db/helpers";

const PASSWORD = "MatKhau@123";
async function login(browser: Browser, email: string, viewport = { width: 1360, height: 900 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("Email công việc").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  return page;
}
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []) {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, p)).rows as T[]; } finally { await c.end(); }
}
const U = (n: number) => `00000000-0000-4000-c000-${String(n).padStart(12, "0")}`;
const ORG = "00000000-0000-4000-a000-000000000001";
const HIEU = U(3), PHONG = U(4), DUY = U(5), HOA = U(6);
const rowOf = (p: Page, code: string) => p.getByTestId("video-row").filter({ has: p.getByRole("link", { name: code, exact: true }) });
const count = async (p: Page, key: string) => Number((await p.getByTestId(`qv-count-${key}`).innerText()).trim());

test.describe.configure({ mode: "serial" });

test("dựng dữ liệu kiểm thử: D0012 (4/4, chờ Editor), D0028 (chưa Editor, 0/4), D0020 (đã nhận đủ, tạm dừng), D0030 (sẵn sàng bàn giao)", async () => {
  await sql(`update videos set stage = 'handover', handover_status = 'pending', handover_submitted_at = now() - interval '1 day', handover_confirmed_at = null, editor_note = null,
    edit_progress = 0, draft_url = null, approved_by = null, approved_at = null, published_url = null, published_at = null, content_owner_id = $1, editor_id = $2,
    resource_url = 'https://drive.example.com/d0012', due_date = null where code = 'D0012'`, [HIEU, DUY]);
  await sql(`update video_items set status = 'done' where video_id = (select id from videos where code = 'D0012')`);
  const mk = async (code: string, title: string, f: { stage: string; owner: string | null; editor: string | null; hs: string | null; items: string[]; resource: string | null; hold?: string; day: number }) => {
    const id = (await sql<{ id: string }>(`insert into videos (id, org_id, code, title, stage, report_date, content_owner_id, editor_id, handover_status, handover_submitted_at, handover_confirmed_at,
      resource_url, hold_reason, stage_before_hold, created_by)
      values (gen_random_uuid(), $1, $2, $3, $4::video_stage, (date_trunc('month', current_date) + ($5 - 1) * interval '1 day')::date, $6, $7, $8::handover_status,
      case when $8 in ('pending', 'received') then now() - interval '2 days' end, case when $8 = 'received' then now() - interval '1 day' end, $9, $10,
      case when $4 = 'on_hold' then 'editing'::video_stage end, $11) returning id`,
      [ORG, code, title, f.stage, f.day, f.owner, f.editor, f.hs, f.resource, f.hold ?? null, HIEU]))[0]!.id;
    const kinds = ["real_footage", "ai_video", "script_vo", "edit_map"];
    for (let i = 0; i < 4; i++) await sql(`insert into video_items (org_id, video_id, kind, status) values ($1, $2, $3, $4::item_status)`, [ORG, id, kinds[i], f.items[i]]);
  };
  await mk("D0028", "Sư tử đực săn trâu rừng — kịch bản mới", { stage: "preparing", owner: HIEU, editor: null, hs: null, items: ["todo", "todo", "todo", "todo"], resource: null, day: 27 });
  await mk("D0020", "Báo đen phục kích bên bờ suối", { stage: "on_hold", owner: PHONG, editor: HOA, hs: "received", items: ["done", "done", "done", "done"], resource: "https://drive.example.com/d0020", hold: "Chờ khách duyệt kịch bản", day: 20 });
  await mk("D0030", "Đại bàng săn mồi trên vách đá", { stage: "preparing", owner: HIEU, editor: DUY, hs: null, items: ["done", "done", "done", "done"], resource: "https://drive.example.com/d0030", day: 26 });
  expect((await sql(`select code from videos where code in ('D0012', 'D0020', 'D0028', 'D0030')`)).length).toBe(4);
});

test("đầu trang gọn: tiêu đề, số video + tháng, nút +Tạo video, Nhập từ Excel, công tắc Bảng | Kanban; góc nhìn nhanh có số đếm", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/video");
  await expect(l.getByRole("heading", { name: "Quản lý sản xuất video" })).toBeVisible();
  await expect(l.getByTestId("video-count")).toContainText(/\d+ video · tháng \d{2}\/\d{4}/);
  await expect(l.getByTestId("create-video")).toContainText("Tạo video");
  await expect(l.getByRole("link", { name: "Nhập từ Excel" })).toBeVisible();
  await expect(l.getByTestId("mode-table")).toHaveAttribute("aria-selected", "true");
  await expect(l.getByText("Tạo video mới", { exact: true })).toHaveCount(0); // không còn thanh chiếm trọn một hàng
  // nút chính mở đúng biểu mẫu tạo hiện có
  await l.getByTestId("create-video").click();
  await expect(l.getByTestId("create-panel")).toContainText("Tên video / chủ đề");
  await l.getByTestId("create-panel").getByRole("link", { name: "Đóng" }).click();
  await expect(l.getByTestId("create-panel")).toHaveCount(0);
  // số đếm góc nhìn nhanh khớp danh sách khi bấm
  const waiting = await count(l, "cho-ban-giao");
  const noEditor = await count(l, "chua-editor");
  const paused = await count(l, "tam-dung");
  expect(waiting).toBeGreaterThanOrEqual(1);
  expect(noEditor).toBeGreaterThanOrEqual(1);
  expect(paused).toBeGreaterThanOrEqual(1);
  await l.getByTestId("qv-cho-ban-giao").click();
  await expect(l.getByTestId("video-row")).toHaveCount(waiting);
  await expect(rowOf(l, "D0012")).toBeVisible();
  await expect(rowOf(l, "D0028")).toHaveCount(0);
  await l.getByTestId("qv-chua-editor").click();
  await expect(l.getByTestId("video-row")).toHaveCount(noEditor);
  await expect(rowOf(l, "D0028")).toBeVisible();
  await l.getByTestId("qv-tam-dung").click();
  await expect(l.getByTestId("video-row")).toHaveCount(paused);
  await expect(rowOf(l, "D0020")).toBeVisible();
});

test("ba ca nghiệm thu: D0012 / D0028 / D0020 — hạng mục, bàn giao, giai đoạn tách riêng; bấm 4/4 xem từng hạng mục", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/video?q=D0012");
  const d12 = rowOf(l, "D0012");
  await expect(l.getByTestId("video-row")).toHaveCount(1);
  await expect(d12).toContainText("Duy"); // tên đầy đủ của Editor
  await expect(d12.getByTestId("checklist-btn")).toContainText("4/4");
  await expect(d12).toContainText("Chờ Editor xác nhận"); // BÀN GIAO
  await expect(d12).toContainText("Chờ bàn giao"); // GIAI ĐOẠN
  await expect(d12).toContainText("Báo cáo"); // ý nghĩa ngày: ngày báo cáo
  await d12.getByTestId("checklist-btn").click();
  await expect(l.getByTestId("checklist-popover").locator('li[data-status="done"]')).toHaveCount(4);
  await l.keyboard.press("Escape");
  await expect(l.getByTestId("checklist-popover")).toHaveCount(0);

  await l.goto("/video?q=D0028");
  const d28 = rowOf(l, "D0028");
  await expect(d28.getByTestId("no-editor")).toContainText("Chưa phân công");
  await expect(d28.getByTestId("checklist-btn")).toContainText("0/4");
  await expect(d28).toContainText("Chưa gửi bàn giao");
  await d28.getByTestId("checklist-btn").click();
  await expect(l.getByTestId("checklist-popover").locator('li[data-status="todo"]')).toHaveCount(4);
  await expect(l.getByTestId("checklist-popover")).toContainText("Nguồn thật");
  await expect(l.getByTestId("checklist-popover")).toContainText("Sơ đồ dựng");

  await l.goto("/video?q=D0020");
  const d20 = rowOf(l, "D0020");
  await expect(d20).toContainText("Đã nhận đủ");
  await expect(d20).toContainText("Tạm dừng");
  await expect(d20.getByTestId("checklist-btn")).toContainText("4/4");
  await expect(d20.getByTestId("open-resource")).toHaveAttribute("href", "https://drive.example.com/d0020");
  await expect(d20.getByTestId("open-resource")).toHaveAttribute("target", "_blank");
});

test("tìm theo mã, chuyển tháng, bộ lọc người cho biết Content hay Editor; Bảng / Kanban và mở đóng chi tiết giữ nguyên tra cứu", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/video");
  await l.getByTestId("video-search").fill("D0028");
  await expect(l).toHaveURL(/q=D0028/);
  await expect(l.getByTestId("video-row")).toHaveCount(1);
  await l.getByTestId("video-search").fill("");
  await expect(l).not.toHaveURL(/q=D0028/);
  // chuyển tháng: tháng trước không có video; tháng sau quay lại
  await l.getByTestId("month-prev").click();
  await expect(l).toHaveURL(/thang=\d{4}-\d{2}/);
  await expect(l.getByText("Không có video nào")).toBeVisible();
  await l.getByTestId("month-next").click();
  await expect(rowOf(l, "D0012")).toBeVisible();
});

test("lọc theo người nêu rõ vai trò; Kanban dùng chung bộ lọc; mở rồi đóng chi tiết giữ nguyên tra cứu, Esc trả focus về dòng", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto(`/video?nguoi=e:${DUY}`);
  await expect(l.getByTestId("person-filter-note")).toContainText("Đang lọc Editor");
  await expect(l.getByTestId("person-filter-note")).toContainText("Duy");
  for (const r of await l.getByTestId("video-row").all()) await expect(r).toContainText("Duy");
  await l.goto(`/video?nguoi=c:${HIEU}`);
  await expect(l.getByTestId("person-filter-note")).toContainText("Đang lọc Content");
  await expect(rowOf(l, "D0028")).toBeVisible();
  await expect(rowOf(l, "D0020")).toHaveCount(0); // D0020 do Phong làm Content

  // bộ lọc dùng chung Bảng / Kanban
  await l.goto(`/video?nguoi=c:${HIEU}&q=D00`);
  const nBefore = await l.getByTestId("video-row").count();
  await l.getByTestId("mode-kanban").click();
  await expect(l).toHaveURL(/xem=kanban/);
  await expect(l).toHaveURL(new RegExp(`nguoi=c%3A${HIEU}|nguoi=c:${HIEU}`));
  expect(await l.getByTestId("video-kanban-card").count()).toBeGreaterThan(0);
  expect(await l.getByTestId("video-kanban-card").count()).toBeLessThanOrEqual(nBefore);
  await expect(l.getByTestId("video-kanban").locator('[data-code="D0028"]')).toBeVisible();
  // mở chi tiết từ Kanban, đóng bằng Esc → URL giữ bộ lọc, focus về thẻ
  await l.getByTestId("video-kanban").locator('[data-code="D0028"]').click();
  await expect(l.getByTestId("video-panel")).toContainText("D0028");
  await expect(l).toHaveURL(/chon=/);
  await l.keyboard.press("Escape");
  await expect(l.getByTestId("video-panel")).toHaveCount(0);
  await expect(l).not.toHaveURL(/chon=/);
  await expect(l).toHaveURL(/xem=kanban/);
  await expect(l).toHaveURL(/q=D00/);
  await expect(l.getByTestId("video-kanban").locator('[data-code="D0028"]')).toBeFocused();
  // quay lại Bảng: bộ lọc còn nguyên, mở / đóng bằng nút, focus về dòng
  await l.getByTestId("mode-table").click();
  await expect(l.getByTestId("video-row")).toHaveCount(nBefore);
  await rowOf(l, "D0028").getByTestId("select-video").click();
  await expect(l.getByTestId("panel-title")).toContainText("Sư tử đực săn trâu rừng");
  await l.getByTestId("panel-close").click();
  await expect(rowOf(l, "D0028")).toBeFocused();
  // tải lại khi đang mở chi tiết: trạng thái nằm trên URL
  await rowOf(l, "D0028").getByTestId("select-video").click();
  await l.reload();
  await expect(l.getByTestId("video-panel")).toContainText("D0028");
});

test("khung chi tiết: D0028 chưa có Editor — Leader chọn Editor, dòng / khung / bộ đếm cập nhật cùng lúc", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local");
  await l.goto("/video?loc=chua-editor");
  const before = await count(l, "chua-editor");
  await rowOf(l, "D0028").getByTestId("select-video").click();
  const panel = l.getByTestId("video-panel");
  await expect(panel.getByTestId("panel-next-step")).toContainText("Content hoàn tất 4 hạng mục còn lại");
  await expect(panel.getByTestId("no-editor")).toBeVisible();
  await expect(panel.getByTestId("panel-checklist").locator('li[data-status="todo"]')).toHaveCount(4);
  await panel.getByTestId("assign-editor").selectOption({ label: "Duy" });
  await panel.getByTestId("act-assign").click();
  await expect(panel.getByTestId("panel-message")).toContainText("Đã cập nhật phân công");
  await expect(panel.getByTestId("no-editor")).toHaveCount(0);
  await expect(l.getByTestId("qv-count-chua-editor")).toHaveText(String(before - 1)); // bộ lọc "Chưa có Editor" đổi cùng lúc
  await expect(rowOf(l, "D0028")).toHaveCount(0); // dòng rời khỏi góc nhìn, khung vẫn mở với dữ liệu mới
  await expect(panel).toContainText("Duy");
});

test("Content gửi bàn giao (D0030 đủ 4/4 + link + Editor) → xuất hiện ở 'Chờ xác nhận bàn giao'; D0028 hiển thị thiếu gì để bàn giao", async ({ browser }) => {
  const h = await login(browser, "hieu@hanamedia.local");
  await h.goto("/video?q=D0030");
  await rowOf(h, "D0030").getByTestId("select-video").click();
  const panel = h.getByTestId("video-panel");
  await expect(panel.getByTestId("panel-next-step")).toContainText("Content gửi bàn giao");
  await expect(panel.getByTestId("panel-handover")).toContainText("Chưa gửi bàn giao");
  await expect(panel.getByTestId("act-confirm-received")).toHaveCount(0); // Content không xác nhận thay Editor
  const waitBefore = await sql<{ n: string }>(`select count(*) n from videos where stage = 'handover' and handover_status = 'pending'`);
  await panel.getByTestId("act-send-handover").dblclick(); // bấm đúp: chỉ gửi một lần
  await expect(panel.getByTestId("panel-message")).toContainText("Đã gửi bàn giao");
  await expect(panel.getByTestId("panel-next-step")).toContainText("Chờ Duy xác nhận");
  await expect(panel.getByTestId("panel-handover")).toContainText("Chờ Editor xác nhận");
  expect((await sql<{ n: string }>(`select count(*) n from video_events where event_type = 'handover_submit' and video_id = (select id from videos where code = 'D0030')`))[0]!.n).toBe("1");
  expect(Number((await sql<{ n: string }>(`select count(*) n from videos where stage = 'handover' and handover_status = 'pending'`))[0]!.n)).toBe(Number(waitBefore[0]!.n) + 1);
  // D0028 (nay đã có Editor Duy nhưng 0/4): hiển thị thiếu gì
  await h.goto("/video?q=D0028");
  await rowOf(h, "D0028").getByTestId("select-video").click();
  await expect(h.getByTestId("handover-blockers")).toContainText("Chưa hoàn thành");
  await expect(h.getByTestId("act-send-handover")).toHaveCount(0);
  // Editor khác (Hòa) không thấy hành động xác nhận của D0030
  const hoa = await login(browser, "hoa@hanamedia.local");
  await hoa.goto("/video?q=D0030");
  await rowOf(hoa, "D0030").getByTestId("select-video").click();
  await expect(hoa.getByTestId("video-panel")).toContainText("Chờ Duy xác nhận");
  await expect(hoa.getByTestId("act-confirm-received")).toHaveCount(0);
});

test("Editor xác nhận đã nhận đủ D0012: bấm đúp chỉ một sự kiện; dòng, khung chi tiết và bộ lọc 'chờ xác nhận' cập nhật đồng thời", async ({ browser }) => {
  const d = await login(browser, "duy@hanamedia.local");
  await d.goto("/video?loc=cho-ban-giao");
  const before = await count(d, "cho-ban-giao");
  await rowOf(d, "D0012").getByTestId("select-video").click();
  const panel = d.getByTestId("video-panel");
  await expect(panel.getByTestId("panel-next-step")).toContainText("Chờ Duy xác nhận");
  await expect(panel.getByTestId("panel-checklist").locator('li[data-status="done"]')).toHaveCount(4);
  await expect(panel.getByTestId("panel-open-resource")).toHaveAttribute("href", "https://drive.example.com/d0012");
  await panel.getByTestId("act-confirm-received").dblclick();
  await expect(panel.getByTestId("panel-message")).toContainText("Đã xác nhận nhận đủ");
  await expect(panel.getByTestId("panel-next-step")).toContainText("Editor đang dựng");
  await expect(panel.getByTestId("panel-handover")).toContainText("Đã nhận đủ");
  await expect(panel.getByTestId("act-confirm-received")).toHaveCount(0);
  await expect(d.getByTestId("qv-count-cho-ban-giao")).toHaveText(String(before - 1));
  await expect(rowOf(d, "D0012")).toHaveCount(0); // đã ra khỏi bộ lọc chờ xử lý
  const ev = await sql<{ n: string }>(`select count(*) n from video_events where event_type = 'handover_received' and video_id = (select id from videos where code = 'D0012')`);
  expect(ev[0]!.n).toBe("1");
  expect((await sql<{ stage: string; handover_status: string }>(`select stage, handover_status from videos where code = 'D0012'`))[0]).toEqual({ stage: "editing", handover_status: "received" });
  // hoàn tất checklist và xác nhận bàn giao là hai sự kiện riêng: D0012 vẫn 4/4 nhưng nay mới "đã nhận đủ"
  await d.goto("/video?q=D0012");
  await expect(rowOf(d, "D0012")).toContainText("Đã nhận đủ");
  await expect(rowOf(d, "D0012")).toContainText("Đang dựng");
});

test("laptop hẹp: chi tiết dạng ngăn trượt, tên video và người phụ trách vẫn đọc được; không tràn ngang; điện thoại dùng thẻ", async ({ browser }) => {
  const l = await login(browser, "leader@hanamedia.local", { width: 1100, height: 760 });
  await l.goto("/video?q=D0028");
  await rowOf(l, "D0028").getByTestId("select-video").click();
  const shell = l.getByTestId("video-panel-shell");
  await expect(shell).toBeVisible();
  const box = (await shell.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(460);
  expect(box.x + box.width).toBeLessThanOrEqual(1100 + 1);
  await expect(l.getByTestId("panel-title")).toBeVisible();
  await expect(shell.getByText("Content", { exact: true }).first()).toBeVisible();
  const over = await l.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
  await l.keyboard.press("Escape");
  const m = await login(browser, "leader@hanamedia.local", { width: 390, height: 844 });
  await m.goto("/video");
  await expect(m.getByTestId("video-card").first()).toBeVisible();
  expect(await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
