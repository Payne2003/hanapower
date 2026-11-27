// Kiểm thử CRM → báo giá → hợp đồng → dự án → tài chính → cộng tác viên → lương trên CSDL thật.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, switchUser, U, withUser, type Q } from "./helpers";

const ID = {
  acc1: "00000000-0000-4000-d000-000000000001",
  acc2: "00000000-0000-4000-d000-000000000002",
  opp1: "00000000-0000-4000-d400-000000000001", // đã thắng, có hợp đồng
  opp2: "00000000-0000-4000-d400-000000000002", // đang thương lượng
  pr1: "00000000-0000-4000-d700-000000000001",
  ct1: "00000000-0000-4000-d600-000000000001",
  m1: "00000000-0000-4000-d800-000000000001",
  m2: "00000000-0000-4000-d800-000000000002",
  fl: "00000000-0000-4000-d900-000000000001",
};

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

describe("CRM: phân quyền xem", () => {
  it("quản lý / kế toán xem được CRM; Content & Editor không", async () => {
    await withUser(c, U.leader, async (q) => expect((await q("select id from accounts")).length).toBeGreaterThanOrEqual(2));
    await withUser(c, U.ketoan, async (q) => expect((await q("select id from accounts")).length).toBeGreaterThanOrEqual(2));
    await withUser(c, U.hieu, async (q) => expect(await q("select id from accounts")).toHaveLength(0));
    await withUser(c, U.hieu, async (q) => expect(await q("select id from quotes")).toHaveLength(0));
  });
  it("kế toán chỉ xem, không ghi trực tiếp vào CRM", async () => {
    await withUser(c, U.ketoan, async (q) => {
      await expectError(q("insert into accounts (org_id, name) values (app.current_org_id(), 'Thử')"), /42501|row-level/);
    });
  });
  it("người ngoài doanh nghiệp không thấy gì", async () => {
    await withUser(c, U.outsider, async (q) => {
      expect(await q("select id from accounts")).toHaveLength(0);
      expect(await q("select id from projects")).toHaveLength(0);
    });
  });
  it("quản lý ghi trực tiếp được tài khoản; không đặt được khách ở doanh nghiệp khác", async () => {
    await withUser(c, U.leader, async (q) => {
      const r = await one<{ id: string }>(q, "insert into accounts (org_id, name) values (app.current_org_id(), 'Khách mới') returning id");
      expect(r.id).toBeTruthy();
      await expectError(q("insert into accounts (org_id, name) values ('00000000-0000-4000-a000-000000000002', 'Lậu')"), /42501|row-level/);
    });
  });
});

