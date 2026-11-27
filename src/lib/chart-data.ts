import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardCharts = {
  videos_by_stage: { stage: string; count: number }[];
  videos_weekly: { week: string; created: number; published: number }[];
  headcount: { name: string; count: number }[];
  projects_by_stage: { stage: string; count: number }[];
  opp_by_stage?: { stage: string; count: number; value: number }[];
  leads_by_status?: { status: string; count: number }[];
  leads_by_source?: { name: string; count: number }[];
  top_accounts?: { name: string; value: number }[];
  revenue_expense?: { month: string; income: number; expense: number }[];
};

export type SalesReport = {
  kpi: { open_count: number; open_value: number; weighted: number; won_count: number; lost_count: number; won_value: number; avg_deal: number; cycle_days: number };
  forecast: { month: string; value: number; weighted: number }[];
  won_by_month: { month: string; value: number }[];
  lead_sources: { name: string; leads: number; converted: number }[];
  quote_funnel: { status: string; count: number }[];
  owners: { name: string; open_value: number; won_value: number; count: number }[];
  lost_reasons: { name: string; count: number }[];
  attention: { quotes_expiring: number; contracts_expiring: number; opps_overdue: number; leads_stale: number };
};

export async function getDashboardCharts(): Promise<DashboardCharts | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("dashboard_charts");
  if (error) return null; // biểu đồ là phần phụ: lỗi thì ẩn, không làm hỏng cả trang
  return data as DashboardCharts;
}

export async function getSalesReport(): Promise<SalesReport | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sales_report");
  if (error) throw new Error(`Không tải được báo cáo bán hàng: ${error.message}`);
  return (data as SalesReport | null) ?? null;
}

/** "2026-11" → "T11" (kèm năm khi khác năm hiện tại). */
export const monthLabel = (ym: string) => `T${Number(ym.slice(5, 7))}`;
export const weekLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
