import "server-only";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormField } from "@/lib/form-spec";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";

export type Row = Record<string, unknown>;
export type LookupKey = "accounts" | "contacts" | "industries" | "lead_sources" | "product_categories" | "product_units" | "price_books" | "products" | "people" | "departments" | "positions";
export type Lookups = Partial<Record<LookupKey, [string, string][]>>;

const NAME_TABLES: Record<Exclude<LookupKey, "contacts" | "people">, string> = {
  accounts: "accounts", industries: "industries", lead_sources: "lead_sources", product_categories: "product_categories",
  product_units: "product_units", price_books: "price_books", products: "products", departments: "departments", positions: "positions",
};

/** Tải danh sách [id, nhãn] cho các ô chọn / hiển thị tên liên kết. Quyền xem do RLS quyết định. */
export async function loadLookups(keys: LookupKey[]): Promise<Lookups> {
  const supabase = await createSupabaseServerClient();
  const out: Lookups = {};
  await Promise.all([...new Set(keys)].map(async (k) => {
    if (k === "people") {
      const { data } = await supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
      out.people = (data ?? []).map((r) => [r.id as string, r.full_name as string]);
    } else if (k === "contacts") {
      const { data } = await supabase.from("contacts").select("id, first_name, last_name").is("deleted_at", null).order("last_name").limit(1000);
      out.contacts = (data ?? []).map((r) => [r.id as string, `${r.first_name ?? ""} ${r.last_name}`.trim()]);
    } else {
      const { data } = await supabase.from(NAME_TABLES[k]).select("id, name").order("name").limit(2000);
      out[k] = (data ?? []).map((r) => [r.id as string, r.name as string]);
    }
  }));
  return out;
}

export const nameOf = (L: Lookups, k: LookupKey, id: unknown): string => (id ? (L[k]?.find(([v]) => v === id)?.[1] ?? "—") : "—");
const opt = (L: Lookups, k: LookupKey): [string, string][] => L[k] ?? [];

export const LEAD_STATUS: Record<string, [string, string]> = {
  new: ["Mới", "bg-sky-50 text-sky-800 ring-sky-300"], contacted: ["Đã liên hệ", "bg-indigo-50 text-indigo-800 ring-indigo-300"],
  working: ["Đang theo", "bg-amber-50 text-amber-800 ring-amber-300"], qualified: ["Đạt chuẩn", "bg-emerald-50 text-emerald-800 ring-emerald-300"],
  nurturing: ["Nuôi dưỡng", "bg-violet-50 text-violet-800 ring-violet-300"], unqualified: ["Không đạt", "bg-neutral-100 text-neutral-600 ring-neutral-300"],
  converted: ["Đã chuyển đổi", "bg-emerald-100 text-emerald-900 ring-emerald-400"],
};
export const RATING: Record<string, [string, string]> = {
  hot: ["Nóng", "bg-red-50 text-red-800 ring-red-300"], warm: ["Ấm", "bg-amber-50 text-amber-800 ring-amber-300"], cold: ["Lạnh", "bg-sky-50 text-sky-800 ring-sky-300"],
};
export const ACCOUNT_TYPE: Record<string, string> = { customer: "Khách hàng", competitor: "Đối thủ", partner: "Đối tác" };
export const STAGE_OPP: Record<string, [string, string]> = {
  needs_analysis: ["Phân tích nhu cầu", "bg-sky-50 text-sky-800 ring-sky-300"], presentation: ["Trình bày giải pháp", "bg-indigo-50 text-indigo-800 ring-indigo-300"],
  negotiation: ["Thương lượng", "bg-amber-50 text-amber-800 ring-amber-300"], won: ["Thắng", "bg-emerald-50 text-emerald-800 ring-emerald-300"], lost: ["Thua", "bg-neutral-100 text-neutral-600 ring-neutral-300"],
};
export const FORECAST: Record<string, string> = { pipeline: "Đường ống", best_case: "Khả quan", commit: "Cam kết", closed: "Đã chốt", omitted: "Loại bỏ" };

export const tag = (map: Record<string, [string, string]>, v: unknown): ReactNode => {
  const e = map[String(v)];
  return e ? <Badge className={e[1]}>{e[0]}</Badge> : <>{String(v ?? "—")}</>;
};