describe("CRM: lead → cơ hội → báo giá → hợp đồng → đơn hàng → dự án", () => {
  it("chuyển đổi lead tạo tài khoản + liên hệ + cơ hội, không chuyển đổi hai lần", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const lead = await one<{ id: string }>(q, "select id from leads where company = 'Studio Sao Mai'");
      const r = await one<{ convert_lead: Record<string, string> }>(q, "select convert_lead($1, null, null, true)", [lead.id]);
      expect(r.convert_lead.account_id && r.convert_lead.contact_id && r.convert_lead.opportunity_id).toBeTruthy();
      const l = await one<{ is_converted: boolean; status: string }>(q, "select is_converted, status from leads where id = $1", [lead.id]);
      expect(l).toMatchObject({ is_converted: true, status: "converted" });
      await expectError(q("select convert_lead($1)", [lead.id]), "đã được chuyển đổi");
    });
  });

  it("báo giá chụp lại sản phẩm; đổi sản phẩm sau đó không làm đổi báo giá cũ", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      await expectError(q("select create_quote($1)", [ID.opp1]), "đã đóng"); // cơ hội đã thắng
      const id = (await one<{ create_quote: string }>(q, "select create_quote($1, current_date + 14, 'Gói tháng 12')", [ID.opp2])).create_quote;
      const before = await one<{ total: string; code: string }>(q, "select total, code from quotes where id = $1", [id]);
      expect(before.code).toMatch(/^BG\d{4}$/);
      expect(Number(before.total)).toBeCloseTo(15000000 * 6 * 1.08, 0);
      await q("update opportunity_products set quantity = 12 where opportunity_id = $1", [ID.opp2]);
      expect(Number((await one<{ total: string }>(q, "select total from quotes where id = $1", [id])).total)).toBe(Number(before.total));
      expect((await q("select id from quote_items where quote_id = $1", [id])).length).toBe(1);
    });
  });

  it("quy trình trạng thái báo giá: duyệt cần quản lý; chỉ lập hợp đồng khi khách chấp nhận", async () => {
    await scenario(async (q, as) => {
      await as(U.truongnhom);
      const id = (await one<{ create_quote: string }>(q, "select create_quote($1, null, null)", [ID.opp2])).create_quote;
      await expectError(q("select set_quote_status($1, 'sent')", [id]), "Không chuyển");
      await q("select set_quote_status($1, 'pending_approval')", [id]);
      await expectError(q("select set_quote_status($1, 'approved')", [id]), "quản lý");
      await as(U.leader);
      await q("select set_quote_status($1, 'approved')", [id]);
      await expectError(q("select create_contract($1)", [id]), "chấp nhận");
      await q("select set_quote_status($1, 'sent')", [id]);
      await q("select set_quote_status($1, 'accepted')", [id]);
      const ct = (await one<{ create_contract: string }>(q, "select create_contract($1, current_date, current_date + 180, null)", [id])).create_contract;
      await expectError(q("select create_contract($1)", [id]), "đang mở");
      await q("select set_contract_status($1, 'pending')", [ct]);
      await q("select set_contract_status($1, 'active')", [ct]);
      const opp = await one<{ stage: string; forecast: string }>(q, "select stage, forecast from opportunities where id = $1", [ID.opp2]);
      expect(opp).toMatchObject({ stage: "won", forecast: "closed" });
      await expectError(q("select set_opportunity_stage($1, 'negotiation')", [ID.opp2]), "đã thắng");
      const order = (await one<{ create_order: string }>(q, "select create_order($1)", [ct])).create_order;
      await q("select set_order_status($1, 'active')", [order]);
      const pr = (await one<{ create_project_from_contract: string }>(q, "select create_project_from_contract($1, $2)", [ct, U.leader])).create_project_from_contract;
      await expectError(q("select create_project_from_contract($1)", [ct]), "đã có dự án");
      const p = await one<{ code: string; customer_id: string; contract_id: string }>(q, "select code, customer_id, contract_id from projects where id = $1", [pr]);
      expect(p).toMatchObject({ code: "DA0002", customer_id: ID.acc2, contract_id: ct });
      expect((await q("select id from project_milestones where project_id = $1", [pr])).length).toBe(1);
    });
  });

  it("hợp đồng chỉ được kích hoạt bởi quản lý; thua cơ hội cần lý do", async () => {
    await scenario(async (q, as) => {
      await as(U.truongnhom);
      await expectError(q("select set_opportunity_stage($1, 'lost')", [ID.opp2]), "lý do");
      await q("select set_opportunity_stage($1, 'presentation')", [ID.opp2]);
      expect((await one<{ win_probability: string }>(q, "select win_probability from opportunities where id = $1", [ID.opp2])).win_probability).toBe("40.00");
      await as(U.hieu);
      await expectError(q("select set_opportunity_stage($1, 'presentation')", [ID.opp2]), "quyền");
    });
  });
});

