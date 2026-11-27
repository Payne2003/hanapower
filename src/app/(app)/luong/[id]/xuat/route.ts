import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/pipeline";

// Bảng lương theo kỳ → CSV UTF-8 có BOM. Chỉ người có quyền xem lương; kế toán dùng để chi trả.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Mã không hợp lệ", { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const c = ctx as { permissions?: string[] } | null;
  if (!c) return new NextResponse("Chưa đăng nhập", { status: 401 });
  if (!c.permissions?.includes("payroll.view")) return new NextResponse("Bạn không có quyền xuất bảng lương", { status: 403 });
  const { data: p } = await supabase.from("payroll_periods").select("*").eq("id", id).maybeSingle();
  if (!p) return new NextResponse("Không tìm thấy kỳ lương", { status: 404 });
  const [{ data: lines }, { data: people }, { data: prof }] = await Promise.all([
    supabase.from("payroll_lines").select("*").eq("period_id", id),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("salary_profiles").select("user_id, bank_name, account_no, account_name"),
  ]);
  const pn = new Map((people ?? []).map((x) => [x.id as string, x]));
  const bank = new Map((prof ?? []).map((x) => [x.user_id as string, x]));
  const header = ["STT", "Họ tên", "Email", "Lương cơ bản", "Công thực tế", "Công chuẩn", "Lương theo công", "Phụ cấp", "Thưởng", "Bảo hiểm", "Thuế TNCN", "Khấu trừ khác", "Thực nhận", "Ngân hàng", "Số tài khoản", "Chủ tài khoản", "Ghi chú"];
  const sorted = [...(lines ?? [])].sort((a, b) => String(pn.get(a.user_id as string)?.full_name).localeCompare(String(pn.get(b.user_id as string)?.full_name), "vi"));
  const rows = sorted.map((l, i) => {
    const u = pn.get(l.user_id as string), b = bank.get(l.user_id as string);
    return [i + 1, u?.full_name ?? "", u?.email ?? "", l.base_salary, l.worked_days, p.standard_days, l.base_pay, l.allowances, l.bonuses, l.insurance, l.tax, l.deductions, l.net_pay, b?.bank_name ?? "", b?.account_no ?? "", b?.account_name ?? "", l.note ?? ""];
  });
  const csv = "﻿" + [header, ...rows].map((r) => r.map((x) => (typeof x === "number" ? String(x) : csvCell(x))).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bang-luong-${p.year}-${String(p.month).padStart(2, "0")}.csv"`, "Cache-Control": "no-store" } });
}
