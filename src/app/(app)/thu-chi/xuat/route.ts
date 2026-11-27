import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";

// Xuất dữ liệu cho kế toán: CSV UTF-8 có BOM (Excel mở đúng tiếng Việt). Chỉ người có quyền xem tài chính.
type R = Record<string, unknown>;
const APPROVAL: Record<string, string> = { draft: "Nháp", submitted: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const PAY: Record<string, string> = { unpaid: "Chưa thanh toán", paid: "Đã thanh toán" };
const PAYEE: Record<string, string> = { employee: "Nhân viên", freelancer: "Cộng tác viên", vendor: "Nhà cung cấp", other: "Khác" };

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const c = ctx as { permissions?: string[] } | null;
  if (!c) return new NextResponse("Chưa đăng nhập", { status: 401 });
  if (!c.permissions?.includes("finance.view")) return new NextResponse("Bạn không có quyền xuất dữ liệu tài chính", { status: 403 });
  const p = req.nextUrl.searchParams;
  const type = p.get("type") ?? "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(p.get("from") ?? "") ? p.get("from")! : "1970-01-01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(p.get("to") ?? "") ? p.get("to")! : "2999-12-31";

  const { data: projs } = await supabase.from("projects").select("id, code, name");
  const pn = new Map((projs ?? []).map((x) => [x.id as string, `${x.code} - ${x.name}`]));
  let header: string[] = [], rows: unknown[][] = [], file = "";

  if (type === "expenses") {
    const [{ data }, { data: cats }] = await Promise.all([
      supabase.from("expenses").select("*").is("deleted_at", null).gte("occurred_on", from).lte("occurred_on", to).order("occurred_on"),
      supabase.from("expense_categories").select("id, name"),
    ]);
    const cn = new Map((cats ?? []).map((x) => [x.id as string, x.name as string]));
    header = ["Ngày", "Dự án", "Loại chi phí", "Người nhận", "Tên người nhận", "Nội dung", "Số tiền", "Hạn thanh toán", "Duyệt", "Ngày duyệt", "Thanh toán", "Ngày thanh toán", "Hình thức", "Chứng từ"];
    rows = ((data ?? []) as R[]).map((e) => [formatDate(e.occurred_on as string), pn.get(String(e.project_id)) ?? "", cn.get(String(e.category_id)) ?? "", PAYEE[String(e.payee_type)] ?? "", e.payee_name ?? "", e.description ?? "", e.amount, formatDate(e.due_date as string | null), APPROVAL[String(e.approval)] ?? "", e.approved_at ? formatDate(String(e.approved_at).slice(0, 10)) : "", PAY[String(e.payment)] ?? "", e.paid_on ? formatDate(e.paid_on as string) : "", e.payment_method ?? "", e.invoice_url ?? ""]);
    file = "chi-phi";
  } else if (type === "incomes") {
    const [{ data }, { data: src }] = await Promise.all([
      supabase.from("incomes").select("*").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on"),
      supabase.from("income_sources").select("id, name"),
    ]);
    const sn = new Map((src ?? []).map((x) => [x.id as string, x.name as string]));
    header = ["Ngày", "Dự án", "Nguồn thu", "Nội dung", "Số tiền", "Số hóa đơn", "Hình thức", "Trạng thái", "Lý do hủy"];
    rows = ((data ?? []) as R[]).map((i) => [formatDate(i.occurred_on as string), pn.get(String(i.project_id)) ?? "", sn.get(String(i.source_id)) ?? "", i.description ?? "", i.amount, i.invoice_no ?? "", i.payment_method ?? "", i.status === "cancelled" ? "Đã hủy" : "Đã ghi nhận", i.cancel_reason ?? ""]);
    file = "khoan-thu";
  } else if (type === "pnl") {
    const { data } = await supabase.from("project_financials").select("*").order("code");
    header = ["Mã dự án", "Tên dự án", "Giá trị hợp đồng", "Đã thu", "Chi phí đã duyệt", "Chi phí đã trả", "Lãi / lỗ tạm tính", "Phải thu", "Phải trả", "Ngân sách chi phí"];
    rows = ((data ?? []) as R[]).map((r) => [r.code, r.name, r.contract_value, r.revenue, r.cost, r.cost_paid, Number(r.revenue) - Number(r.cost), r.receivable, r.payable, r.budget_cost]);
    file = "lai-lo-du-an";
  } else return new NextResponse("Loại xuất không hợp lệ", { status: 400 });

  const csv = "﻿" + [header, ...rows].map((r) => r.map((x) => (typeof x === "number" ? String(x) : csvCell(x))).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}-${from}_${to}.csv"`, "Cache-Control": "no-store" } });
}
