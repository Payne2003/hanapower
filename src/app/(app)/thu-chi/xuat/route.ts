import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";
import { expenseArgs, incomeArgs, parseFinanceQuery } from "@/lib/finance";
import { BUCKET, DATE_RE, UUID_RE } from "@/lib/finance-ui";

// Xuất CSV UTF-8 có BOM (Excel mở đúng tiếng Việt). Dùng CHÍNH các hàm CSDL của màn hình (cùng bộ lọc, cùng quyền xem / RLS):
// ai thấy dòng nào trên màn hình thì xuất ra đúng dòng đó, tổng không lệch.
const APPROVAL: Record<string, string> = { draft: "Nháp", submitted: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const PAY: Record<string, string> = { unpaid: "Chưa thanh toán", paid: "Đã thanh toán" };
type R = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const c = ctx as { permissions?: string[]; today?: string; roles?: string[] } | null;
  if (!c) return new NextResponse("Chưa đăng nhập", { status: 401 });
  if (c.roles?.includes("collaborator")) return new NextResponse("Bạn không có quyền xuất dữ liệu tài chính", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const type = sp.type ?? "";
  const q = parseFinanceQuery(sp, c.today ?? new Date().toISOString().slice(0, 10));
  let header: string[] = [], rows: unknown[][] = [], file = "";

  if (type === "incomes") {
    const { data, error } = await supabase.rpc("income_list", incomeArgs(q, false));
    if (error) return new NextResponse(error.message, { status: 403 });
    const list = data as { rows: R[] };
    header = ["Ngày thực thu", "Loại", "Dự án", "Khách hàng", "Mốc", "Nguồn thu", "Nội dung", "Số tiền", "Số hóa đơn", "Hình thức", "Phòng ban", "Người phụ trách", "Số chứng từ", "Trạng thái", "Lý do hủy"];
    rows = list.rows.map((i) => [formatDate(i.occurred_on as string), i.is_milestone ? "Thu theo mốc" : "Thu khác", i.project_code ? `${i.project_code} - ${i.project_name}` : "", i.customer_name ?? "", i.milestone_name ?? "", i.source_name ?? "", i.description ?? "", i.amount, i.invoice_no ?? "", i.payment_method ?? "", i.department_name ?? "", i.owner_name ?? "", i.file_count, i.status === "cancelled" ? "Đã hủy" : "Đã ghi nhận", i.cancel_reason ?? ""]);
    file = "khoan-thu";
  } else if (type === "expenses") {
    const { data, error } = await supabase.rpc("expense_list", expenseArgs(q, false));
    if (error) return new NextResponse(error.message, { status: 403 });
    const list = data as { rows: R[] };
    header = ["Ngày phát sinh", "Dự án", "Loại chi phí", "Người nhận", "Nội dung", "Số tiền", "Hạn thanh toán", "Duyệt", "Thanh toán", "Hình thức", "Phòng ban", "Người đề nghị", "Số chứng từ", "Link chứng từ"];
    rows = list.rows.map((e) => [formatDate(e.occurred_on as string), e.project_code ? `${e.project_code} - ${e.project_name}` : "Chi chung", e.category_name ?? "", e.payee_name ?? "", e.description ?? "", e.amount, formatDate(e.due_date as string | null), APPROVAL[String(e.approval)] ?? "", PAY[String(e.payment)] ?? "", e.payment_method ?? "", e.department_name ?? "", e.owner_name ?? "", e.file_count, e.invoice_url ?? ""]);
    file = "khoan-chi";
  } else if (type === "receivables") {
    const bucket = sp.nhom && sp.nhom !== "overdue" ? sp.nhom : null;
    const { data, error } = await supabase.rpc("receivables", { p_group: sp.gom === "project" ? "project" : "customer", p_customer: sp.kh && UUID_RE.test(sp.kh) ? sp.kh : null, p_project: sp.da && UUID_RE.test(sp.da) ? sp.da : null, p_bucket: bucket });
    if (error) return new NextResponse(error.message, { status: 403 });
    const groups = (data as { groups: { items: R[] }[] }).groups;
    header = ["Khách hàng", "Dự án", "Mốc", "Số tiền", "Hạn thu", "Số ngày trễ", "Nhóm tuổi nợ", "Quản lý dự án", "Việc tiếp theo"];
    rows = groups.flatMap((g) => g.items).filter((i) => sp.nhom !== "overdue" || ["d1_30", "d31_60", "d61_90", "d90p"].includes(String(i.bucket)))
      .map((i) => [i.customer_name, `${i.project_code} - ${i.project_name}`, i.milestone, i.amount, formatDate(i.due_date as string | null), Number(i.days_late) > 0 ? i.days_late : 0, BUCKET[String(i.bucket)]?.[0] ?? i.bucket, i.managers, i.next_action]);
    file = "phai-thu-theo-moc";
  } else if (type === "report") {
    const dim = ["project", "customer", "month", "department", "source", "category"].includes(sp.dim ?? "") ? sp.dim! : "project";
    const { data, error } = await supabase.rpc("finance_report", { p_dim: dim, p_from: DATE_RE.test(sp.tu ?? "") ? sp.tu : null, p_to: DATE_RE.test(sp.den ?? "") ? sp.den : null });
    if (error) return new NextResponse(error.message, { status: 403 });
    header = ["Nhóm", "Thực thu", "Thực chi (đã duyệt)", "Chênh lệch thu–chi", "Dự kiến thu (mốc chưa thu)"];
    rows = (data as { rows: R[] }).rows.map((r) => [r.label, r.income, r.expense, r.diff, r.expected]);
    file = `bao-cao-${dim}`;
  } else if (type === "pnl") {
    if (!c.permissions?.includes("finance.view")) return new NextResponse("Bạn không có quyền xuất dữ liệu tài chính", { status: 403 });
    const { data } = await supabase.from("project_financials").select("*").order("code");
    header = ["Mã dự án", "Tên dự án", "Giá trị hợp đồng", "Đã thu", "Chi phí đã duyệt", "Chi phí đã trả", "Chênh lệch thu–chi", "Phải thu", "Phải trả", "Ngân sách chi"];
    rows = ((data ?? []) as R[]).map((r) => [r.code, r.name, r.contract_value, r.revenue, r.cost, r.cost_paid, Number(r.revenue) - Number(r.cost), r.receivable, r.payable, r.budget_cost]);
    file = "thu-chi-theo-du-an";
  } else return new NextResponse("Loại xuất không hợp lệ", { status: 400 });

  const csv = "﻿" + [header, ...rows].map((r) => r.map((x) => (typeof x === "number" ? String(x) : csvCell(x))).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}-${q.from}_${q.to}.csv"`, "Cache-Control": "no-store" } });
}
