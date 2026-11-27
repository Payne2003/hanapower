// Nghiệm thu nâng cấp "Dự án" và "Thu chi & công nợ" trên CSDL thật:
// luồng ghi nhận thu MỘT cửa, đối soát số liệu, kỳ tài chính, chứng từ, phân quyền, nhắc việc.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, setIdentity, switchUser, U, ORG, type Q } from "./helpers";

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
const dayOffset = (n: number) => `(current_date + (${n}))`;

type Fx = { acc: string; pr: string; m: string[]; catHauKy: string };
/** Một khách, một dự án video, hai quản lý (leader + trưởng nhóm), ba thành viên, ba đợt thu 30 / 40 / 30 triệu. */
async function fixture(q: Q, as: (u: string | null) => Promise<void>): Promise<Fx> {
  await as(U.leader);
  const acc = (await one<{ id: string }>(q, "insert into accounts (org_id, name) values (app.current_org_id(), 'Khách nghiệm thu') returning id")).id;
  const pr = await val<string>(
    q,
    "select create_project('Video quảng bá nghiệm thu', 'client', $1, $2, current_date - 10, current_date + 50, null, 100000000, 40000000, array[$3, $4, $5]::uuid[])",
    [acc, U.leader, U.hieu, U.duy, U.hoa],
  );
  await q("select set_project_managers($1, array[$2, $3]::uuid[])", [pr, U.leader, U.truongnhom]);
  const m: string[] = [];
  for (const [i, [name, amt]] of ([["Tạm ứng", 30_000_000], ["Giữa kỳ", 40_000_000], ["Bàn giao", 30_000_000]] as const).entries()) {
    m.push(await val<string>(q, `select save_milestone($1, null, $2, $3, ${dayOffset(i === 0 ? -3 : i === 1 ? 10 : 40)})`, [pr, name, amt]));
  }
  const catHauKy = await val<string>(q, "select id from expense_categories where name = 'Hậu kỳ' limit 1");
  return { acc, pr, m, catHauKy };
}

/** Dữ liệu mẫu có chi chờ duyệt trong tháng — gỡ khỏi hàng chờ (trong giao dịch kiểm thử) trước khi chốt kỳ. */
async function clearPending() {
  await c.query("reset role");
  await c.query("update expenses set approval = 'rejected', reject_reason = 'test' where approval = 'submitted' and project_id is distinct from null and false");
  await c.query("update expenses set approval = 'rejected', reject_reason = 'test' where approval = 'submitted'");
}

async function approvedExpense(q: Q, as: (u: string | null) => Promise<void>, pr: string | null, cat: string, amount: number, date = "current_date") {
  if (pr === null) {
    // chi không gắn dự án: chỉ kế toán đề nghị; người duyệt tài chính (quản lý) duyệt
    await as(U.ketoan);
    const g = await val<string>(q, `select create_expense(${date}, $1, $2, null, null, 'vendor', 'Văn phòng', 'Chi chung', null, null, null, true)`, [amount, cat]);
    await as(U.leader);
    await q("select decide_expense($1, 'approve')", [g]);
    return g;
  }
  await as(U.duy);
  const id = await val<string>(q, `select create_expense(${date}, $1, $2, $3, null, 'vendor', 'Dựng phim', 'Dựng phim', null, null, null, true)`, [amount, cat, pr]);
  await as(U.ketoan);
  await q("select decide_expense($1, 'approve')", [id]);
  return id;
}