describe("Dự án: thành viên, tiền, mốc nghiệm thu", () => {
  it("thành viên thấy dự án nhưng không thấy tiền; người ngoài dự án không thấy dự án", async () => {
    await withUser(c, U.hieu, async (q) => {
      expect(await q("select id from projects where id = $1", [ID.pr1])).toHaveLength(1);
      expect(await q("select * from project_budgets")).toHaveLength(0);
      expect(await q("select * from project_milestones")).toHaveLength(0);
      expect(await q("select * from incomes")).toHaveLength(0);
    });
    await withUser(c, U.hoa, async (q) => expect(await q("select id from projects")).toHaveLength(0));
    await withUser(c, U.ketoan, async (q) => {
      expect(await q("select id from projects")).toHaveLength(1);
      expect(await q("select * from project_budgets")).toHaveLength(1);
    });
  });

  it("tạo dự án: cần quyền, khách hàng, thành viên hợp lệ; mã tăng dần", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q("select create_project('X', 'client', $1)", [ID.acc1]), "quyền");
      await as(U.truongnhom);
      await expectError(q("select create_project('X', 'client', null)"), "khách hàng");
      await expectError(q("select create_project('X', 'client', $1, null, null, null, null, 0, 0, array[$2]::uuid[])", [ID.acc1, U.ctv]), "không hợp lệ");
      const id = (await one<{ create_project: string }>(q, "select create_project('Dự án nội bộ', 'internal', null, null, null, null, null, 0, 0, array[$1]::uuid[])", [U.hoa])).create_project;
      expect((await one<{ code: string }>(q, "select code from projects where id = $1", [id])).code).toBe("DA0002");
      await as(U.hoa);
      expect(await q("select id from projects where id = $1", [id])).toHaveLength(1);
    });
  });

  it("chỉ quản lý dự án sửa / nghiệm thu; đóng dự án cần nghiệm thu hết mốc", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q("select set_project_stage($1, 'on_hold')", [ID.pr1]), "quyền");
      await as(U.leader);
      await expectError(q("select set_project_stage($1, 'completed')", [ID.pr1]), "chưa nghiệm thu");
      await q("select milestone_acceptance($1, true)", [ID.m2]);
      await q("select set_project_stage($1, 'completed')", [ID.pr1]);
      await expectError(q("select milestone_acceptance($1, false)", [ID.m1]), "hóa đơn");
    });
  });

  it("hóa đơn chỉ khi đã nghiệm thu; kế toán thu tiền tạo khoản thu và công nợ giảm", async () => {
    await scenario(async (q, as) => {
      await as(U.ketoan);
      await expectError(q("select milestone_invoice($1, 'HD-9')", [ID.m2]), "chưa nghiệm thu");
      await as(U.leader);
      await q("select milestone_acceptance($1, true)", [ID.m2]);
      await as(U.ketoan);
      await q("select milestone_invoice($1, 'HD-9')", [ID.m2]);
      const inc = (await one<{ milestone_pay: string }>(q, "select milestone_pay($1)", [ID.m2])).milestone_pay;
      expect(inc).toBeTruthy();
      expect((await one<{ payment: string }>(q, "select payment from project_milestones where id = $1", [ID.m2])).payment).toBe("paid");
      expect((await one<{ milestone_pay: string }>(q, "select milestone_pay($1)", [ID.m2])).milestone_pay).toBe(inc); // idempotent
      await expectError(q("select save_milestone($1, $2, 'x', 1)", [ID.pr1, ID.m2]), "quyền");
    });
  });
});

describe("Tài chính: chi phí duyệt → thanh toán, tạm ứng", () => {
  it("nhân viên đề nghị chi → chờ duyệt → kế toán duyệt → chi; không tự duyệt, không chi khi chưa duyệt", async () => {
    await scenario(async (q, as) => {
      await as(U.duy);
      const id = (await one<{ create_expense: string }>(q, "select create_expense(current_date, 500000, null, $1, null, 'vendor', 'Cửa hàng A', 'Mua ổ cứng', null, null, null, true)", [ID.pr1])).create_expense;
      await expectError(q("select decide_expense($1, 'approve')", [id]), "quyền");
      await expectError(q("select pay_expense($1)", [id]), "quyền");
      await as(U.ketoan);
      await expectError(q("select pay_expense($1)", [id]), "chưa");
      await q("select decide_expense($1, 'approve')", [id]);
      await q("select pay_expense($1)", [id]);
      expect((await one<{ payment: string }>(q, "select payment from expenses where id = $1", [id])).payment).toBe("paid");
      await expectError(q("select delete_expense($1)", [id]), "đã thanh toán");
    });
  });

  it("người làm không xem được chi phí của người khác ngoài dự án mình", async () => {
    await withUser(c, U.hoa, async (q) => expect(await q("select id from expenses")).toHaveLength(0));
    await withUser(c, U.duy, async (q) => expect((await q("select id from expenses where requested_by <> auth.uid()")).length).toBe(0));
  });

  it("tạm ứng: đề nghị → duyệt → giải ngân → quyết toán", async () => {
    await scenario(async (q, as) => {
      await as(U.duy);
      const id = (await one<{ request_advance: string }>(q, "select request_advance($1, 2000000, 'Đi quay ngoại cảnh')", [ID.pr1])).request_advance;
      await as(U.ketoan);
      await q("select decide_advance($1, 'approve', null)", [id]);
      await q("select disburse_advance($1)", [id]);
      expect((await one<{ status: string }>(q, "select status from advances where id = $1", [id])).status).toBe("disbursed");
    });
  });
});

