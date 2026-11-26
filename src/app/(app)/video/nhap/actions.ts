"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/queries";
import { parseWorkbook, planImport, type PlanLine } from "@/lib/sheet-import";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export type Preview = { lines: PlanLine[]; sheets: string[]; fileName: string };

/** Bước 1: đọc tệp Excel, so khớp người và mã đã có, trả về bản xem trước (chưa ghi gì). */
export async function previewImportAction(_p: ActionResult<Preview> | null, fd: FormData): Promise<ActionResult<Preview>> {
  const ctx = await requireContext();
  if (!can(ctx, "videos.manage_all")) return { ok: false, error: "Chỉ Leader / quản lý sản xuất được nhập dữ liệu." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn tệp Excel (.xlsx) tải từ Google Sheet." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Tệp quá lớn (tối đa 10 MB)." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Chỉ nhận tệp .xlsx (Google Sheet: Tệp → Tải xuống → Microsoft Excel)." };

  let parsed;
  try {
    parsed = await parseWorkbook(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Không đọc được tệp. Hãy tải lại từ Google Sheet dạng Microsoft Excel (.xlsx)." };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: "Không tìm thấy dòng nào. Tệp cần có dòng tiêu đề với cột \"Mã dự án\", \"Tên dự án / video\"…" };
  }
  const supabase = await createSupabaseServerClient();
  const [people, existing] = await Promise.all([getPeople(), supabase.from("videos").select("code")]);
  const codes = new Set((existing.data ?? []).map((r) => (r.code as string).toUpperCase()));
  const lines = planImport(parsed.rows, people.filter((p) => p.is_active), codes, ctx.today);
  return { ok: true, data: { lines, sheets: parsed.sheets, fileName: file.name } };
}

const item = z.enum(["todo", "doing", "done"]);
const videoSchema = z.object({
  code: z.string().regex(/^D\d{1,6}$/),
  title: z.string().min(1).max(300),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stage: z.enum(["idea", "preparing", "handover", "editing"]),
  content_owner_id: z.guid().nullable(),
  editor_id: z.guid().nullable(),
  resource_url: z.string().max(2000).nullable(),
  content_note: z.string().max(4000).nullable(),
  handover_status: z.enum(["pending", "received", "needs_more"]).nullable(),
  handover_confirmed_at: z.string().nullable(),
  editor_note: z.string().max(4000).nullable(),
  supplement_count: z.number().int().min(0).max(100),
  items: z.object({ real_footage: item, ai_video: item, script_vo: item, edit_map: item }),
  source: z.string().max(200),
});

/** Bước 2: ghi vào cơ sở dữ liệu (một giao dịch; mã đã có sẽ được bỏ qua). */
export async function runImportAction(_p: ActionResult<{ inserted: number; skipped: string[] }> | null, fd: FormData): Promise<ActionResult<{ inserted: number; skipped: string[] }>> {
  const ctx = await requireContext();
  if (!can(ctx, "videos.manage_all")) return { ok: false, error: "Chỉ Leader / quản lý sản xuất được nhập dữ liệu." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("videos") ?? "[]"));
  } catch {
    return { ok: false, error: "Dữ liệu nhập không hợp lệ." };
  }
  const parsed = z.array(videoSchema).max(5000).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dữ liệu nhập không hợp lệ — hãy đọc lại tệp." };
  if (parsed.data.length === 0) return { ok: false, error: "Không có video mới để nhập." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_videos", { p_rows: parsed.data });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/video");
  revalidatePath("/");
  revalidatePath("/bao-cao");
  const r = data as { inserted: number; skipped: string[] };
  return { ok: true, data: r, message: `Đã nhập ${r.inserted} video${r.skipped.length ? `, bỏ qua ${r.skipped.length} mã đã có` : ""}.` };
}
