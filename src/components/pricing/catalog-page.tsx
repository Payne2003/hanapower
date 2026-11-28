import Link from "next/link";
import { requireContext, can } from "@/lib/auth";
import { getCatalog } from "@/lib/pricing";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { NoAccess } from "@/components/data-table";
import { TABLE, THEAD } from "@/components/hr/ui";
import { EmptyState } from "@/components/ui/alert";
import { Plus } from "lucide-react";

/** Danh mục sản phẩm / Đơn vị tính: số sản phẩm đang dùng (bấm mở danh sách tương ứng); không ngừng dùng khi còn sản phẩm đang bán. */
export async function CatalogPage({ kind }: { kind: "category" | "unit" }) {
  const ctx = await requireContext();
  const title = kind === "category" ? "Danh mục sản phẩm" : "Đơn vị tính";
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><PageHeader title={title} /><div className="mt-5"><NoAccess what={title} /></div></div>;
  const items = await getCatalog(kind);
  const canWrite = can(ctx, "crm.manage");
  const param = kind === "category" ? "danhmuc" : "donvi";
  const path = kind === "category" ? "/danh-muc" : "/don-vi";
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={title} eyebrow={`${items.length} mục`} description={kind === "category" ? "Nhóm sản phẩm / dịch vụ. Không ngừng dùng được danh mục khi còn sản phẩm đang kinh doanh thuộc danh mục đó." : "Đơn vị tính của sản phẩm (video, phút, tháng…). Không ngừng dùng được đơn vị khi còn sản phẩm đang kinh doanh dùng nó."} />
      {canWrite ? <Disclosure summary={`Thêm ${kind === "category" ? "danh mục" : "đơn vị"}`} icon={<Plus className="size-4" aria-hidden />}><RpcForm rpc="save_catalog_item" fixed={{ p_kind: kind, p_id: null, p_active: true }} submitLabel="Thêm" revalidate={[path]} resetOnSuccess columns={1} fields={[{ name: "p_name", label: "Tên *", required: true }]} /></Disclosure> : null}
      {items.length === 0 ? <EmptyState title="Chưa có mục nào" /> : (
        <div className={TABLE}><table className="w-full text-sm" data-testid={`list-${kind}`}>
          <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Tên</th><th className="px-3.5 py-2.5 text-right">Sản phẩm đang dùng</th><th className="px-3.5 py-2.5">Trạng thái</th>{canWrite ? <th className="px-3.5 py-2.5">Sửa</th> : null}</tr></thead>
          <tbody className="divide-y">{items.map((i) => (
            <tr key={i.id}><td className="px-3.5 py-2.5 font-medium">{i.name}</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">{i.product_count ? <Link className="text-primary hover:underline" href={`/san-pham?${param}=${i.id}`} data-testid="usage-link">{i.product_count} sản phẩm{i.active_count !== i.product_count ? ` (${i.active_count} đang bán)` : ""}</Link> : 0}</td>
              <td className="px-3.5 py-2.5"><Badge className={i.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{i.is_active ? "Đang sử dụng" : "Ngừng sử dụng"}</Badge></td>
              {canWrite ? <td className="px-3.5 py-2.5"><details><summary className="cursor-pointer text-primary">Sửa</summary><div className="mt-2 w-72"><RpcForm rpc="save_catalog_item" fixed={{ p_kind: kind, p_id: i.id }} submitLabel="Lưu" revalidate={[path]} columns={1} variant="outline"
                fields={[{ name: "p_name", label: "Tên *", required: true, defaultValue: i.name }, { name: "p_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang sử dụng", defaultValue: i.is_active }]} /></div></details></td> : null}</tr>))}</tbody></table></div>
      )}
    </div>
  );
}