describe("Cộng tác viên", () => {
  it("cộng tác viên chỉ thấy việc của mình và không thấy dữ liệu nội bộ", async () => {
    await withUser(c, U.ctv, async (q) => {
      expect(await q("select id from freelance_assignments")).toHaveLength(1);
      for (const t of ["videos", "projects", "accounts", "expenses", "incomes", "payroll_lines", "salary_profiles", "channels", "audit_logs"]) {
        expect(await q(`select 1 from ${t}`), t).toHaveLength(0);
      }
      expect(await q("select id from profiles")).toHaveLength(1);
      await expectError(q("select create_expense(current_date, 1000)"), "quyền");
      await expectError(q("select create_project('x', 'internal')"), "quyền");
    });
  });

  it("giao việc → nhận → bàn giao → nghiệm thu tạo đề nghị chi → kế toán duyệt & chi cập nhật trạng thái thanh toán", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const a = (await one<{ id: string }>(q, "select id from freelance_assignments limit 1")).id;
      await expectError(q("select assignment_action($1, 'deliver', 'https://x.example/a')", [a]), "nhận việc");
      await as(U.ctv);
      await q("select assignment_action($1, 'accept')", [a]);
      await expectError(q("select assignment_action($1, 'deliver', 'khong-phai-link')", [a]), "link");
      await q("select assignment_action($1, 'deliver', 'https://x.example/thumb.zip')", [a]);
      await expectError(q("select assignment_action($1, 'approve')", [a]), "người giao việc");
      await as(U.leader);
      await q("select assignment_action($1, 'revise', null, 'Chữ to hơn')", [a]);
      await as(U.ctv);
      await q("select assignment_action($1, 'deliver', 'https://x.example/thumb2.zip')", [a]);
      await as(U.leader);
      await q("select assignment_action($1, 'approve')", [a]);
      const row = await one<{ status: string; expense_id: string; payment: string }>(q, "select status, expense_id, payment from freelance_assignments where id = $1", [a]);
      expect(row).toMatchObject({ status: "approved", payment: "unpaid" });
      expect(row.expense_id).toBeTruthy();
      await as(U.ketoan);
      await q("select decide_expense($1, 'approve')", [row.expense_id]);
      await q("select pay_expense($1)", [row.expense_id]);
      expect((await one<{ payment: string }>(q, "select payment from freelance_assignments where id = $1", [a])).payment).toBe("paid");
    });
  });

  it("người không có quyền không giao việc / sửa hồ sơ; thông tin ngân hàng chỉ kế toán + chính chủ", async () => {
    await scenario(async (q, as) => {
      await as(U.hoa);
      await expectError(q("select assign_freelancer($1, 'x', 100)", [ID.fl]), "quyền");
      expect(await q("select * from freelancer_payment_info")).toHaveLength(0);
      await as(U.ketoan);
      expect(await q("select * from freelancer_payment_info")).toHaveLength(1);
      await as(U.ctv);
      expect(await q("select * from freelancer_payment_info")).toHaveLength(1);
    });
  });
});