describe("Ghi nhận thu theo mốc — luồng một cửa", () => {
  it("kịch bản nghiệm thu: thu 30tr, chi 12tr → thu 30tr, chi 12tr, chênh lệch 18tr, còn 70tr theo lịch, chỉ mốc quá hạn tính quá hạn", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      const r = await one<{ record_milestone_receipt: { income_id: string; already: boolean; amount: string } }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      expect(r.record_milestone_receipt.already).toBe(false);
      await approvedExpense(q, as, fx.pr, fx.catHauKy, 12_000_000);
      await as(U.ketoan);
      const money = await val<Record<string, unknown>>(q, "select project_money($1)", [fx.pr]);
      expect(Number(money.income)).toBe(30_000_000);
      expect(Number(money.expense)).toBe(12_000_000);
      expect(Number(money.diff)).toBe(18_000_000);
      expect(Number(money.schedule_open)).toBe(70_000_000);
      expect(Number(money.schedule_paid)).toBe(30_000_000);
      expect(Number(money.unallocated)).toBe(0); // 30+40+30 = 100tr hợp đồng
      expect(Number(money.budget_remaining)).toBe(28_000_000); // ngân sách chi 40tr − 12tr
      expect(Number(money.overdue_count)).toBe(0); // mốc 1 đã thu; mốc 2 còn 10 ngày
      const ms = await q("select payment, (select count(*) from incomes i where i.milestone_id = m.id and i.status = 'confirmed')::int n from project_milestones m where id = $1", [fx.m[0]]);
      expect(ms[0]).toMatchObject({ payment: "paid", n: 1 });
      // chỉ mốc quá hạn mới là quá hạn
      await as(U.leader);
      await q("update project_milestones set due_date = current_date - 5 where id = $1", [fx.m[1]]).catch(() => undefined);
    });
  });

  it("bấm hai lần / gửi lại chỉ tạo đúng một khoản thu; số tiền khác mốc bị từ chối", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      await expectError(q("select record_milestone_receipt($1, 10000000)", [fx.m[0]]), "khác số tiền mốc");
      expect(await val(q, "select payment from project_milestones where id = $1", [fx.m[0]])).toBe("unpaid");
      expect(await val(q, "select count(*)::int from incomes where project_id = $1", [fx.pr])).toBe(0);
      const a = await val<{ income_id: string }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      const b = await val<{ income_id: string; already: boolean }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      expect(b.already).toBe(true);
      expect(b.income_id).toBe(a.income_id);
      // tên cũ dùng cùng luồng
      expect(await val(q, "select milestone_pay($1)", [fx.m[0]])).toBe(a.income_id);
      expect(await val(q, "select count(*)::int from incomes where milestone_id = $1", [fx.m[0]])).toBe(1);
      expect(await val(q, "select sum(amount)::bigint from incomes where project_id = $1", [fx.pr])).toBe("30000000");
    });
  });

  it("hai kế toán xác nhận đồng thời (hai kết nối): đúng một khoản thu 30tr", async () => {
    // Cần dữ liệu đã COMMIT để hai kết nối thấy — dọn bằng tay cuối bài.
    const admin = newClient();
    await admin.connect();
    const a = newClient();
    const b = newClient();
    await a.connect();
    await b.connect();
    let pr = "";
    let acc = "";
    try {
      acc = (await admin.query("insert into accounts (org_id, name) values ($1, 'Khách đồng thời') returning id", [ORG])).rows[0].id;
      pr = (await admin.query(
        "insert into projects (org_id, code, name, kind, customer_id, stage, manager_id) values ($1, 'DAZZ99', 'Đồng thời', 'client', $2, 'in_progress', $3) returning id",
        [ORG, acc, U.leader],
      )).rows[0].id;
      const ms = (await admin.query(
        "insert into project_milestones (org_id, project_id, name, amount, due_date, sort_order) values ($1, $2, 'Đợt 1', 30000000, current_date, 0) returning id",
        [ORG, pr],
      )).rows[0].id as string;
      await a.query("begin");
      await b.query("begin");
      await setIdentity(a, U.ketoan);
      await setIdentity(b, U.ketoan);
      const ra = await a.query("select record_milestone_receipt($1) r", [ms]); // A giữ khóa dòng mốc
      const pb = b.query("select record_milestone_receipt($1) r", [ms]); // B chờ khóa
      await new Promise((r) => setTimeout(r, 400));
      await a.query("commit");
      const rb = await pb;
      await b.query("commit");
      expect(ra.rows[0].r.already).toBe(false);
      expect(rb.rows[0].r.already).toBe(true);
      expect(rb.rows[0].r.income_id).toBe(ra.rows[0].r.income_id);
      const n = await admin.query("select count(*)::int n, sum(amount)::bigint s from incomes where milestone_id = $1 and status = 'confirmed'", [ms]);
      expect(n.rows[0]).toMatchObject({ n: 1, s: "30000000" });
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      if (pr) {
        await admin.query("delete from incomes where project_id = $1", [pr]);
        await admin.query("delete from audit_logs where entity_type = 'milestone' and details ->> 'project' = 'DAZZ99'");
        await admin.query("delete from projects where id = $1", [pr]);
      }
      if (acc) await admin.query("delete from accounts where id = $1", [acc]);
      await a.end();
      await b.end();
      await admin.end();
    }
  });

  it("lỗi giữa chừng không để lại mốc 'đã thu' không có khoản thu: kỳ đã chốt chặn cả giao dịch", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await clearPending();
      await as(U.ketoan);
      await q("select close_finance_period(extract(year from current_date)::int, extract(month from current_date)::int)");
      await expectError(q("select record_milestone_receipt($1)", [fx.m[0]]), "Kỳ tài chính đã chốt");
      expect(await val(q, "select payment from project_milestones where id = $1", [fx.m[0]])).toBe("unpaid");
      expect(await val(q, "select count(*)::int from incomes where project_id = $1", [fx.pr])).toBe(0);
      await as(U.leader);
      await q("select reopen_finance_period(extract(year from current_date)::int, extract(month from current_date)::int, 'Bổ sung giao dịch')");
      await as(U.ketoan);
      const r = await val<{ already: boolean }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      expect(r.already).toBe(false);
    });
  });

  it("mốc đến hạn tháng trước, thu tháng này: nằm trong lịch tháng trước và thực thu tháng này (theo ngày nghiệp vụ)", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      await q("update project_milestones set due_date = (date_trunc('month', current_date) - interval '10 days')::date where id = $1", [fx.m[0]]).catch(async () => {
        await as(U.leader);
        await q("select save_milestone($1, $2, 'Tạm ứng', 30000000, (date_trunc('month', current_date) - interval '10 days')::date)", [fx.pr, fx.m[0]]);
        await as(U.ketoan);
      });
      if ((await val<string>(q, "select to_char(due_date, 'YYYY-MM') from project_milestones where id = $1", [fx.m[0]])) === (await val<string>(q, "select to_char(current_date, 'YYYY-MM')"))) {
        await as(U.leader);
        await q("select save_milestone($1, $2, 'Tạm ứng', 30000000, (date_trunc('month', current_date) - interval '10 days')::date)", [fx.pr, fx.m[0]]);
        await as(U.ketoan);
      }
      const prev = await one<{ y: number; m: number }>(q, "select extract(year from date_trunc('month', current_date) - interval '1 month')::int y, extract(month from date_trunc('month', current_date) - interval '1 month')::int m");
      const cur = await one<{ y: number; m: number }>(q, "select extract(year from current_date)::int y, extract(month from current_date)::int m");
      const before = await val<Record<string, string>>(q, "select finance_period_detail($1, $2)", [prev.y, prev.m]);
      expect(Number(before.expected_amount)).toBeGreaterThanOrEqual(30_000_000); // nằm trong lịch tháng đến hạn
      await q("select record_milestone_receipt($1)", [fx.m[0]]); // thu hôm nay (tháng này)
      const prevD = await val<Record<string, string>>(q, "select finance_period_detail($1, $2)", [prev.y, prev.m]);
      const curD = await val<Record<string, string>>(q, "select finance_period_detail($1, $2)", [cur.y, cur.m]);
      expect(Number(prevD.expected_open)).toBe(Number(before.expected_open) - 30_000_000); // hết khỏi danh sách còn phải thu
      expect(Number(prevD.income)).toBe(Number(before.income)); // thực thu KHÔNG vào tháng trước
      expect(Number(curD.late_receipts_amount)).toBeGreaterThanOrEqual(30_000_000); // vào tháng này, đánh dấu thu muộn
      expect(Number(curD.income)).toBeGreaterThanOrEqual(30_000_000);
    });
  });

  it("hủy khoản thu giữ vết, mốc trở lại 'đã xuất hóa đơn' và thu lại được; không còn một mốc hai khoản thu hiệu lực", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      const a = await val<{ income_id: string }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      await expectError(q("select cancel_income($1, '')", [a.income_id]), "lý do");
      await q("select cancel_income($1, 'Nhập nhầm ngày')", [a.income_id]);
      expect(await val(q, "select payment from project_milestones where id = $1", [fx.m[0]])).toBe("invoiced");
      const kept = await one<{ milestone_id: string | null; cancelled_milestone_id: string }>(q, "select milestone_id, cancelled_milestone_id from incomes where id = $1", [a.income_id]);
      expect(kept.milestone_id).toBeNull();
      expect(kept.cancelled_milestone_id).toBe(fx.m[0]);
      const b = await val<{ income_id: string; already: boolean }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      expect(b.already).toBe(false);
      expect(b.income_id).not.toBe(a.income_id);
      expect(await val(q, "select count(*)::int from incomes where milestone_id = $1 and status = 'confirmed'", [fx.m[0]])).toBe(1);
    });
  });
});

