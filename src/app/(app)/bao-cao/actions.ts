"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const itemSchema = z.object({
  task_id: z.guid(),
  result: z.string().max(4000).default(""),
  progress: z.number().int().min(0).max(100),
  blocker: z.string().max(2000).nullable().default(null),
});
const payloadSchema = z.object({
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(4000).default(""),
  items: z.array(itemSchema).max(100),
});
export type DailyReportPayload = z.input<typeof payloadSchema>;
export type SubmitResult = { report_id: string; submitted_at?: string; already_submitted?: boolean };

export async function saveDailyReportDraft(payload: DailyReportPayload): Promise<ActionResult> {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Dữ liệu báo cáo không hợp lệ (tiến độ 0–100)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_daily_report_draft", {
    p_report_date: parsed.data.report_date,
    p_note: parsed.data.note,
    p_items: parsed.data.items,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/bao-cao");
  return { ok: true, message: "Đã lưu bản nháp." };
}

/** Gửi báo cáo: an toàn khi gửi lại (CSDL trả về cùng kết quả, không ghi trùng). */
export async function submitDailyReport(payload: DailyReportPayload): Promise<ActionResult<SubmitResult>> {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Dữ liệu báo cáo không hợp lệ (tiến độ 0–100)." };
  if (parsed.data.items.length === 0) return { ok: false, error: "Chọn ít nhất một công việc để báo cáo." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_daily_report", {
    p_report_date: parsed.data.report_date,
    p_note: parsed.data.note,
    p_items: parsed.data.items,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  for (const p of ["/bao-cao", "/viec-cua-toi", "/du-an", "/"]) revalidatePath(p, p === "/du-an" ? "layout" : "page");
  const r = data as SubmitResult;
  return {
    ok: true,
    data: r,
    message: r.already_submitted ? "Báo cáo hôm nay đã được gửi trước đó." : "Đã gửi báo cáo ngày. Tiến độ công việc đã được cập nhật.",
  };
}