describe("Lương", () => {
  it("lương chỉ nhân sự / kế toán xem; nhân viên chỉ xem hồ sơ của mình", async () => {
    await withUser(c, U.hieu, async (q) => {
      const r = await q("select user_id from salary_profiles");
      expect(r).toHaveLength(1);
      expect(r[0]!.user_id).toBe(U.hieu);
    });
    await withUser(c, U.nhansu, async (q) => expect((await q("select user_id from salary_profiles")).length).toBeGreaterThan(5));
    await withUser(c, U.hoa, async (q) => expect(await q("select * from payroll_periods")).toHaveLength(0));
  });

  it("tính lương: công thực tế, phụ cấp, bảo hiểm, thưởng dự án đã duyệt; luồng nhân sự kiểm tra → kế toán duyệt → chi trả", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const [y, m] = [2026, 10];
      await q("select fill_attendance($1, '2026-10-01', '2026-10-31')", [U.hieu]); // 22 ngày T2–T6
      await q("select set_attendance($1, '2026-10-05', 'leave_unpaid')", [U.hieu]);
      await as(U.leader);
      const bonus = (await one<{ request_project_bonus: string }>(q, "select request_project_bonus($1, $2, 1500000, '2026-10-20', 'Hoàn thành sớm')", [ID.pr1, U.hieu])).request_project_bonus;
      await as(U.ketoan);
      await q("select decide_project_bonus($1, true)", [bonus]);
      await as(U.nhansu);
      const period = (await one<{ generate_payroll: string }>(q, "select generate_payroll($1, $2)", [y, m])).generate_payroll;
      const line = await one<Record<string, string>>(q, "select * from payroll_lines where period_id = $1 and user_id = $2", [period, U.hieu]);
      // 23 ngày T2–T6 trong tháng 10/2026, trừ 1 ngày nghỉ không lương (05/10 là Chủ nhật → không nằm trong fill) → kiểm tra theo dữ liệu thực
      const worked = Number((await one<{ n: string }>(q, "select count(*) n from attendance_records where user_id = $1 and status = 'present' and work_date between '2026-10-01' and '2026-10-31'", [U.hieu])).n);
      expect(Number(line.worked_days)).toBe(Math.min(worked, 26));
      expect(Number(line.base_pay)).toBeCloseTo((12000000 * Math.min(worked, 26)) / 26, 0);
      expect(Number(line.allowances)).toBe(730000);
      expect(Number(line.bonuses)).toBe(1500000);
      expect(Number(line.insurance)).toBeCloseTo(12000000 * 0.105, 0);
      expect(Number(line.net_pay)).toBeCloseTo(Number(line.base_pay) + 730000 + 1500000 - Number(line.insurance), 0);
      await q("select add_payroll_item($1, 'deduction', 'Tạm ứng trừ lương', 500000)", [line.id]);
      expect(Number((await one<{ net_pay: string }>(q, "select net_pay from payroll_lines where id = $1", [line.id])).net_pay)).toBeCloseTo(Number(line.net_pay) - 500000, 0);
      await expectError(q("select payroll_step($1, 'approve')", [period]), /42501/);
      await q("select payroll_step($1, 'check')", [period]);
      await expectError(q("select generate_payroll($1, $2)", [y, m]), "mở lại");
      await expectError(q("select set_attendance($1, '2026-10-06', 'absent')", [U.hieu]), "khóa");
      await as(U.ketoan);
      await expectError(q("select payroll_step($1, 'pay')", [period]), "chưa được duyệt");
      await q("select payroll_step($1, 'approve')", [period]);
      await q("select payroll_step($1, 'pay')", [period]);
      await expectError(q("select payroll_step($1, 'reopen', 'sai')", [period]), "đã chi trả");
      // nhân viên xem được phiếu lương của mình sau khi duyệt, không xem của người khác
      await as(U.hieu);
      const mine = await q("select user_id from payroll_lines");
      expect(mine).toHaveLength(1);
      expect(mine[0]!.user_id).toBe(U.hieu);
    });
  });

  it("người kiểm tra không tự duyệt; thưởng không tự duyệt; nhân viên không tự chấm công hộ người khác", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      await q("select generate_payroll(2026, 9)");
      const p = (await one<{ id: string }>(q, "select id from payroll_periods where month = 9")).id;
      await q("select payroll_step($1, 'check')", [p]);
      await expectError(q("select payroll_step($1, 'approve')", [p]), /42501/);
      await as(U.hieu);
      await expectError(q("select set_attendance($1, '2026-11-02', 'present')", [U.hieu]), "quyền");
      await q("select check_in()");
      expect((await q("select id from attendance_records")).length).toBe(1);
    });
  });
});