describe("Không nhân đôi số liệu; chi chung; chứng từ", () => {
  it("hai quản lý, ba thành viên, ba chứng từ không làm tăng tổng; danh sách / báo cáo / dự án khớp nhau", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      const { income_id } = await val<{ income_id: string }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      for (const n of ["a.png", "b.png", "c.png"]) await q("select add_finance_file('income', $1, $2, 'image/png', 'iVBORw0KGgo=')", [income_id, n]);
      const list = await val<{ total: number; sum: string; rows: { file_count: number }[]; missing_voucher: number }>(q, "select income_list(null, null, null, null, $1)", [fx.pr]);
      expect(list.total).toBe(1);
      expect(Number(list.sum)).toBe(30_000_000);
      expect(list.rows[0]!.file_count).toBe(3);
      expect(list.missing_voucher).toBe(0);
      const money = await val<Record<string, string>>(q, "select project_money($1)", [fx.pr]);
      expect(Number(money.income)).toBe(30_000_000);
      const rows = await val<{ total: number; rows: { id: string; revenue: string; manager_names: string[]; member_count: number }[] }>(q, "select project_list($1)", ["Video quảng bá nghiệm thu"]);
      expect(rows.total).toBe(1);
      expect(Number(rows.rows[0]!.revenue)).toBe(30_000_000);
      expect(rows.rows[0]!.manager_names).toHaveLength(2);
      expect(rows.rows[0]!.member_count).toBe(5); // leader + truongnhom (quản lý) + hieu, duy, hoa — mỗi người đúng một lần
      const rep = await val<{ income: string }>(q, "select finance_report('project')");
      expect(Number(rep.income)).toBe(Number(await val(q, "select coalesce(sum(amount), 0) from incomes where status = 'confirmed' and occurred_on between date_trunc('year', current_date) and current_date")));
      const none = await val<{ total: number }>(q, "select income_list(null, null, null, null, $1, null, null, null, 'missing')", [fx.pr]);
      expect(none.total).toBe(0);
    });
  });

  it("khoản chi chung không gắn dự án: không vào tổng dự án, có trong danh sách 'chi chung' và báo cáo", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await approvedExpense(q, as, null, fx.catHauKy, 5_000_000);
      await approvedExpense(q, as, fx.pr, fx.catHauKy, 12_000_000);
      await as(U.ketoan);
      expect(Number((await val<Record<string, string>>(q, "select project_money($1)", [fx.pr])).expense)).toBe(12_000_000);
      const g = await val<{ rows: { project_id: string | null; amount: string }[]; sum: string }>(q, "select expense_list(null, null, null, null, true)");
      expect(g.rows.every((r) => r.project_id === null)).toBe(true);
      expect(Number(g.rows.find((r) => Number(r.amount) === 5_000_000)?.amount)).toBe(5_000_000);
      const rep = await val<{ rows: { key: string | null; label: string; expense: string }[] }>(q, "select finance_report('project')");
      expect(rep.rows.find((r) => r.key === null)?.label).toBe("Chi chung (không gắn dự án)");
    });
  });

  it("báo cáo theo phòng ban dùng phòng ban CỦA GIAO DỊCH, không theo phòng ban hiện tại của nhân viên", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      const id = await approvedExpense(q, as, fx.pr, fx.catHauKy, 2_000_000);
      await as(U.ketoan);
      await q("select set_transaction_scope('expense', $1, '00000000-0000-4000-b000-000000000003')", [id]);
      const rep = await val<{ rows: { key: string | null; expense: string }[] }>(q, "select finance_report('department')");
      expect(Number(rep.rows.find((r) => r.key === "00000000-0000-4000-b000-000000000003")?.expense)).toBe(2_000_000);
    });
  });
});

