import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, Plus, X } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { money } from "@/lib/form-spec";
import { getPriceCompare, getPricingLookups, getProducts, parseProductQuery, productParams, type ProductRow } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Chip, Pager, SELECT, SortTh, TABLE, THEAD } from "@/components/hr/ui";
import { ISSUE_LABEL, ProductThumb } from "@/components/pricing/ui";

export const metadata: Metadata = { title: "Sản phẩm / dịch vụ" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><PageHeader title="Sản phẩm / dịch vụ" /><div className="mt-5"><NoAccess what="Sản phẩm / dịch vụ" /></div></div>;
  const q = parseProductQuery(sp);
  const [list, L] = await Promise.all([getProducts(q), getPricingLookups()]);
  const canWrite = can(ctx, "crm.manage");
  const here = productParams(q);
  const href = (over: Partial<typeof q>, extra: Record<string, string | undefined> = {}) => `/san-pham${productParams({ ...q, page: 1, ...over }, extra)}`;
  const picked = q.pick ? list.rows.find((r) => r.id === q.pick) : undefined;
  const compare = picked ? await getPriceCompare(picked.id) : null;
  const sortHref = (col: string, dir: "asc" | "desc") => href({ sort: col, dir });
  const filtered = !!(q.q || q.category || q.unit || q.book || q.status);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Sản phẩm / dịch vụ" eyebrow={`${list.total} sản phẩm`} description="Dịch vụ bán cho khách. Giá nằm ở các bảng giá; mỗi sản phẩm có một bảng giá mặc định để so sánh và ước tính."
        actions={<><a href={`/xuat/san-pham${q.q ? `?q=${encodeURIComponent(q.q)}` : ""}`} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Xuất CSV</a>{canWrite ? <Link href="/nhap-khach-hang/san-pham" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><FileSpreadsheet className="size-4" aria-hidden />Nhập từ Excel</Link> : null}{canWrite ? <Link href="/san-pham/dieu-hanh"><Button variant="outline">Điều hành giá</Button></Link> : null}{canWrite ? <Link href={`/san-pham${productParams(q, { tao: "1" })}#tao-san-pham`}><Button><Plus className="size-4" aria-hidden />Thêm sản phẩm</Button></Link> : null}</>} />
      {canWrite && sp.tao === "1" ? (
        <div id="tao-san-pham"><Disclosure summary="Thêm sản phẩm / dịch vụ" defaultOpen icon={<Plus className="size-4" aria-hidden />}>
          <RpcForm rpc="save_product" fixed={{ p_id: null }} submitLabel="Tạo sản phẩm" redirectTo="/san-pham/{}" revalidate={["/san-pham"]} columns={3}
            fields={[
              { name: "p_name", label: "Tên *", required: true, wide: true }, { name: "p_code", label: "Mã" },
              { name: "p_category", label: "Danh mục", type: "select", as: "uuid", options: L.categories.filter((c) => c.is_active).map((c) => [c.id, c.name]) },
              { name: "p_unit", label: "Đơn vị tính", type: "select", as: "uuid", options: L.units.filter((c) => c.is_active).map((c) => [c.id, c.name]) },
              { name: "p_default_book", label: "Bảng giá mặc định", type: "select", as: "uuid", options: L.books.filter((b) => b.is_active).map((b) => [b.id, b.name]) },
              { name: "p_active", label: "Tình trạng", type: "checkbox", placeholder: "Đang kinh doanh", defaultValue: true }, { name: "p_description", label: "Mô tả", type: "textarea" },
            ]} />
        </Disclosure></div>
      ) : null}
      <nav aria-label="Tình trạng sử dụng" className="flex flex-wrap gap-2" data-testid="product-views">
        <Chip href={href({ status: undefined })} label="Tất cả" count={list.counts.all} active={!q.status} />
        <Chip href={href({ status: "active" })} label="Đang kinh doanh" count={list.counts.active} active={q.status === "active"} />
        <Chip href={href({ status: "inactive" })} label="Ngừng kinh doanh" count={list.counts.inactive} active={q.status === "inactive"} />
        <Chip href={href({ status: "missing" })} label="Thiếu giá mặc định" count={list.counts.missing} active={q.status === "missing"} />
      </nav>
      <form action="/san-pham" method="get" role="search" className="flex flex-wrap items-center gap-2">
        {q.status ? <input type="hidden" name="tt" value={q.status} /> : null}{q.sort !== "name" ? <input type="hidden" name="sx" value={q.sort} /> : null}{q.dir === "desc" ? <input type="hidden" name="chieu" value="desc" /> : null}
        <input name="q" defaultValue={q.q} placeholder="Tìm theo tên hoặc mã…" aria-label="Tìm sản phẩm" className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
        <select name="danhmuc" defaultValue={q.category ?? ""} aria-label="Lọc theo danh mục" className={SELECT}><option value="">Danh mục: tất cả</option>{L.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="donvi" defaultValue={q.unit ?? ""} aria-label="Lọc theo đơn vị" className={SELECT}><option value="">Đơn vị: tất cả</option>{L.units.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="bang" defaultValue={q.book ?? ""} aria-label="Lọc theo bảng giá" className={SELECT}><option value="">Bảng giá: tất cả</option>{L.books.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <Button type="submit" variant="outline">Lọc</Button>
        {filtered ? <Link href="/san-pham" className="px-2 text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
      </form>
      {list.rows.length === 0 ? <EmptyState title={filtered ? "Không có sản phẩm khớp bộ lọc" : "Chưa có sản phẩm nào"} description={canWrite && !filtered ? "Bấm “Thêm sản phẩm” để bắt đầu." : undefined} /> : (
        <>
          <div className={TABLE}>
            <table className="w-full min-w-[900px] text-sm" data-testid="list-product">
              <thead className={THEAD}><tr>
                <th className="w-14 px-3.5 py-2.5"><span className="sr-only">Ảnh</span></th><SortTh label="Mã" col="code" sort={q.sort} dir={q.dir} href={sortHref} /><SortTh label="Tên" col="name" sort={q.sort} dir={q.dir} href={sortHref} />
                <SortTh label="Danh mục" col="category" sort={q.sort} dir={q.dir} href={sortHref} /><SortTh label="Đơn vị" col="unit" sort={q.sort} dir={q.dir} href={sortHref} /><th className="px-3.5 py-2.5">Bảng giá mặc định</th>
                <SortTh label="Giá mặc định" col="price" sort={q.sort} dir={q.dir} href={sortHref} className="text-right" /><th className="px-3.5 py-2.5">Tình trạng</th></tr></thead>
              <tbody className="divide-y">
                {list.rows.map((r: ProductRow) => (
                  <tr key={r.id} id={`row-${r.id}`} className={cn("relative hover:bg-muted/40", picked?.id === r.id && "bg-primary-soft/40")} data-testid="product-row">
                    <td className="px-3.5 py-2"><ProductThumb id={r.image_file_id} name={r.name} /></td>
                    <td className="px-3.5 py-2 align-middle font-medium">{r.code ?? "—"}</td>
                    <td className="px-3.5 py-2 align-middle"><Link href={`/san-pham${productParams(q, { chon: r.id })}#row-${r.id}`} className="font-medium text-primary hover:underline after:absolute after:inset-0 after:content-['']" aria-label={`Xem nhanh ${r.name}`}>{r.name}</Link></td>
                    <td className="px-3.5 py-2 align-middle">{r.category_name ?? "—"}</td><td className="px-3.5 py-2 align-middle">{r.unit_name ?? "—"}</td><td className="px-3.5 py-2 align-middle">{r.default_book_name ?? <span className="text-muted-foreground">Chưa chọn</span>}</td>
                    <td className="px-3.5 py-2 text-right align-middle tabular-nums">{r.default_price !== null ? <>{money(r.default_price)}{r.unit_name ? <span className="text-xs text-muted-foreground"> / {r.unit_name}</span> : null}</> : r.list_price ? <span className="text-xs text-muted-foreground" title="Giá niêm yết nhập từ trước khi có bảng giá mặc định">Niêm yết {money(r.list_price)}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3.5 py-2 align-middle"><div className="flex flex-col gap-1"><Badge className={r.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{r.is_active ? "Đang kinh doanh" : "Ngừng kinh doanh"}</Badge>
                      {r.price_issue ? <span className="text-xs text-amber-700">{ISSUE_LABEL[r.price_issue]}</span> : null}</div></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pager total={list.total} page={q.page} size={q.size} href={(p) => `/san-pham${productParams({ ...q, page: p })}`} />
        </>
      )}
      {picked ? (
        <>
          <Link href={`/san-pham${here}`} aria-label="Đóng xem nhanh" className="fixed inset-0 z-30 bg-black/20" />
          <aside role="dialog" aria-label={`Xem nhanh ${picked.name}`} className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-5 shadow-xl" data-testid="quick-view">
            <header className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3"><ProductThumb id={picked.image_file_id} name={picked.name} size={64} /><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{picked.code ?? "Chưa có mã"}</p><h2 className="text-lg font-semibold leading-snug">{picked.name}</h2>
                <Badge className={picked.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{picked.is_active ? "Đang kinh doanh" : "Ngừng kinh doanh"}</Badge></div></div>
              <Link href={`/san-pham${here}`} aria-label="Đóng" className="grid size-8 place-items-center rounded-lg border hover:bg-muted"><X className="size-4" aria-hidden /></Link>
            </header>
            <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Danh mục</dt><dd>{picked.category_name ?? "—"}</dd><dt className="text-muted-foreground">Đơn vị tính</dt><dd>{picked.unit_name ?? "—"}</dd>
              <dt className="text-muted-foreground">Bảng mặc định</dt><dd>{picked.default_book_name ?? "Chưa chọn"}</dd><dt className="text-muted-foreground">Tài liệu</dt><dd>{picked.file_count} tệp</dd>
            </dl>
            <section aria-label="Giá theo bảng giá"><h3 className="mb-1.5 text-sm font-semibold">Giá theo bảng giá{compare?.unit ? ` (₫ / ${compare.unit})` : ""}</h3>
              {compare && compare.rows.length ? (
                <ul className="divide-y rounded-lg border text-sm" data-testid="quick-prices">{compare.rows.map((r) => (
                  <li key={r.book_id} className="flex items-center justify-between gap-2 px-3 py-2"><span>{r.book_name}{r.is_default ? <span className="ml-1.5 text-xs text-primary">mặc định</span> : null}{!r.is_active ? <span className="ml-1.5 text-xs text-muted-foreground">ngừng</span> : null}</span><span className="tabular-nums">{money(r.unit_price)}</span></li>))}</ul>
              ) : <p className="text-sm text-muted-foreground">Chưa có dòng giá ở bảng giá nào.</p>}
              {picked.price_issue ? <p className="mt-2 text-xs text-amber-700">{ISSUE_LABEL[picked.price_issue]}.</p> : null}
            </section>
            <div className="mt-auto"><Link href={`/san-pham/${picked.id}?tu=${encodeURIComponent(here)}`}><Button className="w-full" data-testid="open-product">Mở hồ sơ</Button></Link></div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
