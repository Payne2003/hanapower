// Sản phẩm & Bảng giá: ước tính, thêm vào cơ hội, đề nghị → duyệt → hiệu lực, thiếu giá, xung đột phiên bản, bản chụp báo giá, phân quyền.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, switchUser, U, type Q } from "./helpers";

const OPP = "00000000-0000-4000-d400-000000000002"; // đang thương lượng, dùng "Bảng giá chuẩn 2026"
const STD_BOOK = "00000000-0000-4000-d200-000000000001";
let c: pg.Client;
beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README.");
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});

async function scenario(fn: (q: Q, as: (u: string | null) => Promise<void>) => Promise<void>) {
  await c.query("begin");
  try {
    await fn(makeQ(c), (u) => switchUser(c, u));
  } finally {
    await c.query("rollback");
  }
}
const one = async <T = Record<string, unknown>>(q: Q, sql: string, p?: unknown[]) => (await q(sql, p))[0] as T;
const val = async <T = unknown>(q: Q, sql: string, p?: unknown[]) => Object.values((await q(sql, p))[0] ?? {})[0] as T;
const lines = (...l: [string, number, number?, number?][]) => JSON.stringify(l.map(([product_id, unit_price, fee_percent = 0, tax_percent = 0]) => ({ product_id, unit_price, fee_percent, tax_percent })));

/** DV001: giá tiêu chuẩn 5.000.000 và giá đối tác 4.500.000 (đồng / video); bảng chuẩn là mặc định. */
async function fixture(q: Q, as: (u: string | null) => Promise<void>) {
  await as(U.leader);
  const unit = await val<string>(q, "select id from product_units where name = 'Video' limit 1");
  const dv = await val<string>(q, "select save_product(null, 'Dịch vụ DV001', 'DV001', null, $1, 'Sản xuất video theo gói', true, $2)", [unit, STD_BOOK]);
  const partner = (await one<{ id: string }>(q, "insert into price_books (org_id, name) values (app.current_org_id(), 'Bảng giá đối tác') returning id")).id;
  await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [STD_BOOK, lines([dv, 5_000_000])]);
  await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [partner, lines([dv, 4_500_000])]);
  return { dv, partner, unit };
}

describe("Ước tính và thêm vào cơ hội", () => {
  it("DV001 giá đối tác × 3 = 13.500.000 tạm tính; thêm vào cơ hội giữ đúng giá và đơn vị; khác bảng giá cơ hội thì hỏi cách xử lý", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const est = await val<Record<string, number | string>>(q, "select price_estimate($1, $2, 3)", [f.dv, f.partner]);
      expect(Number(est.subtotal)).toBe(13_500_000);
      expect(Number(est.unit_price)).toBe(4_500_000);
      expect(est.unit).toBe("Video");
      expect(Number(est.total)).toBe(13_500_000); // phí 0, thuế 0
      // bảng chuẩn có phí 10% và thuế 8%: tổng theo cùng một quy tắc làm tròn
      await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [f.partner, lines([f.dv, 4_500_000, 10, 8])]);
      const e2 = await val<Record<string, number>>(q, "select price_estimate($1, $2, 3)", [f.dv, f.partner]);
      expect([Number(e2.subtotal), Number(e2.fee_amount), Number(e2.tax_amount), Number(e2.total)]).toEqual([13_500_000, 1_350_000, 1_188_000, 16_038_000]);
      // cơ hội đang dùng bảng chuẩn → trả về chênh lệch, chưa thêm gì
      const m = await val<{ status: string; diff: number }>(q, "select add_priced_line($1, $2, $3, 3)", [OPP, f.dv, f.partner]);
      expect(m.status).toBe("mismatch");
      expect(await val<number>(q, "select count(*)::int from opportunity_products where product_id = $1", [f.dv])).toBe(0);
      const added = await val<{ status: string; line_id: string }>(q, "select add_priced_line($1, $2, $3, 3, 'use_selected_book')", [OPP, f.dv, f.partner]);
      expect(added.status).toBe("added");
      const line = await one<{ unit_price: string; unit: string; quantity: string; fee_percent: string; total: string }>(q, "select unit_price, unit, quantity, fee_percent, total from opportunity_products where id = $1", [added.line_id]);
      expect([Number(line.unit_price), line.unit, Number(line.quantity), Number(line.fee_percent), Number(line.total)]).toEqual([4_500_000, "Video", 3, 10, 16_038_000]);
      // bảng giá của cơ hội không bị đổi khi chọn use_selected_book
      expect(await val(q, "select price_book_id from opportunities where id = $1", [OPP])).toBe(STD_BOOK);
    });
  });

  it("thiếu dòng giá báo rõ bảng và đơn vị; sản phẩm ngừng bán không thêm được; người chỉ xem không thêm được", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const other = (await one<{ id: string }>(q, "insert into price_books (org_id, name) values (app.current_org_id(), 'Bảng trống') returning id")).id;
      await expectError(q("select price_estimate($1, $2, 1)", [f.dv, other]), "chưa có dòng giá");
      await expectError(q("select price_estimate($1, $2, 0)", [f.dv, f.partner]), "Số lượng");
      await q("select save_product($1, 'Dịch vụ DV001', 'DV001', null, $2, null, false, $3)", [f.dv, f.unit, STD_BOOK]);
      await expectError(q("select add_priced_line($1, $2, $3, 1)", [OPP, f.dv, STD_BOOK]), "ngừng kinh doanh");
      await as(U.ketoan);
      await expectError(q("select add_priced_line($1, $2, $3, 1)", [OPP, f.dv, STD_BOOK]), "quyền");
    });
  });
});

