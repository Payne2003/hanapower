"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const Line = z.object({ product_id: z.guid(), unit_price: z.number().min(0), fee_percent: z.number().min(0).max(100), tax_percent: z.number().min(0).max(100) });
const refresh = () => { revalidatePath("/bang-gia", "layout"); revalidatePath("/san-pham", "layout"); };

/** Lưu trực tiếp các dòng giá (bảng không cần duyệt): một giao dịch, kiểm tra phiên bản. Quyền và quy tắc kiểm tra lại trong hàm CSDL save_price_lines. */
export async function savePriceLinesAction(input: { book: string; baseVersion: number; lines: unknown[]; deleted: string[] }): Promise<ActionResult<{ version: number; saved: number; deleted: number }>> {
  const book = z.guid().safeParse(input.book);
  const lines = z.array(Line).max(500).safeParse(input.lines);
  const del = z.array(z.guid()).safeParse(input.deleted);
  if (!book.success || !lines.success || !del.success) return { ok: false, error: "Dữ liệu dòng giá không hợp lệ — kiểm tra đơn giá (≥ 0) và phần trăm (0–100)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_price_lines", { p_book: book.data, p_base_version: input.baseVersion, p_lines: lines.data, p_delete: del.data });
  if (error) return { ok: false, error: toUserMessage(error) };
  refresh();
  const r = data as { version: number; saved: number; deleted: number };
  return { ok: true, data: r, message: `Đã lưu ${r.saved} dòng giá${r.deleted ? `, xóa ${r.deleted} dòng` : ""} (phiên bản ${r.version}).` };
}

/** Soạn đề nghị thay đổi giá và (tùy chọn) gửi duyệt ngay. */
export async function savePriceChangeAction(input: { id?: string | null; book: string; reason: string; effective: string; lines: unknown[]; submit: boolean }): Promise<ActionResult<{ id: string }>> {
  const book = z.guid().safeParse(input.book);
  const lines = z.array(Line).min(1).max(500).safeParse(input.lines);
  if (!book.success || !lines.success || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective)) return { ok: false, error: "Nhập ngày hiệu lực và ít nhất một dòng giá hợp lệ." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_price_change", { p_id: input.id ?? null, p_book: book.data, p_reason: input.reason || null, p_effective: input.effective, p_lines: lines.data });
  if (error) return { ok: false, error: toUserMessage(error) };
  const id = data as string;
  if (input.submit) {
    const { error: e2 } = await supabase.rpc("submit_price_change", { p_id: id });
    if (e2) { refresh(); return { ok: false, error: `Đã lưu nháp nhưng chưa gửi được: ${toUserMessage(e2)}` }; }
  }
  refresh();
  return { ok: true, data: { id }, message: input.submit ? "Đã gửi đề nghị thay đổi giá chờ duyệt." : "Đã lưu nháp đề nghị." };
}
