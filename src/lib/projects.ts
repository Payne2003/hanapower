import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_COLS, PROJECT_COLS, PROJECT_VIEWS, UUID_RE } from "@/lib/finance-ui";

// Truy vấn Dự án: lọc / sắp xếp / phân trang / tổng hợp tiền chạy ở CSDL (project_list, project_money); RLS quyết định dòng nào thấy được.

export type ProjectRow = {
  id: string; code: string; name: string; kind: string; stage: string; customer_id: string | null; customer_name: string | null;
  start_date: string | null; end_date: string | null; progress: number; risk_level: "low" | "medium" | "high"; risk_note: string | null; payment_terms: string | null;
  manager_ids: string[]; manager_names: string[]; member_count: number; is_manager: boolean; is_member: boolean;
  money_ok: boolean; contract_value: string | null; budget_cost: string | null; revenue: string | null; cost: string | null;
  open_receivable: string | null; overdue_count: number | null; overdue_amount: string | null; max_overdue_days: number | null; due7_count: number | null;
  next_due: string | null; next_name: string | null; next_amount: string | null; late: boolean; over_budget: boolean; effective_risk: "low" | "medium" | "high"; risk_flags: string[];
};
export type ProjectList = { total: number; rows: ProjectRow[]; counts: Record<string, number>; stages: Record<string, number> };
export type ProjectMoney = {
  contract_value: string | null; budget_cost: string | null; income: string; income_count: number; expense: string; expense_pending: string; diff: string;
  schedule_total: string; schedule_paid: string; schedule_open: string; milestone_count: number; overdue_count: number; overdue_amount: string;
  unallocated: string | null; budget_remaining: string | null; cost_structure: { category: string; amount: string }[];
};

export type ProjectQuery = { q: string; stage?: string; view: string; customer?: string; display: "bang" | "kanban" | "dong-thoi"; sort: string; dir: "asc" | "desc"; page: number; size: number; cols: string[]; pick?: string };
type SP = Record<string, string | undefined>;
const STAGES = ["planning", "in_progress", "acceptance", "completed", "on_hold", "cancelled"];
const SORTS = ["name", "code", "customer", "progress", "stage", "risk", "end", "next"];

export function parseProjectQuery(sp: SP, size = 20): ProjectQuery {
  const display = sp.bd === "kanban" ? "kanban" : sp.bd === "dong-thoi" ? "dong-thoi" : "bang";
  const colKeys = PROJECT_COLS.map(([k]) => k);
  const cols = (sp.cot ?? "").split(",").filter((c) => colKeys.includes(c));
  return {
    q: (sp.q ?? "").slice(0, 80), stage: STAGES.includes(sp.gd ?? "") ? sp.gd : undefined,
    view: PROJECT_VIEWS.some(([k]) => k && k === sp.xem) ? sp.xem! : "",
    customer: sp.kh && UUID_RE.test(sp.kh) ? sp.kh : undefined, display,
    sort: SORTS.includes(sp.sx ?? "") ? sp.sx! : "name", dir: sp.chieu === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.floor(Number(sp.trang) || 1)), size, cols: cols.length ? cols : DEFAULT_COLS, pick: sp.chon && UUID_RE.test(sp.chon) ? sp.chon : undefined,
  };
}

/** Chuỗi truy vấn của bộ lọc (không gồm trang / dự án đang xem nhanh) — dùng cho liên kết, góc nhìn đã lưu và đường quay lại. */
export function projectParams(q: Partial<ProjectQuery>, extra: Record<string, string | undefined> = {}): string {
  const p: Record<string, string | undefined> = {
    q: q.q || undefined, gd: q.stage, xem: q.view || undefined, kh: q.customer, bd: q.display && q.display !== "bang" ? q.display : undefined,
    sx: q.sort && q.sort !== "name" ? q.sort : undefined, chieu: q.dir === "desc" ? "desc" : undefined,
    trang: q.page && q.page > 1 ? String(q.page) : undefined, cot: q.cols && q.cols.join(",") !== DEFAULT_COLS.join(",") ? q.cols.join(",") : undefined, ...extra,
  };
  const e = Object.entries(p).filter(([, v]) => v);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

export async function getProjectList(q: ProjectQuery): Promise<ProjectList> {
  const supabase = await createSupabaseServerClient();
  const all = q.display !== "bang";
  const { data, error } = await supabase.rpc("project_list", {
    p_q: q.q || null, p_stage: q.stage ?? null, p_view: q.view || null, p_customer: q.customer ?? null,
    p_sort: q.sort, p_dir: q.dir, p_limit: all ? 500 : q.size, p_offset: all ? 0 : (q.page - 1) * q.size,
  });
  if (error) throw new Error(`Không tải được danh sách dự án: ${error.message}`);
  return data as ProjectList;
}

export async function getProjectMoney(id: string): Promise<ProjectMoney | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("project_money", { p_id: id });
  if (error) throw new Error(`Không tải được số liệu tiền của dự án: ${error.message}`);
  return (data as ProjectMoney | null) ?? null;
}

export type HistoryItem = { at: string; action: string; by: string | null; details: Record<string, unknown> };
export async function getProjectHistory(id: string): Promise<HistoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("project_history", { p_id: id, p_limit: 30 });
  return (data as HistoryItem[] | null) ?? [];
}

export type SavedView = { id: string; name: string; params: string };
export async function getSavedViews(scope: "project" | "finance"): Promise<SavedView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("saved_views").select("id, name, params").eq("scope", scope).order("name");
  return (data ?? []) as SavedView[];
}
