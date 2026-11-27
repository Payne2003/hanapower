"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { readFiles } from "@/lib/voucher-files";
import { periodLabel, periodOf } from "@/lib/finance-ui";
import type { ActionResult } from "@/lib/types";

const opt = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function refresh() {
  revalidatePath("/thu-chi", "layout");
  revalidatePath("/du-an", "layout");
}

/**
 * Ghi nhận thu theo mốc — MỘT luồng cho mọi màn hình (hồ sơ dự án và "Phải thu theo mốc").
 * Gọi record_milestone_receipt (một giao dịch CSDL: khóa mốc → tạo khoản thu → đóng mốc); chứng từ đính kèm sau khi khoản thu đã tồn tại.
 * Bấm lại / gửi lại trả về khoản thu đã có, không tạo thêm.
 */
export async function recordReceiptAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const milestone = z.guid().safeParse(fd.get("milestone"));
  if (!milestone.success) return { ok: false, error: "Mã mốc không hợp lệ." };
  const date = opt(fd, "received_on");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Ngày thực thu không hợp lệ." };
  const { files, error: fileErr } = await readFiles(fd);
  if (fileErr) return { ok: false, error: fileErr };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_milestone_receipt", {
    p_milestone: milestone.data, p_amount: fd.get("amount") ? Number(String(fd.get("amount")).replace(/[,\s]/g, "")) : null, p_received_on: date,
    p_source: opt(fd, "source"), p_method: opt(fd, "method"), p_owner: opt(fd, "owner"), p_department: opt(fd, "department"), p_note: opt(fd, "note"), p_invoice_no: opt(fd, "invoice_no"),
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  const r = data as { income_id: string; already: boolean; received_on: string };
  const per = periodOf(r.received_on);
  let attached = 0;
  for (const f of files) {
    const { error: e2 } = await supabase.rpc("add_finance_file", { p_kind: "income", p_ref: r.income_id, p_name: f.name, p_mime: f.mime, p_content_base64: f.base64 });
    if (e2) { refresh(); return { ok: false, error: `Đã ghi nhận thu nhưng chưa đính kèm được ${f.name}: ${toUserMessage(e2)}` }; }
    attached++;
  }
  refresh();
  return { ok: true, message: r.already
    ? `Mốc này đã được ghi nhận trước đó (${periodLabel(per.year, per.month)}) — không tạo thêm khoản thu.`
    : `Đã ghi nhận thu vào ${periodLabel(per.year, per.month)}${attached ? `, đính kèm ${attached} chứng từ` : ""}.` };
}

/** Đính kèm thêm chứng từ cho khoản thu / khoản chi đã có (nhiều tệp). */
export async function uploadFinanceFileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const kind = fd.get("kind");
  const ref = z.guid().safeParse(fd.get("ref"));
  if ((kind !== "income" && kind !== "expense") || !ref.success) return { ok: false, error: "Giao dịch không hợp lệ." };
  const { files, error: fileErr } = await readFiles(fd);
  if (fileErr) return { ok: false, error: fileErr };
  if (!files.length) return { ok: false, error: "Chọn ít nhất một tệp." };
  const supabase = await createSupabaseServerClient();
  for (const f of files) {
    const { error } = await supabase.rpc("add_finance_file", { p_kind: kind, p_ref: ref.data, p_name: f.name, p_mime: f.mime, p_content_base64: f.base64 });
    if (error) { refresh(); return { ok: false, error: `${f.name}: ${toUserMessage(error)}` }; }
  }
  refresh();
  return { ok: true, message: `Đã đính kèm ${files.length} chứng từ.` };
}
