import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { getBooks } from "@/lib/pricing";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Pager, SELECT, SortTh, TABLE, THEAD } from "@/components/hr/ui";
import { qs } from "@/lib/finance-ui";

export const metadata: Metadata = { title: "Bảng giá" };
type SP = Record<string, string | undefined>;

export default async function PriceBooksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><PageHeader title="Bảng giá" /><div className="mt-5"><NoAccess what="Bảng giá" /></div></div>;
  const q = (sp.q ?? "").slice(0, 80), status = ["active", "inactive", "approval"].includes(sp.tt ?? "") ? sp.tt : undefined;
  const sort = ["name", "lines", "status"].includes(sp.sx ?? "") ? sp.sx! : "name", dir = sp.chieu === "desc" ? "desc" : "asc", page = Math.max(1, Math.floor(Number(sp.trang) || 1));
  const list = await getBooks(q, status, sort, dir, page, 15);
  const canWrite = can(ctx, "crm.manage");
  const p = (over: Record<string, string | undefined>) => `/bang-gia${qs({ q: q || undefined, tt: status, sx: sort !== "name" ? sort : undefined, chieu: dir === "desc" ? "desc" : undefined, ...over })}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Bảng giá" eyebrow={`${list.total} bảng giá`} description="Mỗi bảng giá là một tập sản phẩm với đơn giá, % phí và % thuế riêng. Bảng giá cần duyệt chỉ đổi qua đề nghị thay đổi."
        actions={<><Link href="/bang-gia/de-nghi"><Button variant="outline">Đề nghị thay đổi giá</Button></Link>{canWrite ? <Link href={p({ tao: "1" })}><Button><Plus className="size-4" aria-hidden />Thêm bảng giá</Button></Link> : null}</>} />
      {canWrite && sp.tao === "1" ? (
        <Disclosure summary="Thêm bảng giá" defaultOpen icon={<Plus className="size-4" aria-hidden />}>
          <RpcForm rpc="save_price_book" fixed={{ p_id: null, p_active: true }} submitLabel="Tạo bảng giá" redirectTo="/bang-gia/{}" revalidate={["/bang-gia"]} columns={2}
            fields={[{ name: "p_name", label: "Tên bảng giá *", required: true, wide: true }, { name: "p_description", label: "Mô tả", type: "textarea" }]} />
        </Disclosure>
      ) : null}
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Lọc bảng giá">
        {([["", "Tất cả"], ["active", "Đang áp dụng"], ["inactive", "Ngừng"], ["approval", "Cần phê duyệt"]] as const).map(([k, l]) => (
          <Link key={k} href={p({ tt: k || undefined })} aria-current={(status ?? "") === k ? "true" : undefined} className={`rounded-full border px-3 py-1 font-medium ${(status ?? "") === k ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted"}`}>{l}</Link>))}
      </nav>
      <form action="/bang-gia" method="get" role="search" className="flex flex-wrap gap-2">
        {status ? <input type="hidden" name="tt" value={status} /> : null}
        <input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mô tả…" aria-label="Tìm bảng giá" className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
        <select name="tt" defaultValue={status ?? ""} aria-label="Lọc theo trạng thái" className={SELECT}><option value="">Trạng thái: tất cả</option><option value="active">Đang áp dụng</option><option value="inactive">Ngừng</option><option value="approval">Cần phê duyệt</option></select>
        <Button type="submit" variant="outline">Lọc</Button>
      </form>
      {list.rows.length === 0 ? <EmptyState title="Không có bảng giá khớp" /> : (
        <>
          <div className={TABLE}><table className="w-full min-w-[760px] text-sm" data-testid="list-pricebook">
            <thead className={THEAD}><tr><SortTh label="Tên bảng giá" col="name" sort={sort} dir={dir} href={(c, d) => p({ sx: c, chieu: d })} /><th className="px-3.5 py-2.5">Mô tả</th><SortTh label="Dòng giá" col="lines" sort={sort} dir={dir} href={(c, d) => p({ sx: c, chieu: d })} className="text-right" />
              <SortTh label="Trạng thái" col="status" sort={sort} dir={dir} href={(c, d) => p({ sx: c, chieu: d })} /><th className="px-3.5 py-2.5">Phê duyệt</th><th className="px-3.5 py-2.5 text-right">Đề nghị chờ</th></tr></thead>
            <tbody className="divide-y">{list.rows.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40"><td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/bang-gia/${b.id}`}>{b.name}</Link></td><td className="px-3.5 py-2.5 text-muted-foreground">{b.description ?? "—"}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{b.line_count}</td>
                <td className="px-3.5 py-2.5"><Badge className={b.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{b.is_active ? "Đang áp dụng" : "Ngừng"}</Badge></td>
                <td className="px-3.5 py-2.5">{b.requires_approval ? <Badge className="bg-amber-50 text-amber-800 ring-amber-300">Cần phê duyệt</Badge> : <span className="text-muted-foreground">Sửa trực tiếp</span>}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{b.pending_requests ? <Link className="text-primary hover:underline" href={`/bang-gia/de-nghi?tt=pending&bang=${b.id}`}>{b.pending_requests}</Link> : 0}</td></tr>))}</tbody></table></div>
          <Pager total={list.total} page={page} size={15} href={(n) => p({ trang: String(n) })} />
        </>)}
    </div>
  );
}