export type Entity = {
  key: string; slug: string; table: string; title: string; singular: string;
  /** quyền xem (để ẩn menu) và quyền ghi */
  view: string; write: string;
  soft: boolean;
  searchCols: string[];
  order: [col: string, asc: boolean];
  lookups: LookupKey[];
  fields: (L: Lookups) => FormField[];
  columns: { label: string; cell: (r: Row, L: Lookups) => ReactNode; className?: string }[];
  titleOf: (r: Row) => string;
  /** thêm bản ghi mới trong trang danh sách? */
  creatable?: boolean;
  description?: string;
  filter?: { col: string; label: string; options: [string, string][] };
  defaults?: Row;
  /** false = không có nút xuất CSV */
  exportable?: boolean;
  /** Chế độ xem Kanban: cột theo `col`, chuyển cột bằng RPC. */
  kanban?: { col: string; columns: { value: string; label: string; color: string; locked?: boolean }[]; rpc: string; idArg: string; statusArg: string; prompt?: { value: string; text: string; arg: string };
             card: (r: Row, L: Lookups) => { title: string; sub?: string; meta?: string }; amount?: (r: Row) => number };
};

const simple = (key: string, slug: string, table: string, title: string, singular: string, perm: [string, string], soft = true): Entity => ({
  key, slug, table, title, singular, view: perm[0], write: perm[1], soft, searchCols: ["name"], order: ["name", true], lookups: [], creatable: true,
  fields: () => [{ name: "name", label: "Tên", required: true, wide: true }, { name: "is_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang sử dụng", defaultValue: true }],
  columns: [{ label: "Tên", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Trạng thái", cell: (r) => (r.is_active === false ? <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-300">Ngừng</Badge> : <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đang dùng</Badge>) }],
  titleOf: (r) => String(r.name ?? ""),
});

const SALUTATION: [string, string][] = [["Anh", "Anh"], ["Chị", "Chị"], ["Ông", "Ông"], ["Bà", "Bà"]];

