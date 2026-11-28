import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/finance-ui";

// Truy vấn Sản phẩm & Bảng giá: lọc / sắp xếp / phân trang / tổng hợp chạy ở CSDL; mọi hàm là security invoker (hoặc kiểm quyền trong hàm).

export type ProductRow = {
  id: string; code: string | null; name: string; is_active: boolean; category_id: string | null; category_name: string | null; unit_id: string | null; unit_name: string | null;
  default_price_book_id: string | null; default_book_name: string | null; default_price: number | null; list_price: number | null; image_file_id: string | null; description: string | null;
  file_count: number; line_count: number; price_issue: "no_default" | "default_inactive" | "no_line" | null;
};
export type ProductList = { total: number; counts: { all: number; active: number; inactive: number; missing: number }; rows: ProductRow[] };
export type PriceHealth = {
  active_products: number; missing_products: number; by_issue: Record<string, number>; pending_requests: number; waiting_effective: number;
  items: { product_id: string; code: string | null; name: string; issue: string; default_book_id: string | null; default_book_name: string | null }[];
};
export type PriceCompare = {
  unit: string | null; reference: number | null; reference_book_id: string | null; pct_unavailable_reason: string | null;
  rows: { book_id: string; book_name: string; is_active: boolean; is_default: boolean; unit_price: number; fee_percent: number; tax_percent: number; effective_from: string | null; diff: number | null; diff_pct: number | null }[];
};
export type BookRow = { id: string; name: string; description: string | null; is_active: boolean; version: number; requires_approval: boolean; line_count: number; pending_requests: number; default_for: number };
export type GridLine = { product_id: string; code: string | null; name: string; unit: string | null; is_active: boolean; unit_price: number; fee_percent: number; tax_percent: number; fee_amount: number; tax_amount: number; price_after: number };
export type Grid = {
  book: { id: string; name: string; description: string | null; is_active: boolean; version: number; requires_approval: boolean };
  lines: GridLine[]; pending: { id: string; code: string; status: string; effective_date: string }[];
};
export type ChangeRow = { id: string; code: string; status: string; display_status: string; effective_date: string; reason: string | null; requester: string | null; book_id: string; book_name: string; line_count: number; submitted_at: string | null; applied_at: string | null; created_at: string };
export type ChangeDetail = {
  id: string; code: string; status: string; display_status: string; applied_at: string | null; effective_date: string; reason: string | null; book_id: string; book_name: string; book_version: number; base_version: number;
  requester_id: string; requester: string | null; decision_note: string | null; decided_by: string | null; decided_at: string | null; submitted_at: string | null; stale: boolean; can_decide: boolean; is_mine: boolean;
  lines: { product_id: string; code: string | null; name: string; unit: string | null; is_new: boolean; old_unit_price: number | null; old_fee_percent: number | null; old_tax_percent: number | null; new_unit_price: number; new_fee_percent: number; new_tax_percent: number; diff: number | null; diff_pct: number | null; pct_reason: string | null; old_after: number | null; new_after: number; current_unit_price: number | null }[];
  events: { action: string; note: string | null; at: string; by: string | null }[];
};
export type Estimate = { product_id: string; product_name: string; book_id: string; book_name: string; unit: string | null; quantity: number; unit_price: number; fee_percent: number; tax_percent: number; subtotal: number; fee_amount: number; tax_amount: number; total: number; effective_from: string | null };

async function rpc<T>(name: string, args: Record<string, unknown>, what: string): Promise<T> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("apply_due_price_changes"); // đề nghị đã duyệt tới ngày hiệu lực được áp dụng trước khi đọc giá
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`Không tải được ${what}: ${error.message}`);
  return data as T;
}

type SP = Record<string, string | undefined>;
export type ProductQuery = { q: string; category?: string; unit?: string; book?: string; status?: string; sort: string; dir: "asc" | "desc"; page: number; size: number; pick?: string };
const uuid = (v?: string) => (v && UUID_RE.test(v) ? v : undefined);
export function parseProductQuery(sp: SP, size = 20): ProductQuery {
  return {
    q: (sp.q ?? "").slice(0, 80), category: uuid(sp.danhmuc), unit: uuid(sp.donvi), book: uuid(sp.bang), status: ["active", "inactive", "missing"].includes(sp.tt ?? "") ? sp.tt : undefined,
    sort: ["name", "code", "category", "unit", "price"].includes(sp.sx ?? "") ? sp.sx! : "name", dir: sp.chieu === "desc" ? "desc" : "asc", page: Math.max(1, Math.floor(Number(sp.trang) || 1)), size, pick: uuid(sp.chon),
  };
}
export function productParams(q: Partial<ProductQuery>, extra: Record<string, string | undefined> = {}): string {
  const p: Record<string, string | undefined> = { q: q.q || undefined, danhmuc: q.category, donvi: q.unit, bang: q.book, tt: q.status, sx: q.sort && q.sort !== "name" ? q.sort : undefined, chieu: q.dir === "desc" ? "desc" : undefined, trang: q.page && q.page > 1 ? String(q.page) : undefined, ...extra };
  const e = Object.entries(p).filter(([, v]) => v);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

export const getProducts = (q: ProductQuery) => rpc<ProductList>("product_list", { p_q: q.q || null, p_category: q.category ?? null, p_unit: q.unit ?? null, p_book: q.book ?? null, p_status: q.status ?? null, p_sort: q.sort, p_dir: q.dir, p_limit: q.size, p_offset: (q.page - 1) * q.size }, "danh sách sản phẩm");
export const getPriceHealth = () => rpc<PriceHealth>("price_health", {}, "điều hành giá");
export const getPriceCompare = (id: string) => rpc<PriceCompare>("price_compare", { p_product: id }, "so sánh giá");
export const getBooks = (q: string, status: string | undefined, sort: string, dir: string, page: number, size: number) => rpc<{ total: number; rows: BookRow[] }>("price_book_list", { p_q: q || null, p_status: status ?? null, p_sort: sort, p_dir: dir, p_limit: size, p_offset: (page - 1) * size }, "danh sách bảng giá");
export const getGrid = (id: string) => rpc<Grid>("price_book_grid", { p_book: id }, "bảng giá");
export const getChanges = (status: string | undefined, mine: boolean, book?: string) => rpc<{ total: number; counts: Record<string, number>; rows: ChangeRow[] }>("price_change_list", { p_status: status ?? null, p_mine: mine, p_book: book ?? null, p_limit: 100, p_offset: 0 }, "đề nghị giá");
export const getChange = (id: string) => rpc<ChangeDetail>("price_change_detail", { p_id: id }, "đề nghị giá");
export const getCatalog = (kind: "category" | "unit") => rpc<{ id: string; name: string; is_active: boolean; product_count: number; active_count: number }[]>("catalog_usage", { p_kind: kind }, "danh mục");

export async function getProduct(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("products").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return data as (Record<string, unknown> & { id: string; name: string }) | null;
}
export async function getPricingLookups() {
  const supabase = await createSupabaseServerClient();
  const [c, u, b] = await Promise.all([
    supabase.from("product_categories").select("id, name, is_active").is("deleted_at", null).order("name"),
    supabase.from("product_units").select("id, name, is_active").is("deleted_at", null).order("name"),
    supabase.from("price_books").select("id, name, is_active, requires_approval").is("deleted_at", null).order("name"),
  ]);
  return {
    categories: (c.data ?? []) as { id: string; name: string; is_active: boolean }[], units: (u.data ?? []) as { id: string; name: string; is_active: boolean }[],
    books: (b.data ?? []) as { id: string; name: string; is_active: boolean; requires_approval: boolean }[],
  };
}