describe("Đề nghị thay đổi giá → duyệt → hiệu lực", () => {
  async function request(q: Q, as: (u: string | null) => Promise<void>, f: { dv: string }, effective: string, price = 5_200_000) {
    await as(U.leader);
    await q("select set_price_book_options($1, true)", [STD_BOOK]);
    await as(U.truongnhom);
    const id = await val<string>(q, `select save_price_change(null, $1, 'Tăng giá theo thị trường', ${effective}, $2::jsonb)`, [STD_BOOK, lines([f.dv, price])]);
    return id;
  }

  it("+200.000 ₫ / +4%; trước ngày hiệu lực dùng giá cũ, sau đó dùng giá mới; báo giá đã gửi vẫn ra giá đã chào", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      await c.query("reset role");
      await c.query("update price_book_line_history set effective_from = current_date - 60 where product_id = $1", [f.dv]); // giá cũ đã áp dụng từ 60 ngày trước
      await as(U.truongnhom);
      // báo giá có dòng DV001 ở giá cũ (qua cơ hội dùng bảng chuẩn), rồi gửi
      const line = await val<{ line_id: string }>(q, "select add_priced_line($1, $2, $3, 2)", [OPP, f.dv, STD_BOOK]);
      expect(line.line_id).toBeTruthy();
      const quote = await val<string>(q, "select create_quote($1)", [OPP]);
      await q("select set_quote_status($1, 'pending_approval')", [quote]);
      await as(U.leader);
      await q("select set_quote_status($1, 'approved')", [quote]);
      await q("select set_quote_status($1, 'sent')", [quote]);
      const sent = await one<{ total: string }>(q, "select total from quotes where id = $1", [quote]);

      const id = await request(q, as, f, "current_date + 30");
      await q("select submit_price_change($1)", [id]);
      const d = await val<{ lines: { diff: number; diff_pct: number; old_unit_price: number; new_unit_price: number }[]; display_status: string }>(q, "select price_change_detail($1)", [id]);
      expect([Number(d.lines[0]!.diff), Number(d.lines[0]!.diff_pct)]).toEqual([200_000, 4]);
      await as(U.leader);
      await q("select decide_price_change($1, 'approve', 'Đồng ý')", [id]);
      expect((await val<{ display_status: string }>(q, "select price_change_detail($1)", [id])).display_status).toBe("waiting"); // chờ hiệu lực
      // trước ngày hiệu lực: giá vẫn là 5.000.000
      expect(Number((await val<Record<string, string>>(q, "select price_estimate($1, $2, 1)", [f.dv, STD_BOOK])).unit_price)).toBe(5_000_000);
      expect(await val<number>(q, "select apply_due_price_changes()")).toBe(0);
      // tới ngày hiệu lực (đưa ngày hiệu lực về hôm nay): áp dụng đúng một lần
      await c.query("reset role");
      await c.query("update price_change_requests set effective_date = current_date where id = $1", [id]);
      await as(U.truongnhom);
      expect(await val<number>(q, "select apply_due_price_changes()")).toBe(1);
      expect(await val<number>(q, "select apply_due_price_changes()")).toBe(0);
      expect(Number((await val<Record<string, string>>(q, "select price_estimate($1, $2, 1)", [f.dv, STD_BOOK])).unit_price)).toBe(5_200_000);
      expect((await val<{ display_status: string }>(q, "select price_change_detail($1)", [id])).display_status).toBe("applied");
      // lịch sử: tại thời điểm trước ngày hiệu lực vẫn tra ra giá cũ
      expect(Number((await val<Record<string, string>>(q, "select price_lookup($1, $2, current_date - 5)", [STD_BOOK, f.dv])).unit_price)).toBe(5_000_000);
      // báo giá đã gửi giữ nguyên số đã chào; không cập nhật giá cho báo giá đã gửi
      expect((await one<{ total: string }>(q, "select total from quotes where id = $1", [quote])).total).toBe(sent.total);
      expect(Number(await val(q, "select unit_price from quote_items where quote_id = $1 and product_id = $2", [quote, f.dv]))).toBe(5_000_000);
      await expectError(q("select refresh_quote_prices($1)", [quote]), "đã gửi");
      // báo giá nháp mới: dùng giá mới sau khi xem chênh lệch và xác nhận
      const q2 = await val<string>(q, "select create_quote($1)", [OPP]); // dòng cơ hội vẫn giữ giá cũ → báo giá nháp mang giá cũ
      const diff = await val<{ editable: boolean; lines: { changed: boolean; diff: number; new_unit_price: number }[] }>(q, "select quote_price_diff($1)", [q2]);
      expect(diff.editable).toBe(true);
      expect(diff.lines.find((l) => l.changed)).toMatchObject({ new_unit_price: 5_200_000 });
      await q("select refresh_quote_prices($1)", [q2]);
      expect(Number(await val(q, "select unit_price from quote_items where quote_id = $1 and product_id = $2", [q2, f.dv]))).toBe(5_200_000);
      expect(Number(await val(q, "select unit_price from quote_items where quote_id = $1 and product_id = $2", [quote, f.dv]))).toBe(5_000_000);
    });
  });

  it("tách người đề nghị và người duyệt; quyền theo vai trò; yêu cầu chỉnh sửa cần ý kiến", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const id = await request(q, as, f, "current_date + 5");
      await as(U.ketoan);
      await expectError(q("select save_price_change(null, $1, 'x', current_date + 1, $2::jsonb)", [STD_BOOK, lines([f.dv, 1])]), "quyền");
      await as(U.truongnhom);
      await q("select submit_price_change($1)", [id]);
      await expectError(q("select decide_price_change($1, 'approve')", [id]), "quyền duyệt"); // người lập giá không có quyền duyệt
      await as(U.leader);
      await expectError(q("select submit_price_change($1)", [id]), "người lập"); // người duyệt không gửi hộ
      await expectError(q("select decide_price_change($1, 'request_changes', '')", [id]), "ý kiến");
      await q("select decide_price_change($1, 'request_changes', 'Chia lại theo gói')", [id]);
      expect((await val<{ status: string; decision_note: string }>(q, "select price_change_detail($1)", [id])).status).toBe("changes_requested");
      await as(U.truongnhom);
      await q("select submit_price_change($1)", [id]); // gửi lại sau chỉnh sửa
      // người lập là quản lý (có quyền duyệt) cũng không tự duyệt
      await as(U.admin);
      const own = await val<string>(q, "select save_price_change(null, $1, 'Admin', current_date + 2, $2::jsonb)", [STD_BOOK, lines([f.dv, 5_100_000])]);
      await q("select submit_price_change($1)", [own]);
      await expectError(q("select decide_price_change($1, 'approve')", [own]), "tự duyệt");
      await as(U.leader);
      await q("select decide_price_change($1, 'approve')", [id]);
      await expectError(q("select decide_price_change($1, 'approve')", [id]), "chờ duyệt");
      // lịch sử xử lý có đủ người và thời gian
      const ev = await val<{ action: string; by: string }[]>(q, "select (price_change_detail($1))->'events'", [id]);
      expect(ev.map((e) => e.action)).toEqual(["created", "submitted", "changes_requested", "submitted", "approved"]);
    });
  });

  it("dữ liệu gốc đổi trong lúc chờ → không duyệt được cho tới khi đối chiếu lại; hai đề nghị cùng ngày hiệu lực cho một dòng bị chặn", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const a = await request(q, as, f, "current_date + 7");
      await q("select submit_price_change($1)", [a]);
      // người khác đổi trực tiếp bảng (qua admin tắt chế độ duyệt → sửa → bật lại)
      await as(U.admin);
      await q("select set_price_book_options($1, false)", [STD_BOOK]);
      await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [STD_BOOK, lines([f.dv, 5_050_000])]);
      await q("select set_price_book_options($1, true)", [STD_BOOK]);
      await as(U.leader);
      expect((await val<{ stale: boolean }>(q, "select price_change_detail($1)", [a])).stale).toBe(true);
      await expectError(q("select decide_price_change($1, 'approve')", [a]), "Dữ liệu gốc");
      await as(U.truongnhom);
      await q("select rebase_price_change($1)", [a]);
      const d = await val<{ status: string; lines: { old_unit_price: number }[] }>(q, "select price_change_detail($1)", [a]);
      expect(d.status).toBe("draft");
      expect(Number(d.lines[0]!.old_unit_price)).toBe(5_050_000);
      await q("select submit_price_change($1)", [a]);
      await as(U.leader);
      await q("select decide_price_change($1, 'approve')", [a]);
      // đề nghị thứ hai cùng ngày hiệu lực, cùng dòng
      await as(U.truongnhom);
      const b = await val<string>(q, "select save_price_change(null, $1, 'Trùng ngày', current_date + 7, $2::jsonb)", [STD_BOOK, lines([f.dv, 5_300_000])]);
      await q("select submit_price_change($1)", [b]);
      await as(U.leader);
      await expectError(q("select decide_price_change($1, 'approve')", [b]), "cùng ngày hiệu lực");
    });
  });

  it("bảng cần duyệt chặn sửa trực tiếp ở mọi đường (RPC và bảng); hôm nay duyệt, hiệu lực hôm nay thì áp dụng ngay", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      await as(U.leader);
      await q("select set_price_book_options($1, true)", [STD_BOOK]);
      await expectError(q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [STD_BOOK, lines([f.dv, 1])]), "phê duyệt");
      await expectError(q("update price_book_products set unit_price = 1 where price_book_id = $1", [STD_BOOK]), "phê duyệt");
      await expectError(q("delete from price_book_products where price_book_id = $1", [STD_BOOK]), "phê duyệt");
      await as(U.truongnhom);
      const id = await val<string>(q, "select save_price_change(null, $1, 'Ngay hôm nay', current_date, $2::jsonb)", [STD_BOOK, lines([f.dv, 5_200_000])]);
      await q("select submit_price_change($1)", [id]);
      await as(U.leader);
      await q("select decide_price_change($1, 'approve')", [id]);
      expect(Number((await val<Record<string, string>>(q, "select price_estimate($1, $2, 1)", [f.dv, STD_BOOK])).unit_price)).toBe(5_200_000);
      expect((await val<{ display_status: string }>(q, "select price_change_detail($1)", [id])).display_status).toBe("applied");
      // một dòng, một phiên bản hiệu lực tại một ngày (lịch sử duy nhất theo ngày hiệu lực)
      expect(await val<number>(q, "select count(*)::int from price_book_line_history where price_book_id = $1 and product_id = $2 and effective_from = current_date", [STD_BOOK, f.dv])).toBe(1);
    });
  });

  it("đề nghị không thay đổi gì, ngày hiệu lực quá khứ, dòng trùng hoặc sai miền giá trị bị từ chối", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      await as(U.truongnhom);
      await expectError(q("select save_price_change(null, $1, 'x', current_date - 1, $2::jsonb)", [STD_BOOK, lines([f.dv, 5_200_000])]), "hôm nay");
      await expectError(q("select save_price_change(null, $1, 'x', current_date + 1, $2::jsonb)", [STD_BOOK, lines([f.dv, 5_000_000])]), "không cần đề nghị");
      await expectError(q("select save_price_change(null, $1, 'x', current_date + 1, $2::jsonb)", [STD_BOOK, lines([f.dv, 1], [f.dv, 2])]), "trùng");
      await expectError(q("select save_price_change(null, $1, 'x', current_date + 1, $2::jsonb)", [STD_BOOK, lines([f.dv, -1])]), "không được âm");
      await expectError(q("select save_price_change(null, $1, 'x', current_date + 1, $2::jsonb)", [STD_BOOK, lines([f.dv, 1, 120])]), "0 đến 100");
    });
  });
});