export const ENTITIES: Entity[] = [
  {
    key: "lead", slug: "lead", table: "leads", title: "Lead", singular: "lead", view: "crm.view", write: "crm.manage", soft: true,
    searchCols: ["first_name", "last_name", "company"], order: ["created_at", false], lookups: ["industries", "lead_sources", "people"], creatable: true,
    description: "Người / công ty tiềm năng chưa được xác nhận. Khi đạt chuẩn, chuyển đổi thành tài khoản + liên hệ + cơ hội.",
    kanban: {
      col: "status", rpc: "set_lead_status", idArg: "p_id", statusArg: "p_status",
      columns: Object.entries(LEAD_STATUS).map(([value, v]) => ({ value, label: v[0], color: ({ new: "#2f8fb8", contacted: "#4f5bd5", working: "#e0a22a", qualified: "#0f6b3f", nurturing: "#7a5ac8", unqualified: "#c9ccd1", converted: "#4aa39a" } as Record<string, string>)[value] ?? "#8a8f98", locked: value === "converted" })),
      card: (r) => ({ title: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), sub: String(r.company ?? "") || undefined, meta: [RATING[String(r.rating)]?.[0], (r.phones as string[])?.[0]].filter(Boolean).join(" · ") }),
    },
    filter: { col: "status", label: "Trạng thái", options: Object.entries(LEAD_STATUS).map(([k, v]) => [k, v[0]]) },
    fields: (L) => [
      { name: "title", label: "Xưng hô", type: "select", options: SALUTATION },
      { name: "last_name", label: "Họ và tên đệm *", required: true }, { name: "first_name", label: "Tên" },
      { name: "company", label: "Công ty" }, { name: "job_title", label: "Chức danh" },
      { name: "status", label: "Trạng thái", type: "select", required: true, defaultValue: "new", options: Object.entries(LEAD_STATUS).filter(([k]) => k !== "converted").map(([k, v]) => [k, v[0]]) },
      { name: "rating", label: "Mức độ quan tâm", type: "select", required: true, defaultValue: "warm", options: Object.entries(RATING).map(([k, v]) => [k, v[0]]) },
      { name: "source_id", label: "Nguồn lead", type: "select", options: opt(L, "lead_sources") },
      { name: "industry_id", label: "Ngành nghề", type: "select", options: opt(L, "industries") },
      { name: "phones", label: "Số điện thoại", type: "tags", hint: "Nhiều số, cách nhau dấu phẩy" }, { name: "emails", label: "Email", type: "tags" },
      { name: "websites", label: "Website", type: "tags" },
      { name: "annual_revenue", label: "Doanh thu năm", type: "number" }, { name: "employee_count", label: "Số nhân viên", type: "number" },
      { name: "address", label: "Địa chỉ", wide: true }, { name: "owner_id", label: "Người phụ trách", type: "select", options: opt(L, "people") },
      { name: "note", label: "Ghi chú", type: "textarea" },
    ],
    columns: [
      { label: "Họ tên", cell: (r) => <span className="font-medium">{`${r.title ?? ""} ${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()}</span> },
      { label: "Công ty", cell: (r) => String(r.company ?? "—") },
      { label: "Trạng thái", cell: (r) => tag(LEAD_STATUS, r.status) }, { label: "Mức độ", cell: (r) => tag(RATING, r.rating) },
      { label: "Nguồn", cell: (r, L) => nameOf(L, "lead_sources", r.source_id), className: "hidden md:table-cell" },
      { label: "Phụ trách", cell: (r, L) => nameOf(L, "people", r.owner_id), className: "hidden lg:table-cell" },
    ],
    titleOf: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
  },
  {
    key: "account", slug: "tai-khoan", table: "accounts", title: "Tài khoản (khách hàng)", singular: "tài khoản", view: "crm.view", write: "crm.manage", soft: true,
    searchCols: ["name", "tax_code"], order: ["name", true], lookups: ["accounts", "industries", "people"], creatable: true,
    description: "Công ty / tổ chức khách hàng, đối tác hoặc đối thủ.",
    filter: { col: "type", label: "Loại", options: Object.entries(ACCOUNT_TYPE) },
    fields: (L) => [
      { name: "name", label: "Tên công ty *", required: true, wide: true },
      { name: "type", label: "Loại", type: "select", required: true, defaultValue: "customer", options: Object.entries(ACCOUNT_TYPE) },
      { name: "industry_id", label: "Ngành nghề", type: "select", options: opt(L, "industries") },
      { name: "parent_account_id", label: "Công ty mẹ", type: "select", options: opt(L, "accounts") },
      { name: "tax_code", label: "Mã số thuế" },
      { name: "phones", label: "Số điện thoại", type: "tags" }, { name: "emails", label: "Email", type: "tags" }, { name: "websites", label: "Website", type: "tags" },
      { name: "employee_count", label: "Số nhân viên", type: "number" }, { name: "annual_revenue", label: "Doanh thu năm", type: "number" },
      { name: "billing_address", label: "Địa chỉ xuất hóa đơn", wide: true }, { name: "shipping_address", label: "Địa chỉ giao nhận", wide: true },
      { name: "owner_id", label: "Người phụ trách", type: "select", options: opt(L, "people") },
      { name: "is_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang hoạt động", defaultValue: true },
      { name: "note", label: "Ghi chú", type: "textarea" },
    ],
    columns: [
      { label: "Tên", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Loại", cell: (r) => ACCOUNT_TYPE[String(r.type)] ?? "—" },
      { label: "Ngành", cell: (r, L) => nameOf(L, "industries", r.industry_id), className: "hidden md:table-cell" },
      { label: "Điện thoại", cell: (r) => (r.phones as string[])?.[0] ?? "—", className: "hidden md:table-cell" },
      { label: "Phụ trách", cell: (r, L) => nameOf(L, "people", r.owner_id), className: "hidden lg:table-cell" },
    ],
    titleOf: (r) => String(r.name ?? ""),
  },
  {
    key: "contact", slug: "lien-he", table: "contacts", title: "Liên hệ", singular: "liên hệ", view: "crm.view", write: "crm.manage", soft: true,
    searchCols: ["first_name", "last_name", "job_title"], order: ["last_name", true], lookups: ["accounts", "people"], creatable: true,
    description: "Người đầu mối tại các tài khoản khách hàng.",
    fields: (L) => [
      { name: "salutation", label: "Xưng hô", type: "select", options: SALUTATION },
      { name: "last_name", label: "Họ và tên đệm *", required: true }, { name: "first_name", label: "Tên" },
      { name: "account_id", label: "Công ty", type: "select", options: opt(L, "accounts") }, { name: "job_title", label: "Chức danh" },
      { name: "phones", label: "Số điện thoại", type: "tags" }, { name: "emails", label: "Email", type: "tags" },
      { name: "date_of_birth", label: "Ngày sinh", type: "date" }, { name: "do_not_call", label: "Không gọi điện", type: "checkbox", placeholder: "Khách yêu cầu không gọi" },
      { name: "owner_id", label: "Người phụ trách", type: "select", options: opt(L, "people") }, { name: "note", label: "Ghi chú", type: "textarea" },
    ],
    columns: [
      { label: "Họ tên", cell: (r) => <span className="font-medium">{`${r.salutation ?? ""} ${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()}</span> },
      { label: "Công ty", cell: (r, L) => nameOf(L, "accounts", r.account_id) }, { label: "Chức danh", cell: (r) => String(r.job_title ?? "—"), className: "hidden md:table-cell" },
      { label: "Điện thoại", cell: (r) => (r.phones as string[])?.[0] ?? "—", className: "hidden md:table-cell" },
      { label: "Email", cell: (r) => (r.emails as string[])?.[0] ?? "—", className: "hidden lg:table-cell" },
    ],
    titleOf: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
  },
  {
    key: "opportunity", slug: "co-hoi", table: "opportunities", title: "Cơ hội", singular: "cơ hội", view: "crm.view", write: "crm.manage", soft: true,
    searchCols: ["name"], order: ["created_at", false], lookups: ["accounts", "contacts", "price_books", "people"], creatable: true,
    description: "Cơ hội bán hàng: thêm sản phẩm / dịch vụ → báo giá → hợp đồng.",
    kanban: {
      col: "stage", rpc: "set_opportunity_stage", idArg: "p_id", statusArg: "p_stage", prompt: { value: "lost", text: "Lý do thua cơ hội?", arg: "p_lost_reason" },
      columns: Object.entries(STAGE_OPP).map(([value, v]) => ({ value, label: v[0], color: ({ needs_analysis: "#2f8fb8", presentation: "#4f5bd5", negotiation: "#e0a22a", won: "#0f6b3f", lost: "#c9ccd1" } as Record<string, string>)[value] ?? "#8a8f98", locked: value === "won" })),
      card: (r, L) => ({ title: String(r.name), sub: nameOf(L, "accounts", r.account_id), meta: `${money(r.expected_revenue as number)} · ${Number(r.win_probability ?? 0)}%` }),
      amount: (r) => Number(r.expected_revenue ?? 0),
    },
    filter: { col: "stage", label: "Giai đoạn", options: Object.entries(STAGE_OPP).map(([k, v]) => [k, v[0]]) },
    fields: (L) => [
      { name: "name", label: "Tên cơ hội *", required: true, wide: true },
      { name: "account_id", label: "Khách hàng *", type: "select", required: true, options: opt(L, "accounts") },
      { name: "contact_id", label: "Liên hệ", type: "select", options: opt(L, "contacts") },
      { name: "price_book_id", label: "Bảng giá", type: "select", options: opt(L, "price_books") },
      { name: "expected_close_date", label: "Dự kiến chốt", type: "date" },
      { name: "owner_id", label: "Người phụ trách", type: "select", options: opt(L, "people") },
      { name: "current_situation", label: "Hiện trạng của khách", type: "textarea" }, { name: "needs", label: "Nhu cầu", type: "textarea" },
      { name: "solution", label: "Giải pháp đề xuất", type: "textarea" },
    ],
    columns: [
      { label: "Cơ hội", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Khách hàng", cell: (r, L) => nameOf(L, "accounts", r.account_id) },
      { label: "Giai đoạn", cell: (r) => tag(STAGE_OPP, r.stage) }, { label: "Giá trị", cell: (r) => money(r.expected_revenue as number), className: "text-right tabular-nums" },
      { label: "Xác suất", cell: (r) => `${Number(r.win_probability ?? 0)}%`, className: "hidden md:table-cell" },
      { label: "Dự kiến chốt", cell: (r) => formatDate(r.expected_close_date as string), className: "hidden lg:table-cell" },
    ],
    titleOf: (r) => String(r.name ?? ""),
  },
  {
    key: "product", slug: "san-pham", table: "products", title: "Sản phẩm / dịch vụ", singular: "sản phẩm", view: "crm.view", write: "crm.manage", soft: true,
    searchCols: ["name", "code"], order: ["name", true], lookups: ["product_categories", "product_units"], creatable: true,
    description: "Danh mục dịch vụ bán cho khách (sản xuất video, hậu kỳ, quản lý kênh…).",
    fields: (L) => [
      { name: "name", label: "Tên *", required: true, wide: true }, { name: "code", label: "Mã" },
      { name: "category_id", label: "Danh mục", type: "select", options: opt(L, "product_categories") },
      { name: "unit_id", label: "Đơn vị", type: "select", options: opt(L, "product_units") },
      { name: "list_price", label: "Giá niêm yết (₫) *", type: "number", required: true, min: 0, defaultValue: 0 },
      { name: "is_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang bán", defaultValue: true },
      { name: "description", label: "Mô tả", type: "textarea" },
    ],
    columns: [
      { label: "Tên", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Mã", cell: (r) => String(r.code ?? "—"), className: "hidden md:table-cell" },
      { label: "Danh mục", cell: (r, L) => nameOf(L, "product_categories", r.category_id) }, { label: "Đơn vị", cell: (r, L) => nameOf(L, "product_units", r.unit_id), className: "hidden md:table-cell" },
      { label: "Giá niêm yết", cell: (r) => money(r.list_price as number), className: "text-right tabular-nums" },
    ],
    titleOf: (r) => String(r.name ?? ""),
  },
  { ...simple("category", "danh-muc", "product_categories", "Danh mục sản phẩm", "danh mục", ["crm.view", "crm.manage"]), description: "Nhóm sản phẩm / dịch vụ." },
  { ...simple("unit", "don-vi", "product_units", "Đơn vị tính", "đơn vị", ["crm.view", "crm.manage"]), description: "Đơn vị tính của sản phẩm (video, phút, tháng…)." },
  { ...simple("source", "nguon-lead", "lead_sources", "Nguồn lead", "nguồn lead", ["crm.view", "crm.manage"]), description: "Khách tiềm năng đến từ đâu." },
  { ...simple("industry", "nganh-nghe", "industries", "Ngành nghề", "ngành nghề", ["crm.view", "crm.manage"]), description: "Ngành hoạt động của khách hàng." },
  {
    ...simple("pricebook", "bang-gia", "price_books", "Bảng giá", "bảng giá", ["crm.view", "crm.manage"]),
    description: "Mỗi bảng giá là một tập sản phẩm với đơn giá, phí và thuế riêng.",
    fields: () => [{ name: "name", label: "Tên bảng giá *", required: true, wide: true }, { name: "description", label: "Mô tả", type: "textarea" }, { name: "is_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang áp dụng", defaultValue: true }],
    columns: [{ label: "Tên", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Mô tả", cell: (r) => String(r.description ?? "—") },
      { label: "Trạng thái", cell: (r) => (r.is_active === false ? "Ngừng" : "Đang áp dụng") }],
  },
  {
    ...simple("position", "chuc-vu", "positions", "Chức vụ", "chức vụ", ["users.manage", "users.manage"]),
    description: "Danh mục chức vụ trong công ty.",
  },
  {
    key: "department", slug: "phong-ban", table: "departments", title: "Phòng ban", singular: "phòng ban", view: "users.manage", write: "users.manage", soft: false,
    searchCols: ["name"], order: ["name", true], lookups: ["people"], creatable: true, description: "Các bộ phận trong công ty; mỗi dự án có thể có thành viên từ nhiều phòng ban.",
    fields: (L) => [{ name: "name", label: "Tên phòng ban *", required: true, wide: true }, { name: "manager_id", label: "Trưởng phòng", type: "select", options: opt(L, "people") }],
    columns: [{ label: "Phòng ban", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Trưởng phòng", cell: (r, L) => nameOf(L, "people", r.manager_id) }],
    titleOf: (r) => String(r.name ?? ""),
  },
];

export const entityBySlug = (slug: string) => ENTITIES.find((e) => e.slug === slug);