describe("Nhập khách hàng từ Excel (import_crm) và thông tin công ty", () => {
  it("nhập tài khoản: bỏ trùng tên / MST, gán đúng người phụ trách; người không có quyền bị từ chối", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q(`select import_crm('accounts', '[{"name":"X"}]'::jsonb)`), /42501|quyền/);
      await as(U.leader);
      const rows = JSON.stringify([
        { name: "Công ty Nhập 1", tax_code: "0777777777", phones: ["0901111222"], emails: ["A@X.vn"], owner_id: U.hoa },
        { name: "  công  ty nhập 1 " }, // trùng tên (chuẩn hóa khoảng trắng / hoa thường) với dòng trước
        { name: "Công ty Nông sản Xanh khác", tax_code: "0312345678" }, // trùng MST với dữ liệu mẫu
        { name: "" },
      ]);
      const r = await one<{ import_crm: { inserted: number; skipped: number } }>(q, "select import_crm('accounts', $1::jsonb)", [rows]);
      expect(r.import_crm).toMatchObject({ inserted: 1, skipped: 3 });
      const a = await one<{ owner_id: string; emails: string[] }>(q, "select owner_id, emails from accounts where name = 'Công ty Nhập 1'");
      expect(a.owner_id).toBe(U.hoa);
      expect(a.emails).toEqual(["a@x.vn"]);
      const again = await one<{ import_crm: { inserted: number } }>(q, "select import_crm('accounts', $1::jsonb)", [rows]);
      expect(again.import_crm.inserted).toBe(0); // nhập lại cùng tệp an toàn
    });
  });

  it("nhập liên hệ: gắn công ty có sẵn, bỏ tham chiếu sai, tự tạo công ty mới khi được phép", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const rows = JSON.stringify([
        { last_name: "Nguyễn Thu", first_name: "Hà", account_id: ID.acc1, emails: ["ha.thu2@x.vn"] },
        { last_name: "Lê", first_name: "Bình", account_name: "Công ty Hoàn Toàn Mới" },
        { last_name: "Phạm", first_name: "An", account_id: "00000000-0000-4000-d000-0000000000ff", owner_id: U.outsider },
      ]);
      const none = await one<{ import_crm: { inserted: number; accounts_created: number } }>(q, "select import_crm('contacts', $1::jsonb, false)", [rows]);
      expect(none.import_crm).toMatchObject({ inserted: 3, accounts_created: 0 });
    });
    await scenario(async (q, as) => {
      await as(U.leader);
      const rows = JSON.stringify([{ last_name: "Lê", first_name: "Bình", account_name: "Công ty Hoàn Toàn Mới" }, { last_name: "Võ", first_name: "Cường", account_name: "công ty hoàn toàn mới" }]);
      const r = await one<{ import_crm: { inserted: number; accounts_created: number } }>(q, "select import_crm('contacts', $1::jsonb, true)", [rows]);
      expect(r.import_crm).toMatchObject({ inserted: 2, accounts_created: 1 });
      const c = await q("select account_id from contacts where first_name in ('Bình','Cường')");
      expect(new Set(c.map((x) => x.account_id)).size).toBe(1);
      const own = await q("select owner_id from contacts where first_name = 'Cường'");
      expect(own[0]!.owner_id).toBe(U.leader);
    });
  });

  it("nhập lead: bỏ trùng email / điện thoại với lead có sẵn; trạng thái và mức độ đúng kiểu", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const rows = JSON.stringify([
        { last_name: "Quang", first_name: "Trần", phones: ["0912000111"] }, // trùng điện thoại với lead mẫu "Studio Sao Mai"
        { last_name: "Nam", first_name: "Hoàng", company: "Studio X", status: "contacted", rating: "hot", emails: ["nam@x.vn"] },
      ]);
      const r = await one<{ import_crm: { inserted: number; skipped: number } }>(q, "select import_crm('leads', $1::jsonb)", [rows]);
      expect(r.import_crm).toMatchObject({ inserted: 1, skipped: 1 });
      const l = await one<{ status: string; rating: string }>(q, "select status, rating from leads where company = 'Studio X'");
      expect(l).toMatchObject({ status: "contacted", rating: "hot" });
      await expectError(q(`select import_crm('khac', '[]'::jsonb)`), "không hợp lệ");
    });
  });

  it("thông tin công ty: chỉ quản trị sửa; báo giá PDF đọc được qua RLS", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      await expectError(q("select save_org_profile('a','b','c@d.vn','e','f','g')"), /42501|quản trị/);
      await as(U.admin);
      await expectError(q("select save_org_profile('a','b','không-phải-email','e','f','g')"), "Email");
      await q("select save_org_profile('Quận 7', '0901', 'lienhe@hanamedia.vn', 'hanamedia.vn', '0312345678', 'Vietcombank')");
      const o = await one<{ address: string; bank_info: string }>(q, "select address, bank_info from organizations");
      expect(o).toMatchObject({ address: "Quận 7", bank_info: "Vietcombank" });
    });
  });
});

