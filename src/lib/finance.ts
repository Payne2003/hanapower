import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DATE_RE, METHODS, monthRange, UUID_RE } from "@/lib/finance-ui";

// Truy vấn Thu chi: mọi tổng / lọc / phân trang chạy ở CSDL trên TOÀN BỘ tập lọc (không cộng trên trang đang xem);
// hàm là security invoker nên quyền xem của người dùng quyết định cả dòng lẫn tổng.

type SP = Record<string, string | undefined>;
export type FinanceQuery = {
  from: string; to: string; source?: string; customer?: string; project?: string; dept?: string; owner?: string; method?: string; voucher?: string; kind?: string;
  status: string; category?: string; general: boolean; approval?: string; sort: string; dir: "asc" | "desc"; page: number; size: number;
};

/** Đọc bộ lọc từ URL (mã phải là UUID, ngày đúng định dạng, giá trị còn lại thuộc danh sách). Mặc định: tháng hiện tại. */
export function parseFinanceQuery(sp: SP, today: string, size = 20): FinanceQuery {
  const [mFrom, mTo] = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const uuid = (v?: string) => (v && UUID_RE.test(v) ? v : undefined);
  return {
    from: DATE_RE.test(sp.tu ?? "") ? sp.tu! : mFrom, to: DATE_RE.test(sp.den ?? "") ? sp.den! : mTo,
    source: uuid(sp.nguon), customer: uuid(sp.kh), project: uuid(sp.da), dept: uuid(sp.pb), owner: uuid(sp.pt), category: uuid(sp.lc),
    method: METHODS.includes(sp.ht ?? "") ? sp.ht : undefined, voucher: sp.ct === "has" || sp.ct === "missing" ? sp.ct : undefined,
    kind: sp.loai === "milestone" || sp.loai === "other" ? sp.loai : undefined, status: sp.tt === "cancelled" || sp.tt === "all" ? sp.tt : "confirmed",
    general: sp.chung === "1", approval: ["draft", "submitted", "approved", "rejected"].includes(sp.dv ?? "") ? sp.dv : undefined,
    sort: ["date", "amount", "project"].includes(sp.sx ?? "") ? sp.sx! : "date", dir: sp.chieu === "asc" ? "asc" : "desc",
    page: Math.max(1, Math.floor(Number(sp.trang) || 1)), size,
  };
}

export function financeParams(q: Partial<FinanceQuery>, extra: Record<string, string | undefined> = {}): string {
  const p: Record<string, string | undefined> = {
    tu: q.from, den: q.to, nguon: q.source, kh: q.customer, da: q.project, pb: q.dept, pt: q.owner, lc: q.category, ht: q.method, ct: q.voucher, loai: q.kind,
    tt: q.status && q.status !== "confirmed" ? q.status : undefined, chung: q.general ? "1" : undefined, dv: q.approval,
    sx: q.sort && q.sort !== "date" ? q.sort : undefined, chieu: q.dir === "asc" ? "asc" : undefined, trang: q.page && q.page > 1 ? String(q.page) : undefined, ...extra,
  };
  const e = Object.entries(p).filter(([, v]) => v);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

export type IncomeRow = {
  id: string; occurred_on: string; amount: string; status: string; description: string | null; invoice_no: string | null; payment_method: string | null; cancel_reason: string | null;
  project_id: string | null; project_code: string | null; project_name: string | null; customer_id: string | null; customer_name: string | null;
  source_id: string | null; source_name: string | null; milestone_id: string | null; is_milestone: boolean; milestone_name: string | null;
  department_id: string | null; department_name: string | null; owner_id: string | null; owner_name: string | null; file_count: number;
};
export type ExpenseRow = {
  id: string; occurred_on: string; amount: string; approval: string; payment: string; description: string | null; invoice_url: string | null; payment_method: string | null;
  due_date: string | null; payee_name: string | null; project_id: string | null; project_code: string | null; project_name: string | null; category_id: string | null; category_name: string | null;
  department_id: string | null; department_name: string | null; owner_id: string | null; owner_name: string | null; file_count: number; has_voucher: boolean;
};
export type IncomeList = { total: number; sum: string; sum_milestone: string; sum_other: string; missing_voucher: number; rows: IncomeRow[] };
export type ExpenseList = { total: number; sum: string; sum_pending: string; missing_voucher: number; rows: ExpenseRow[] };

export type Overview = {
  from: string; to: string; income: string; income_count: number; expense: string; expense_count: number; diff: string;
  open_total: string; open_count: number; overdue_total: string; overdue_count: number; due7_total: string; due7_count: number; expected_in_range: string;
  pending_expense_count: number; missing_income_voucher: number; missing_expense_voucher: number;
  series: { month: string; income: string; expense: string; expected: string }[];
};
export type ReceivableItem = {
  milestone_id: string; milestone: string; amount: string; due_date: string | null; payment: string; acceptance: string; invoice_no: string | null; project_id: string; project_code: string; project_name: string;
  customer_id: string | null; customer_name: string; days_late: number | null; bucket: string; managers: string; next_action: string;
};
export type Receivables = {
  total: string; count: number; buckets: Record<string, { amount: string; count: number }>;
  groups: { key: string; name: string; total: string; count: number; max_late: number; items: ReceivableItem[] }[];
};
export type PeriodMonth = { month: number; income: string; expense: string; diff: string; income_count: number; expense_count: number; closed: boolean; has_note: boolean; mismatch: boolean };
export type PeriodDetail = {
  year: number; month: number; from: string; to: string; income: string; income_count: number; expense: string; expense_count: number; diff: string; note: string | null;
  closed: boolean; closed_at: string | null; closed_by: string | null; closed_income: string | null; closed_expense: string | null; income_gap: string | null; expense_gap: string | null;
  reopened_at: string | null; reopen_reason: string | null; pending_expense_count: number; expected_amount: string; expected_open: string; late_receipts_amount: string; late_receipts_count: number;
};
export type Report = { dim: string; from: string; to: string; rows: { key: string | null; label: string; income: string; expense: string; diff: string; expected: string }[]; income: string; expense: string; expected: string };
export type Reconcile = { count: number; by_kind: Record<string, number>; items: { kind: string; sev: string; ref_type: string; ref_id: string | null; project_id: string | null; label: string; detail: string; amount: string; dt: string | null }[] };

async function rpc<T>(name: string, args: Record<string, unknown>, what: string): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`Không tải được ${what}: ${error.message}`);
  return data as T;
}

