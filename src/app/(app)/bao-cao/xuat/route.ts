import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPeople, getVideos } from "@/lib/queries";
import { contentStatus, csvCell, monthRange } from "@/lib/pipeline";
import { HANDOVER, ITEM_KINDS, ITEM_STATUS, STAGE } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

// Xuất báo cáo tháng ra CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt), cùng cột với bảng gốc.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Chưa đăng nhập", { status: 401 });
  const month = req.nextUrl.searchParams.get("thang") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Tháng không hợp lệ", { status: 400 });
  const [videos, people] = await Promise.all([getVideos(monthRange(month)), getPeople()]);
  const name = new Map(people.map((p) => [p.id, p.full_name]));
  const header = ["STT", "Ngày báo cáo", "Mã dự án", "Tên dự án / video", "Content phụ trách", "Nguồn thật", "Video AI", "Kịch bản / VO", "Sơ đồ dựng",
    "Link tài nguyên", "Trạng thái Content", "Ghi chú Content", "Editor tiếp nhận", "Xác nhận bàn giao", "Ngày xác nhận", "Ghi chú Edit bổ sung/ thêm bớt",
    "Giai đoạn", "Tiến độ dựng (%)", "Link bản dựng", "Số lần bổ sung", "Số lần sửa", "Hạn đăng", "Ngày đăng", "Link video đã đăng"];
  const rows = videos.map((v, i) => [
    i + 1, formatDate(v.report_date), v.code, v.title, name.get(v.content_owner_id ?? "") ?? "",
    ...ITEM_KINDS.map((k) => ITEM_STATUS[v.items[k]].label),
    v.resource_url ?? "", contentStatus(v.stage), v.content_note ?? "", name.get(v.editor_id ?? "") ?? "",
    v.handover_status ? HANDOVER[v.handover_status].label : "", v.handover_confirmed_at ? formatDate(v.handover_confirmed_at) : "", v.editor_note ?? "",
    STAGE[v.stage].label, v.edit_progress, v.draft_url ?? "", v.supplement_count, v.revision_count,
    v.due_date ? formatDate(v.due_date) : "", v.published_at ? formatDate(v.published_at) : "", v.published_url ?? "",
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bao-cao-content-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