describe("Phân quyền", () => {
  it("quản lý dự án KHÔNG có quyền xác nhận đã thu; nhân viên không thấy tiền, danh sách thu, tổng quan", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.leader);
      await expectError(q("select record_milestone_receipt($1)", [fx.m[0]]), "quyền");
      await as(U.truongnhom);
      await expectError(q("select record_milestone_receipt($1)", [fx.m[0]]), "quyền");
      await as(U.hieu); // thành viên dự án
      const l = await val<{ rows: { id: string; money_ok: boolean; revenue: string | null; contract_value: string | null; next_name: string | null }[] }>(q, "select project_list($1)", ["Video quảng bá nghiệm thu"]);
      expect(l.rows).toHaveLength(1);
      expect(l.rows[0]).toMatchObject({ money_ok: false, revenue: null, contract_value: null, next_name: null });
      expect(await val(q, "select project_money($1)", [fx.pr])).toBeNull();
      expect(await val(q, "select count(*)::int from project_milestones where project_id = $1", [fx.pr])).toBe(0);
      await expectError(q("select finance_overview()"), "quyền");
      await expectError(q("select finance_reconcile()"), "quyền");
      const il = await val<{ total: number; sum: string }>(q, "select income_list()");
      expect(il.total).toBe(0);
      await expectError(q("select receivables()"), "quyền");
      await as(U.hoa); // thành viên, không phải quản lý
      await expectError(q("select set_project_managers($1, array[$2]::uuid[])", [fx.pr, U.hoa]), "quyền");
    });
  });

  it("tài khoản cộng tác viên không đọc được bảng nội bộ mới (tài liệu, chứng từ, kỳ, quản lý)", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      const { income_id } = await val<{ income_id: string }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      await q("select add_finance_file('income', $1, 'a.png', 'image/png', 'iVBORw0KGgo=')", [income_id]);
      await as(U.ctv);
      for (const t of ["project_managers", "project_files", "finance_files", "finance_periods", "saved_views"]) expect(await q(`select 1 from ${t}`)).toHaveLength(0);
      expect(await val(q, "select get_finance_file(id) from finance_files limit 1")).toBeUndefined();
    });
  });

  it("danh sách dự án chỉ gồm dự án người xem được; người ngoài doanh nghiệp không thấy gì", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ctv);
      expect((await val<{ total: number }>(q, "select project_list($1)", ["Video quảng bá nghiệm thu"])).total).toBe(0);
      await as(U.outsider);
      expect((await val<{ total: number }>(q, "select project_list()")).total).toBe(0);
      await as(U.truongnhom); // quản lý được thêm → thấy
      expect((await val<{ total: number }>(q, "select project_list($1)", ["Video quảng bá nghiệm thu"])).total).toBe(1);
      expect(fx.pr).toBeTruthy();
    });
  });

  it("chứng từ: kế toán đính kèm khoản thu; người ngoài không đọc được tệp; chi: người đề nghị đính kèm khi còn nháp", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.ketoan);
      const { income_id } = await val<{ income_id: string }>(q, "select record_milestone_receipt($1)", [fx.m[0]]);
      const f = await val<string>(q, "select add_finance_file('income', $1, 'phieu-thu.png', 'image/png', 'iVBORw0KGgo=')", [income_id]);
      await expectError(q("select add_finance_file('income', $1, 'x', 'image/png', 'AAAA')", [income_id.replace(/.$/, "0")]), "Không tìm thấy");
      await as(U.hieu);
      expect(await q("select id from finance_files where id = $1", [f])).toHaveLength(0);
      expect(await val(q, "select get_finance_file($1)", [f])).toBeNull();
      await expectError(q("select add_finance_file('income', $1, 'x', 'image/png', 'AAAA')", [income_id]), "kế toán");
      await as(U.duy);
      const e = await val<string>(q, "select create_expense(current_date, 100000, null, $1, null, 'vendor', 'A', 'B', null, null, null, false)", [fx.pr]);
      await q("select add_finance_file('expense', $1, 'hd.png', 'image/png', 'iVBORw0KGgo=')", [e]);
      await expectError(q("select add_project_file($1, 'quote', 'bao-gia.pdf', 'application/pdf', 'JVBERg==')", [fx.pr]), "quyền");
    });
  });
});