describe("Nhập sản phẩm từ Excel và sửa hợp đồng", () => {
  it("nhập sản phẩm: bỏ trùng tên / mã, tự tạo danh mục & đơn vị chỉ khi được phép", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q(`select import_crm('products', '[{"name":"X"}]'::jsonb)`), /42501|quyền/);
      await as(U.leader);
      const rows = JSON.stringify([
        { name: "Dịch vụ A", code: "DVA", list_price: 1500000, category_name: "Nhóm mới", unit_name: "Buổi" },
        { name: "Dịch vụ B", code: "dvA" }, // trùng mã (không phân biệt hoa thường) với dòng trước
        { name: "Dựng hậu kỳ video" }, // trùng tên với dữ liệu mẫu
        { name: "Dịch vụ C", list_price: -5 },
        { name: "Dịch vụ D", list_price: 200000, is_active: "false" },
      ]);
      const no = await one<{ import_crm: Record<string, number> }>(q, "select import_crm('products', $1::jsonb, false)", [rows]);
      expect(no.import_crm).toMatchObject({ inserted: 2, skipped: 3, lookups_created: 0 });
      expect((await q("select 1 from product_categories where name = 'Nhóm mới'")).length).toBe(0);
    });
    await scenario(async (q, as) => {
      await as(U.leader);
      const rows = JSON.stringify([{ name: "Dịch vụ A", list_price: 1500000, category_name: "nhóm MỚI", unit_name: "Buổi" }, { name: "Dịch vụ E", category_name: "Nhóm mới", unit_name: "buổi" }]);
      const r = await one<{ import_crm: Record<string, number> }>(q, "select import_crm('products', $1::jsonb, true)", [rows]);
      expect(r.import_crm).toMatchObject({ inserted: 2, lookups_created: 2 });
      const p = await q("select category_id, unit_id, list_price from products where name in ('Dịch vụ A','Dịch vụ E') order by name");
      expect(p[0]!.category_id).toBe(p[1]!.category_id);
      expect(p[0]!.unit_id).toBe(p[1]!.unit_id);
      expect(Number(p[0]!.list_price)).toBe(1500000);
    });
  });

  it("sửa hợp đồng: nháp sửa được điều khoản bổ sung và ngày; đã hiệu lực chỉ ghi nhận chữ ký; người không có quyền bị từ chối", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const quote = (await one<{ create_quote: string }>(q, "select create_quote($1)", [ID.opp2])).create_quote;
      await q("select set_quote_status($1, 'pending_approval')", [quote]);
      await q("select set_quote_status($1, 'approved')", [quote]);
      await q("select set_quote_status($1, 'sent')", [quote]);
      await q("select set_quote_status($1, 'accepted')", [quote]);
      const ct = (await one<{ create_contract: string }>(q, "select create_contract($1)", [quote])).create_contract;
      await q("select update_contract($1, '2026-12-01', '2027-05-31', 'Thanh toán trong 7 ngày', 'Anh Tuấn', '2026-11-25', null)", [ct]);
      const a = await one<{ note: string; duration_months: number; customer_signed_by: string }>(q, "select note, duration_months, customer_signed_by from contracts where id = $1", [ct]);
      expect(a).toMatchObject({ note: "Thanh toán trong 7 ngày", duration_months: 6, customer_signed_by: "Anh Tuấn" });
      await expectError(q("select update_contract($1, '2027-06-01', '2027-05-01', null, null, null, null)", [ct]), "Ngày hết hạn");
      await q("select set_contract_status($1, 'pending')", [ct]);
      await q("select set_contract_status($1, 'active')", [ct]);
      await q("select update_contract($1, '2026-12-01', '2027-05-31', 'Thanh toán trong 7 ngày', 'Anh Tuấn', '2026-11-25', '2026-11-26')", [ct]);
      await expectError(q("select update_contract($1, '2026-12-02', '2027-05-31', 'Thanh toán trong 7 ngày', 'Anh Tuấn', '2026-11-25', '2026-11-26')", [ct]), "chỉ ghi nhận");
      await as(U.hieu);
      await expectError(q("select update_contract($1, null, null, null, null, null, null)", [ct]), /42501|quyền/);
    });
  });
});
