// Dữ liệu demo: phủ mọi bảng, nạp lại không nhân đôi, gỡ sạch về đúng trạng thái trước đó. Chạy trên doanh nghiệp thứ hai của dữ liệu mẫu.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, newClient, OTHER_ORG } from "./helpers";

let c: pg.Client;
const run = (...args: string[]) => execFileSync(process.execPath, ["scripts/seed-demo.mjs", ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });

async function counts(): Promise<Record<string, number>> {
  const { rows } = await c.query<{ t: string; n: number }>(
    `select relname t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', relname), false, true, '')))[1]::text::int n
     from pg_class cl join pg_namespace ns on ns.oid = cl.relnamespace where ns.nspname = 'public' and cl.relkind = 'r'`);
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

beforeAll(async () => { c = newClient(); await c.connect(); });
afterAll(async () => { try { run("--remove", "--org", "Công ty Khác (kiểm thử đa doanh nghiệp)"); } finally { await c?.end(); } });

describe("dữ liệu demo", () => {
  it("nạp: mọi bảng đều có dữ liệu; nạp lại không nhân đôi; gỡ về đúng như ban đầu", async () => {
    const before = await counts();
    const org = ["--org", "Công ty Khác (kiểm thử đa doanh nghiệp)"];
    expect(() => run(...org)).toThrow(); // thiếu mật khẩu
    run("--password", "DemoMatKhau#1", ...org);
    const after = await counts();
    const empty = Object.entries(after).filter(([, n]) => n === 0).map(([t]) => t);
    expect(empty, `bảng còn trống: ${empty.join(", ")}`).toEqual([]);
    run("--password", "DemoMatKhau#1", ...org);
    expect(await counts()).toEqual(after);
    // dữ liệu demo nằm đúng doanh nghiệp được chọn, không đụng doanh nghiệp còn lại
    const { rows } = await c.query("select org_id, count(*)::int n from public.videos where id::text like 'dede%' group by 1");
    expect(rows).toEqual([{ org_id: OTHER_ORG, n: 37 }]);
    run("--remove", ...org);
    const gone = await counts();
    const diff = Object.keys(before).filter((t) => before[t] !== gone[t] && t !== "org_counters");
    expect(diff, `bảng chưa về như cũ: ${diff.join(", ")}`).toEqual([]);
  });

  it("số liệu demo nhất quán: tổng báo giá = tổng dòng; bảng lương cộng đúng; ràng buộc video; công nợ không âm", async () => {
    run("--password", "DemoMatKhau#1", "--org", "Công ty Khác (kiểm thử đa doanh nghiệp)");
    const q1 = await c.query("select count(*)::int bad from public.quotes q where id::text like 'dede%' and abs(q.total - (select sum(amount) from public.quote_items i where i.quote_id = q.id)) >= 1");
    expect(q1.rows[0].bad).toBe(0);
    const q2 = await c.query("select count(*)::int bad from public.payroll_lines where period_id::text like 'dede%' and abs(net_pay - (base_pay + allowances + bonuses - insurance - tax - deductions)) >= 0.01");
    expect(q2.rows[0].bad).toBe(0);
    const q3 = await c.query("select count(*)::int n from public.payroll_lines where period_id::text like 'dede%'");
    expect(q3.rows[0].n).toBe(22);
    const q4 = await c.query("select count(*)::int bad from public.project_financials where project_id::text like 'dede%' and (receivable < 0 or payable < 0 or revenue < 0)");
    expect(q4.rows[0].bad).toBe(0);
    const q5 = await c.query("select count(distinct role)::int n from public.user_roles where user_id::text like 'dede%'");
    expect(q5.rows[0].n).toBeGreaterThanOrEqual(6); // quản trị, quản lý, trưởng nhóm, content, editor, kế toán, nhân sự, cộng tác viên
  });
});