describe("Kỳ tài chính, đối chiếu, nhắc việc", () => {
  it("chốt kỳ khóa giao dịch trong kỳ; mở lại cần lý do; chốt cần người duyệt tài chính; không chốt khi còn chi chờ duyệt", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.duy);
      const e = await val<string>(q, "select create_expense(current_date, 100000, null, $1, null, 'vendor', 'A', 'B', null, null, null, true)", [fx.pr]);
      await as(U.hieu);
      await expectError(q("select close_finance_period(extract(year from current_date)::int, extract(month from current_date)::int)"), "duyệt");
      await as(U.ketoan);
      await expectError(q("select close_finance_period(extract(year from current_date)::int, extract(month from current_date)::int)"), "chờ duyệt");
      await q("select decide_expense($1, 'approve')", [e]);
      await clearPending();
      await as(U.ketoan);
      await q("select close_finance_period(extract(year from current_date)::int, extract(month from current_date)::int)");
      const d = await val<Record<string, unknown>>(q, "select finance_period_detail(extract(year from current_date)::int, extract(month from current_date)::int)");
      expect(d.closed).toBe(true);
      expect(Number(d.expense)).toBeGreaterThanOrEqual(100_000);
      await as(U.duy);
      await expectError(q("select create_expense(current_date, 1, null, $1, null, 'vendor', 'A', 'B', null, null, null, false)", [fx.pr]), "đã chốt");
      await as(U.ketoan);
      await expectError(q("select reopen_finance_period(extract(year from current_date)::int, extract(month from current_date)::int, '')"), "lý do");
      await q("select reopen_finance_period(extract(year from current_date)::int, extract(month from current_date)::int, 'Sửa lỗi')");
      expect((await val<Record<string, unknown>>(q, "select finance_period_detail(extract(year from current_date)::int, extract(month from current_date)::int)")).closed).toBe(false);
    });
  });

  it("dữ liệu cũ lệch: liệt kê để xử lý, mở trang KHÔNG tự tạo tiền; ghi nhận tường minh mới tạo khoản thu", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      // giả lập dữ liệu cũ: mốc đã thu nhưng thiếu khoản thu liên kết; dự án chưa có lịch thu
      await c.query("reset role");
      await c.query("update project_milestones set payment = 'paid', paid_at = now() - interval '2 days' where id = $1", [fx.m[2]]);
      await c.query("update projects set stage = 'in_progress' where id = $1", [fx.pr]);
      await as(U.ketoan);
      const incBefore = await val<number>(q, "select count(*)::int from incomes");
      const rec = await val<{ count: number; by_kind: Record<string, number>; items: { kind: string; ref_id: string; amount: string }[] }>(q, "select finance_reconcile()");
      await q("select finance_overview()");
      await q("select receivables()");
      await q("select finance_periods_year(extract(year from current_date)::int)");
      expect(await val<number>(q, "select count(*)::int from incomes")).toBe(incBefore); // xem không sinh tiền
      expect(rec.by_kind.paid_no_income).toBeGreaterThanOrEqual(1);
      const item = rec.items.find((i) => i.kind === "paid_no_income" && i.ref_id === fx.m[2]);
      expect(Number(item?.amount)).toBe(30_000_000);
      expect(rec.by_kind.income_no_voucher ?? 0).toBeGreaterThanOrEqual(0);
      // xử lý: ghi nhận tường minh với ngày thực tế
      await q("select record_milestone_receipt($1, null, current_date - 2)", [fx.m[2]]);
      const after = await val<{ items: { kind: string; ref_id: string }[] }>(q, "select finance_reconcile()");
      expect(after.items.find((i) => i.kind === "paid_no_income" && i.ref_id === fx.m[2])).toBeUndefined();
    });
  });

  it("lệch tổng kỳ đã chốt hiện trong đối chiếu", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await clearPending();
      await as(U.ketoan);
      await q("select record_milestone_receipt($1)", [fx.m[0]]);
      const y = await val<number>(q, "select extract(year from current_date)::int");
      const mth = await val<number>(q, "select extract(month from current_date)::int");
      await q("select close_finance_period($1, $2)", [y, mth]);
      await c.query("reset role");
      await c.query("alter table incomes disable trigger incomes_period_lock");
      await c.query("update incomes set amount = amount + 1000 where project_id = $1", [fx.pr]);
      await c.query("alter table incomes enable trigger incomes_period_lock");
      await as(U.ketoan);
      const rec = await val<{ by_kind: Record<string, number> }>(q, "select finance_reconcile($1, $2)", [y, mth]);
      expect(rec.by_kind.period_mismatch).toBe(1);
      const d = await val<Record<string, string>>(q, "select finance_period_detail($1, $2)", [y, mth]);
      expect(Number(d.income_gap)).toBe(1000);
    });
  });

  it("phải thu theo mốc chia nhóm tuổi nợ; mốc đã thu rời hàng đợi", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.leader);
      await q("select save_milestone($1, $2, 'Tạm ứng', 30000000, current_date - 45)", [fx.pr, fx.m[0]]);
      await as(U.ketoan);
      const r = await val<{ total: string; buckets: Record<string, { amount: string }>; groups: { name: string; items: { milestone_id: string; bucket: string; days_late: number }[] }[] }>(q, "select receivables('customer', $1)", [fx.acc]);
      expect(Number(r.total)).toBe(100_000_000);
      expect(Number(r.buckets.d31_60!.amount)).toBe(30_000_000);
      expect(Number(r.buckets.not_due!.amount)).toBe(70_000_000);
      expect(r.groups[0]!.items.find((i) => i.milestone_id === fx.m[0])).toMatchObject({ bucket: "d31_60", days_late: 45 });
      await q("select record_milestone_receipt($1)", [fx.m[0]]);
      const r2 = await val<{ total: string }>(q, "select receivables('project', null, $1)", [fx.pr]);
      expect(Number(r2.total)).toBe(70_000_000);
      const f = await val<{ count: number }>(q, "select receivables('customer', $1, null, 'd90p')", [fx.acc]);
      expect(f.count).toBe(0);
    });
  });

  it("nhắc việc: mỗi sự kiện đúng một lần, mở thẳng bản ghi", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.leader);
      await q("select save_milestone($1, $2, 'Tạm ứng', 30000000, current_date - 3)", [fx.pr, fx.m[0]]);
      await as(U.ketoan);
      const n1 = await val<number>(q, "select run_finance_reminders()");
      expect(n1).toBeGreaterThanOrEqual(1);
      expect(await val<number>(q, "select run_finance_reminders()")).toBe(0); // lần hai không phát lại
      const nt = await q("select link, message from notifications where user_id = $1 and kind = 'finance_due' and link like $2", [U.ketoan, `%${fx.pr}%`]);
      expect(nt.length).toBe(1);
      expect(nt[0]).toMatchObject({ link: `/du-an/${fx.pr}?tab=thanh-toan` });
    });
  });
});