export const incomeArgs = (q: FinanceQuery, paging = true) => ({
  p_from: q.from, p_to: q.to, p_source: q.source ?? null, p_customer: q.customer ?? null, p_project: q.project ?? null, p_dept: q.dept ?? null, p_owner: q.owner ?? null,
  p_method: q.method ?? null, p_voucher: q.voucher ?? null, p_kind: q.kind ?? null, p_status: q.status, p_sort: q.sort, p_dir: q.dir,
  p_limit: paging ? q.size : 100000, p_offset: paging ? (q.page - 1) * q.size : 0,
});
export const expenseArgs = (q: FinanceQuery, paging = true) => ({
  p_from: q.from, p_to: q.to, p_category: q.category ?? null, p_project: q.project ?? null, p_general: q.general, p_dept: q.dept ?? null, p_owner: q.owner ?? null,
  p_method: q.method ?? null, p_voucher: q.voucher ?? null, p_approval: q.approval ?? null, p_sort: q.sort, p_dir: q.dir,
  p_limit: paging ? q.size : 100000, p_offset: paging ? (q.page - 1) * q.size : 0,
});

export const getIncomes = (q: FinanceQuery) => rpc<IncomeList>("income_list", incomeArgs(q), "danh sách khoản thu");
export const getExpenses = (q: FinanceQuery) => rpc<ExpenseList>("expense_list", expenseArgs(q), "danh sách khoản chi");
export const getOverview = (from: string, to: string) => rpc<Overview>("finance_overview", { p_from: from, p_to: to }, "tổng quan thu chi");
export const getReceivables = (group: string, customer?: string, project?: string, bucket?: string) =>
  rpc<Receivables>("receivables", { p_group: group, p_customer: customer ?? null, p_project: project ?? null, p_bucket: bucket ?? null }, "phải thu theo mốc");
export const getPeriodsYear = (year: number) => rpc<PeriodMonth[]>("finance_periods_year", { p_year: year }, "các kỳ tài chính");
export const getPeriodDetail = (year: number, month: number) => rpc<PeriodDetail>("finance_period_detail", { p_year: year, p_month: month }, "kỳ tài chính");
export const getReport = (dim: string, from: string, to: string) => rpc<Report>("finance_report", { p_dim: dim, p_from: from, p_to: to }, "báo cáo");
export const getReconcile = (year?: number, month?: number) => rpc<Reconcile>("finance_reconcile", { p_year: year ?? null, p_month: month ?? null }, "đối chiếu");

export type FinanceLookups = {
  projects: [string, string][]; customers: [string, string][]; departments: [string, string][]; people: [string, string][];
  sources: [string, string][]; categories: [string, string][];
};
export async function getFinanceLookups(): Promise<FinanceLookups> {
  const supabase = await createSupabaseServerClient();
  const [p, d, pe, s, c] = await Promise.all([
    supabase.from("projects").select("id, code, name, customer_id").is("deleted_at", null).order("code").limit(500),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name").limit(500),
    supabase.from("income_sources").select("id, name").eq("is_active", true).order("name"),
    supabase.from("expense_categories").select("id, name").eq("is_active", true).order("name"),
  ]);
  const projects = (p.data ?? []) as { id: string; code: string; name: string; customer_id: string | null }[];
  const custIds = [...new Set(projects.map((x) => x.customer_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (custIds.length) {
    // Tên khách hàng đã có trong danh sách dự án (project_list) — ở đây chỉ cần cho bộ lọc nên lấy tên qua hàm theo quyền xem dự án.
    const { data } = await supabase.rpc("project_list", { p_limit: 500 });
    for (const r of ((data as { rows?: { customer_id: string | null; customer_name: string | null }[] } | null)?.rows ?? [])) if (r.customer_id && r.customer_name) names.set(r.customer_id, r.customer_name);
  }
  return {
    projects: projects.map((x) => [x.id, `${x.code} – ${x.name}`]), customers: custIds.filter((id) => names.has(id)).map((id) => [id, names.get(id)!] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], "vi")),
    departments: (d.data ?? []).map((x) => [x.id as string, x.name as string]), people: (pe.data ?? []).map((x) => [x.id as string, x.full_name as string]),
    sources: (s.data ?? []).map((x) => [x.id as string, x.name as string]), categories: (c.data ?? []).map((x) => [x.id as string, x.name as string]),
  };
}