describe("Sửa trực tiếp bảng giá, thiếu giá, danh mục", () => {
  it("hai người sửa cùng phiên bản → người sau nhận xung đột; lưu một nhóm nhất quán (lỗi một dòng thì không lưu dòng nào)", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      await as(U.truongnhom);
      const v = await val<number>(q, "select version from price_books where id = $1", [STD_BOOK]);
      const r = await val<{ version: number }>(q, "select save_price_lines($1, $2, $3::jsonb)", [STD_BOOK, v, lines([f.dv, 5_100_000])]);
      expect(r.version).toBe(v + 1);
      await as(U.leader);
      await expectError(q("select save_price_lines($1, $2, $3::jsonb)", [STD_BOOK, v, lines([f.dv, 5_200_000])]), "đã được người khác sửa");
      const v2 = await val<number>(q, "select version from price_books where id = $1", [STD_BOOK]);
      const sp = await val<string>(q, "select id from products where code = 'HAU-KY'");
      await expectError(q("select save_price_lines($1, $2, $3::jsonb)", [STD_BOOK, v2, lines([f.dv, 5_900_000], [sp, -5])]), "không được âm");
      expect(Number(await val(q, "select unit_price from price_book_products where price_book_id = $1 and product_id = $2", [STD_BOOK, f.dv]))).toBe(5_100_000);
    });
  });

  it("sản phẩm thiếu giá đếm theo product_id duy nhất; giá 0 hợp lệ; thêm đúng dòng thì cảnh báo biến mất", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const unit = await val<string>(q, "select id from product_units where name = 'Video' limit 1");
      const bookA = (await one<{ id: string }>(q, "insert into price_books (org_id, name) values (app.current_org_id(), 'Bảng A') returning id")).id;
      const bookB = (await one<{ id: string }>(q, "insert into price_books (org_id, name) values (app.current_org_id(), 'Bảng B') returning id")).id;
      const base = await val<{ missing_products: number; active_products: number }>(q, "select price_health()");
      const dv = await val<string>(q, "select save_product(null, 'DV Thiếu giá', 'DV-THIEU', null, $1, null, true, null)", [unit]);
      let h = await val<{ missing_products: number; by_issue: Record<string, number>; items: { product_id: string; issue: string }[] }>(q, "select price_health()");
      expect(h.missing_products).toBe(base.missing_products + 1);
      expect(h.items.filter((i) => i.product_id === dv)).toHaveLength(1);
      expect(h.items.find((i) => i.product_id === dv)!.issue).toBe("no_default");
      // hai bảng đều thiếu dòng, đặt mặc định bảng A → vẫn chỉ một dòng lỗi (no_line)
      await q("select set_product_default_book($1, $2)", [dv, bookA]);
      h = await val(q, "select price_health()");
      expect(h.missing_products).toBe(base.missing_products + 1);
      expect(h.items.find((i) => i.product_id === dv)!.issue).toBe("no_line");
      // giá bảng B không giải quyết lỗi của bảng mặc định A
      await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [bookB, lines([dv, 1_000_000])]);
      expect((await val<{ missing_products: number }>(q, "select price_health()")).missing_products).toBe(base.missing_products + 1);
      // bảng mặc định ngừng dùng
      await q("update price_books set is_active = false where id = $1", [bookA]);
      expect((await val<{ items: { product_id: string; issue: string }[] }>(q, "select price_health()")).items.find((i) => i.product_id === dv)!.issue).toBe("default_inactive");
      await q("update price_books set is_active = true where id = $1", [bookA]);
      // giá 0 là hợp lệ
      await q("select save_price_lines($1, (select version from price_books where id = $1), $2::jsonb)", [bookA, lines([dv, 0])]);
      const ok = await val<{ missing_products: number }>(q, "select price_health()");
      expect(ok.missing_products).toBe(base.missing_products);
      const cmp = await val<{ pct_unavailable_reason: string; rows: { diff_pct: number | null; book_name: string }[] }>(q, "select price_compare($1)", [dv]);
      expect(cmp.pct_unavailable_reason).toContain("bằng 0"); // giá tham chiếu 0 → không tính được %
      expect(cmp.rows.find((r) => r.book_name === "Bảng B")!.diff_pct).toBeNull();
    });
  });

  it("so sánh giá: chênh lệch bằng tiền và % so với giá ở bảng mặc định", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const cmp = await val<{ reference: number; rows: { book_name: string; diff: number; diff_pct: number; is_default: boolean }[] }>(q, "select price_compare($1)", [f.dv]);
      expect(Number(cmp.reference)).toBe(5_000_000);
      const p = cmp.rows.find((r) => r.book_name === "Bảng giá đối tác")!;
      expect([Number(p.diff), Number(p.diff_pct)]).toEqual([-500_000, -10]);
      expect(cmp.rows[0]!.is_default).toBe(true);
    });
  });

  it("danh sách sản phẩm lọc / sắp xếp / phân trang ở CSDL; danh mục / đơn vị: số đang dùng và chặn ngừng khi còn sản phẩm", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const l = await val<{ total: number; counts: Record<string, number>; rows: { code: string; default_price: number; price_issue: string | null }[] }>(q, "select product_list('DV001')");
      expect(l.total).toBe(1);
      expect(l.rows[0]).toMatchObject({ code: "DV001", price_issue: null });
      expect(Number(l.rows[0]!.default_price)).toBe(5_000_000);
      const pg = await val<{ total: number; rows: unknown[] }>(q, "select product_list(null, null, null, null, null, 'name', 'asc', 2, 0)");
      expect(pg.rows).toHaveLength(2);
      expect(pg.total).toBeGreaterThan(2);
      const units = await val<{ id: string; name: string; active_count: number }[]>(q, "select catalog_usage('unit')");
      expect(units.find((u) => u.id === f.unit)!.active_count).toBeGreaterThanOrEqual(1);
      await expectError(q("update product_units set is_active = false where id = $1", [f.unit]), "sản phẩm đang bán");
      await as(U.ketoan);
      await expectError(q("select save_product(null, 'X')"), "quyền");
    });
  });

  it("tệp sản phẩm: người có quyền tải ảnh / tài liệu; chỉ người xem CRM đọc; cộng tác viên không đọc", async () => {
    await scenario(async (q, as) => {
      const f = await fixture(q, as);
      const img = await val<string>(q, "select add_product_file($1, 'image', 'anh.png', 'image/png', 'iVBORw0KGgo=')", [f.dv]);
      const doc = await val<string>(q, "select add_product_file($1, 'document', 'bang-gia.pdf', 'application/pdf', 'JVBERg==')", [f.dv]);
      expect(await val(q, "select image_file_id from products where id = $1", [f.dv])).toBe(img);
      await as(U.ketoan);
      expect(await val(q, "select (get_product_file($1))->>'name'", [doc])).toBe("bang-gia.pdf");
      await expectError(q("select add_product_file($1, 'document', 'x.pdf', 'application/pdf', 'JVBERg==')", [f.dv]), "quyền");
      await as(U.ctv);
      expect(await q("select id from product_files")).toHaveLength(0);
    });
  });
});