describe("Dự án: tiến độ, rủi ro, tài liệu, góc nhìn, chế độ xem nhanh", () => {
  it("cập nhật tiến độ / rủi ro bởi quản lý; thành viên thường không được; rủi ro hiển thị bằng chữ", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.hieu);
      await expectError(q("select update_project_progress($1, 50, 'high', 'x')", [fx.pr]), "quyền");
      await as(U.truongnhom);
      await expectError(q("select update_project_progress($1, 150, 'low', null)", [fx.pr]), "0 đến 100");
      await q("select update_project_progress($1, 40, 'high', 'Khách chậm duyệt kịch bản', 'Chuyển khoản 3 đợt')", [fx.pr]);
      await as(U.leader);
      const l = await val<{ rows: { progress: number; effective_risk: string; risk_flags: string[]; payment_terms: string }[]; counts: Record<string, number> }>(q, "select project_list(null, null, 'risk')");
      const row = l.rows.find((r) => r.payment_terms === "Chuyển khoản 3 đợt")!;
      expect(row).toMatchObject({ progress: 40, effective_risk: "high" });
      expect(row.risk_flags).toContain("manual_high");
      expect(l.counts.risk).toBeGreaterThanOrEqual(1);
      const hist = await val<{ action: string }[]>(q, "select project_history($1)", [fx.pr]);
      expect(hist.some((h) => h.action === "project.progress")).toBe(true);
    });
  });

  it("chế độ xem nhanh: tôi quản lý / tôi tham gia / có mốc quá hạn / đến hạn thu 7 ngày", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.truongnhom);
      expect((await val<{ rows: { id: string }[] }>(q, "select project_list(null, null, 'mine')")).rows.some((r) => r.id === fx.pr)).toBe(true);
      await as(U.hieu);
      expect((await val<{ rows: { id: string }[] }>(q, "select project_list(null, null, 'member')")).rows.some((r) => r.id === fx.pr)).toBe(true);
      expect((await val<{ rows: { id: string }[] }>(q, "select project_list(null, null, 'mine')")).rows.some((r) => r.id === fx.pr)).toBe(false);
      await as(U.ketoan);
      // mốc 1 hạn -3 ngày (quá hạn), mốc 2 hạn +10 ngày
      const od = await val<{ rows: { id: string; overdue_count: number; overdue_amount: string; max_overdue_days: number; next_name: string }[] }>(q, "select project_list(null, null, 'overdue_pay')");
      const r = od.rows.find((x) => x.id === fx.pr)!;
      expect(r).toMatchObject({ overdue_count: 1, max_overdue_days: 3, next_name: "Tạm ứng" });
      expect(Number(r.overdue_amount)).toBe(30_000_000);
      expect((await val<{ rows: { id: string }[] }>(q, "select project_list(null, null, 'pay7')")).rows.some((x) => x.id === fx.pr)).toBe(false); // mốc kế tiếp +10 ngày
      await as(U.leader);
      await q("select save_milestone($1, $2, 'Giữa kỳ', 40000000, current_date + 5)", [fx.pr, fx.m[1]]);
      await as(U.ketoan);
      expect((await val<{ rows: { id: string }[] }>(q, "select project_list(null, null, 'pay7')")).rows.some((x) => x.id === fx.pr)).toBe(true);
    });
  });

  it("tài liệu dự án: quản lý thêm, thành viên đọc; báo giá / hợp đồng chỉ người xem được tiền", async () => {
    await scenario(async (q, as) => {
      const fx = await fixture(q, as);
      await as(U.leader);
      const f = await val<string>(q, "select add_project_file($1, 'plan', 'ke-hoach.pdf', 'application/pdf', 'JVBERg==')", [fx.pr]);
      const quote = await val<string>(q, "select add_project_file($1, 'quote', 'bao-gia.pdf', 'application/pdf', 'JVBERg==')", [fx.pr]);
      await as(U.hieu);
      expect(await q("select id from project_files where id = $1", [f])).toHaveLength(1);
      expect(await q("select id from project_files where id = $1", [quote])).toHaveLength(0);
      expect(await val(q, "select get_project_file($1)", [quote])).toBeNull();
      await expectError(q("select add_project_file($1, 'plan', 'x.pdf', 'application/pdf', 'JVBERg==')", [fx.pr]), "quyền");
      await as(U.leader);
      await q("select delete_project_file($1)", [f]);
      expect(await val<number>(q, "select count(*)::int from project_files where id = $1", [f])).toBe(0);
    });
  });

  it("góc nhìn đã lưu là của riêng từng người", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const id = await val<string>(q, "select save_view('project', 'Rủi ro cao', 'view=risk&sort=end')");
      await expectError(q("select save_view('project', 'Xấu', 'a=<script>')"), /check|violates/);
      expect(await q("select id from saved_views")).toHaveLength(1);
      await as(U.ketoan);
      expect(await q("select id from saved_views")).toHaveLength(0);
      await q("select delete_view($1)", [id]);
      await as(U.leader);
      expect(await q("select id from saved_views")).toHaveLength(1);
    });
  });
});
