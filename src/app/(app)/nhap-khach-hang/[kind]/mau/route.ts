import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { KIND_BY_SLUG, TEMPLATES } from "@/lib/crm-import";

export const runtime = "nodejs";

// Tệp Excel mẫu cho từng loại dữ liệu.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind: slug } = await params;
  const kind = KIND_BY_SLUG[slug];
  if (!kind) return new NextResponse("Không hợp lệ", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  if (!(ctx as { permissions?: string[] } | null)?.permissions?.includes("crm.manage")) return new NextResponse("Bạn không có quyền", { status: 403 });
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dữ liệu");
  const t = TEMPLATES[kind];
  ws.addRow(t.headers);
  ws.addRow(t.sample);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F2EA" } };
  t.headers.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(14, h.length + 6); });
  // Điện thoại / MST / ngày sinh để dạng văn bản để Excel không làm mất số 0 đầu
  t.headers.forEach((h, i) => { if (/điện thoại|mã số thuế|ngày sinh/i.test(h)) ws.getColumn(i + 1).numFmt = "@"; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="mau-nhap-${slug}.xlsx"`, "Cache-Control": "no-store" },
  });
}
