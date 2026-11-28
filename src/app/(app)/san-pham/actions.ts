"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { checkFile } from "@/lib/files";
import type { ActionResult } from "@/lib/types";
import type { Estimate } from "@/lib/pricing";

/** Ước tính báo giá: cùng hàm CSDL với dòng cơ hội và báo giá (một quy tắc làm tròn). */
export async function estimateAction(product: string, book: string, qty: number): Promise<ActionResult<Estimate>> {
  if (!z.guid().safeParse(product).success || !z.guid().safeParse(book).success) return { ok: false, error: "Chọn bảng giá." };
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("apply_due_price_changes");
  const { data, error } = await supabase.rpc("price_estimate", { p_product: product, p_book: book, p_qty: qty });
  if (error) return { ok: false, error: toUserMessage(error) };
  return { ok: true, data: data as Estimate };
}

export type OppOption = { id: string; name: string; stage: string; price_book_id: string | null; price_book_name: string | null; account: string | null };
/** Cơ hội trong phạm vi quyền của người dùng (RLS), chưa đóng. */
export async function listOpportunitiesAction(): Promise<ActionResult<OppOption[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("opportunities").select("id, name, stage, price_book_id, price_books(name), accounts(name)").is("deleted_at", null).not("stage", "in", "(won,lost)").order("created_at", { ascending: false }).limit(200);
  if (error) return { ok: false, error: toUserMessage(error) };
  type R = { id: string; name: string; stage: string; price_book_id: string | null; price_books: { name: string } | null; accounts: { name: string } | null };
  return { ok: true, data: ((data ?? []) as unknown as R[]).map((o) => ({ id: o.id, name: o.name, stage: o.stage, price_book_id: o.price_book_id, price_book_name: o.price_books?.name ?? null, account: o.accounts?.name ?? null })) };
}

export type AddResult = { status: "added" | "mismatch"; line_id?: string; estimate?: Estimate; opportunity_book_id?: string; selected?: Estimate; opportunity?: Estimate | null; diff?: number | null };
export async function addPricedLineAction(opp: string, product: string, book: string, qty: number, mismatch?: string): Promise<ActionResult<AddResult>> {
  if (!z.guid().safeParse(opp).success) return { ok: false, error: "Chọn cơ hội." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_priced_line", { p_opp: opp, p_product: product, p_book: book, p_qty: qty, p_mismatch: mismatch ?? null });
  if (error) return { ok: false, error: toUserMessage(error) };
  const r = data as AddResult;
  if (r.status === "added") { revalidatePath("/co-hoi", "layout"); }
  return { ok: true, data: r, message: r.status === "added" ? "Đã thêm vào cơ hội." : undefined };
}

const EXTS = ["pdf", "png", "jpg", "jpeg", "webp", "docx", "xlsx", "pptx", "zip", "txt"];
/** Tải ảnh / tài liệu bán hàng cho sản phẩm (≤ 5 MB, chữ ký tệp khớp đuôi). Lỗi thì giữ nguyên ảnh cũ. */
export async function uploadProductFileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const product = z.guid().safeParse(fd.get("product"));
  const kind = fd.get("kind") === "image" ? "image" : "document";
  if (!product.success) return { ok: false, error: "Sản phẩm không hợp lệ." };
  const supabase = await createSupabaseServerClient();
  let n = 0;
  for (const f of fd.getAll("file")) {
    if (!(f instanceof File) || f.size === 0) continue;
    const bytes = Buffer.from(await f.arrayBuffer());
    const bad = checkFile(f.name, bytes, kind === "image" ? ["png", "jpg", "jpeg", "webp"] : EXTS, kind === "image" ? 2 : 5);
    if (bad) return { ok: false, error: `${f.name}: ${bad}` };
    const { error } = await supabase.rpc("add_product_file", { p_product: product.data, p_kind: kind, p_name: f.name, p_mime: f.type || "application/octet-stream", p_content_base64: bytes.toString("base64") });
    if (error) return { ok: false, error: `${f.name}: ${toUserMessage(error)}` };
    n++;
  }
  if (!n) return { ok: false, error: "Chọn một tệp." };
  revalidatePath("/san-pham", "layout");
  return { ok: true, message: kind === "image" ? "Đã cập nhật ảnh sản phẩm." : `Đã tải lên ${n} tài liệu.` };
}
