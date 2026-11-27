"use server";
// Thêm / sửa / xóa các thực thể CRM dạng danh mục. Quyền do RLS ở CSDL quyết định (crm.manage…).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { ENTITIES } from "@/lib/entities";
import type { FormField } from "@/lib/form-spec";
import type { ActionResult } from "@/lib/types";

function coerce(f: FormField, fd: FormData): unknown {
  const raw = fd.get(f.name);
  const v = typeof raw === "string" ? raw.trim() : "";
  switch (f.type) {
    case "checkbox": return raw === "on";
    case "number": return v === "" ? (f.required ? 0 : null) : Number(v.replace(/[,\s]/g, ""));
    case "tags": return v === "" ? [] : v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    case "date": case "select": return v === "" ? null : v;
    default: return v === "" ? (f.required || f.name === "first_name" ? "" : null) : v;
  }
}

export async function saveEntityAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const e = ENTITIES.find((x) => x.key === fd.get("__entity"));
  if (!e) return { ok: false, error: "Thực thể không hợp lệ." };
  const id = String(fd.get("__id") ?? "");
  const ctx = await requireContext();
  const fields = e.fields({});
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "select" && id === "" && e.defaults && f.name in e.defaults) continue;
    row[f.name] = coerce(f, fd);
    if (f.required && (row[f.name] === "" || row[f.name] === null)) return { ok: false, error: `Nhập ${f.label.replace(/\s*\*$/, "").toLowerCase()}.` };
  }
  const supabase = await createSupabaseServerClient();
  if (id) {
    const { data, error } = await supabase.from(e.table).update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: toUserMessage(error) };
    if (!data?.length) return { ok: false, error: "Bạn không có quyền sửa hoặc bản ghi không còn tồn tại." };
    revalidatePath(`/${e.slug}`, "layout");
    return { ok: true, message: "Đã lưu." };
  }
  const { data, error } = await supabase.from(e.table).insert({ ...row, org_id: ctx.org_id }).select("id").single();
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath(`/${e.slug}`, "layout");
  redirect(`/${e.slug}/${data.id as string}`);
}

export async function deleteEntityAction(entityKey: string, id: string): Promise<ActionResult> {
  const e = ENTITIES.find((x) => x.key === entityKey);
  if (!e || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Yêu cầu không hợp lệ." };
  const supabase = await createSupabaseServerClient();
  const res = e.soft
    ? await supabase.from(e.table).update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id")
    : await supabase.from(e.table).delete().eq("id", id).select("id");
  if (res.error) return { ok: false, error: /23503/.test(res.error.code ?? "") ? "Đang được sử dụng ở nơi khác nên chưa xóa được." : toUserMessage(res.error) };
  if (!res.data?.length) return { ok: false, error: "Bạn không có quyền xóa hoặc bản ghi không còn tồn tại." };
  revalidatePath(`/${e.slug}`, "layout");
  redirect(`/${e.slug}`);
}

// --- Dòng sản phẩm của cơ hội / bảng giá ---------------------------------------------------------
const num = (v: FormDataEntryValue | null, d = 0) => (v === null || String(v).trim() === "" ? d : Number(String(v).replace(/[,\s]/g, "")));

export async function addOpportunityLine(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  const opp = String(fd.get("opportunity_id") ?? "");
  const productId = String(fd.get("product_id") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  let description = String(fd.get("description") ?? "").trim();
  let unit = String(fd.get("unit") ?? "").trim() || null;
  let unitPrice = fd.get("unit_price") === "" ? null : num(fd.get("unit_price"), 0);
  let fee = num(fd.get("fee_percent")), tax = num(fd.get("tax_percent"));
  if (productId) {
    const { data: p } = await supabase.from("products").select("name, list_price, product_units(name)").eq("id", productId).maybeSingle();
    if (!p) return { ok: false, error: "Không tìm thấy sản phẩm." };
    description ||= p.name as string;
    unitPrice ??= Number(p.list_price);
    const u = (p as unknown as { product_units: { name: string } | null }).product_units;
    unit ??= u?.name ?? null;
    // Có bảng giá: dùng giá / phí / thuế trong bảng giá khi người dùng không nhập
    const { data: o } = await supabase.from("opportunities").select("price_book_id").eq("id", opp).maybeSingle();
    if (o?.price_book_id) {
      const { data: pb } = await supabase.from("price_book_products").select("unit_price, fee_percent, tax_percent").eq("price_book_id", o.price_book_id as string).eq("product_id", productId).maybeSingle();
      if (pb) {
        if (fd.get("unit_price") === "") unitPrice = Number(pb.unit_price);
        if (fd.get("fee_percent") === "") fee = Number(pb.fee_percent);
        if (fd.get("tax_percent") === "") tax = Number(pb.tax_percent);
      }
    }
  }
  if (!description) return { ok: false, error: "Chọn sản phẩm hoặc nhập nội dung dịch vụ." };
  const qty = num(fd.get("quantity"), 1);
  if (!(qty > 0)) return { ok: false, error: "Số lượng phải lớn hơn 0." };
  if (unitPrice === null || unitPrice < 0) return { ok: false, error: "Nhập đơn giá." };
  const { error } = await supabase.from("opportunity_products").insert({ org_id: ctx.org_id, opportunity_id: opp, product_id: productId, description, unit, unit_price: unitPrice, quantity: qty, fee_percent: fee, tax_percent: tax });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/co-hoi", "layout");
  return { ok: true, message: "Đã thêm dòng." };
}

export async function addPriceBookLine(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const product = String(fd.get("product_id") ?? "");
  if (!product) return { ok: false, error: "Chọn sản phẩm." };
  const { error } = await supabase.from("price_book_products").upsert({
    org_id: ctx.org_id, price_book_id: String(fd.get("price_book_id")), product_id: product,
    unit_price: num(fd.get("unit_price")), fee_percent: num(fd.get("fee_percent")), tax_percent: num(fd.get("tax_percent")),
  }, { onConflict: "price_book_id,product_id" });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/bang-gia", "layout");
  return { ok: true, message: "Đã lưu." };
}

export async function deleteLine(table: "opportunity_products" | "price_book_products", id: string, path: string): Promise<ActionResult> {
  if (table !== "opportunity_products" && table !== "price_book_products") return { ok: false, error: "Không hợp lệ." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return { ok: false, error: toUserMessage(error) };
  if (!data?.length) return { ok: false, error: "Bạn không có quyền xóa dòng này." };
  if (path.startsWith("/")) revalidatePath(path, "layout");
  return { ok: true };
}
