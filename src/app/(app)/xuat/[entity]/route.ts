import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/pipeline";
import { entityBySlug, loadLookups, nameOf, STAGE_OPP, type Row } from "@/lib/entities";
import { formatDate } from "@/lib/dates";

export const runtime = "nodejs";

// Xuất danh sách CRM ra CSV (UTF-8 có BOM) theo đúng bộ lọc đang xem. Quyền theo RLS: chỉ thấy / xuất được dữ liệu mình được xem.
const EXTRA: Record<string, [string, (r: Row) => string][]> = {
  opportunity: [["Giai đoạn", (r) => STAGE_OPP[String(r.stage)]?.[0] ?? String(r.stage)], ["Giá trị dự kiến", (r) => String(Number(r.expected_revenue ?? 0))], ["Xác suất (%)", (r) => String(Number(r.win_probability ?? 0))]],
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity: slug } = await params;
  const e = entityBySlug(slug);
  if (!e || e.exportable === false) return new NextResponse("Không hợp lệ", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const me = ctx as { permissions?: string[] } | null;
  if (!me) return new NextResponse("Chưa đăng nhập", { status: 401 });
  if (!me.permissions?.includes(e.view)) return new NextResponse("Bạn không có quyền xuất dữ liệu này", { status: 403 });

  const sp = req.nextUrl.searchParams;
  let q = supabase.from(e.table).select("*").order(e.order[0], { ascending: e.order[1] }).limit(5000);
  if (e.soft) q = q.is("deleted_at", null);
  const term = (sp.get("q") ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 80);
  if (term) q = q.or(e.searchCols.map((c) => `${c}.ilike.%${term}%`).join(","));
  const f = sp.get("f");
  if (f && e.filter && /^[a-z_]+$/.test(f)) q = q.eq(e.filter.col, f);
  const [{ data, error }, L] = await Promise.all([q, loadLookups(e.lookups)]);
  if (error) return new NextResponse("Không tải được dữ liệu", { status: 500 });

  const fields = e.fields(L);
  const extra = EXTRA[e.key] ?? [];
  const header = [...fields.map((x) => x.label.replace(/\s*\*$/, "")), ...extra.map((x) => x[0]), "Ngày tạo"];
  const rows = ((data ?? []) as Row[]).map((r) => [
    ...fields.map((fl) => {
      const v = r[fl.name];
      if (v === null || v === undefined) return "";
      if (fl.type === "select") return fl.options?.find(([val]) => val === v)?.[1] ?? nameOf(L, (fl.name.replace(/_id$/, "s") as never), v);
      if (fl.type === "tags") return (v as string[]).join("; ");
      if (fl.type === "checkbox") return v ? "Có" : "Không";
      if (fl.type === "date") return formatDate(String(v));
      return v as string | number;
    }),
    ...extra.map((x) => x[1](r)),
    formatDate(String(r.created_at ?? "").slice(0, 10)),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map((x) => (typeof x === "number" ? String(x) : csvCell(x))).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
