import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/pipeline";
import { EMPLOYMENT_STATUS, WORK_FORM, EMPLOYMENT_TYPE } from "@/lib/status-maps";
import { parseStaffQuery, parseDeptQuery, type StaffRow, type DeptRow } from "@/lib/hr";

export const runtime = "nodejs";

// Xuất CSV danh sách nhân viên / phòng ban theo ĐÚNG bộ lọc đang xem. Chỉ gồm các cột có trên màn hình danh sách
// (không có lương, liên hệ cá nhân, tài liệu); dòng và cột theo quyền của người xuất (hàm CSDL security invoker + RLS).
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const me = ctx as { roles?: string[] } | null;
  if (!me) return new NextResponse("Chưa đăng nhập", { status: 401 });
  if (me.roles?.includes("collaborator")) return new NextResponse("Bạn không có quyền xuất dữ liệu này", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const label = (m: Record<string, [string, string]>, v: string) => m[v]?.[0] ?? v;
  let header: string[]; let rows: string[][]; let name: string;
  if (sp.loai === "phong-ban") {
    const q = parseDeptQuery(sp, 5000);
    const { data, error } = await supabase.rpc("department_list", { p_q: q.q || null, p_active: q.active ?? null, p_sort: q.sort, p_dir: q.dir, p_limit: 5000, p_offset: 0 });
    if (error) return new NextResponse("Không tải được dữ liệu", { status: 500 });
    header = ["Tên phòng", "Người quản lý", "Số thành viên", "Số chức vụ đang dùng", "Trạng thái"];
    rows = ((data as { rows: DeptRow[] }).rows).map((d) => [d.name, d.managers.map((m) => m.name).join("; "), String(d.member_count), String(d.position_count), d.active ? "Đang hoạt động" : "Ngừng hoạt động"]);
    name = "phong-ban";
  } else {
    const q = parseStaffQuery(sp, 5000);
    const { data, error } = await supabase.rpc("staff_list", { p_q: q.q || null, p_dept: q.dept ?? null, p_position: q.position ?? null, p_status: q.status ?? null, p_work_form: q.form ?? null, p_unassigned: q.none, p_sort: q.sort, p_dir: q.dir, p_limit: 5000, p_offset: 0 });
    if (error) return new NextResponse("Không tải được dữ liệu", { status: 500 });
    header = ["Mã NV", "Họ tên", "Email công việc", "Phòng ban", "Chức vụ", "Hình thức làm việc", "Loại nhân sự", "Trạng thái nhân sự"];
    rows = ((data as { rows: StaffRow[] }).rows).map((r) => [
      r.code, r.name, r.email, r.assignments.map((a) => a.dept).join("; "),
      r.assignments.map((a) => `${a.dept}: ${a.positions.map((p) => p.name).join(", ") || "—"}`).join("; "),
      label(WORK_FORM, r.work_form), label(EMPLOYMENT_TYPE, r.type), label(EMPLOYMENT_STATUS, r.status),
    ]);
    name = "nhan-vien";
  }
  const csv = "﻿" + [header, ...rows].map((r) => r.map((x) => csvCell(x)).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" } });
}
