import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { getPriceHealth, getPricingLookups } from "@/lib/pricing";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/data-table";
import { RpcForm } from "@/components/rpc-form";
import { ISSUE_ACTION, ISSUE_LABEL } from "@/components/pricing/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Điều hành sản phẩm & giá" };

export default async function PricingControlPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.manage")) return <div className="mx-auto max-w-3xl"><PageHeader title="Điều hành sản phẩm & giá" /><div className="mt-5"><NoAccess what="Điều hành sản phẩm & giá" /></div></div>;
  const [h, L] = await Promise.all([getPriceHealth(), getPricingLookups()]);
  const issue = ["no_default", "default_inactive", "no_line"].includes(sp.loi ?? "") ? sp.loi! : undefined;
  const items = h.items.filter((i) => !issue || i.issue === issue);
  const activeBooks = L.books.filter((b) => b.is_active).map((b) => [b.id, b.name] as [string, string]);
  const rev = ["/san-pham/dieu-hanh", "/san-pham"];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/san-pham" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Sản phẩm / dịch vụ</Link>
      <PageHeader title="Điều hành sản phẩm & giá" description="Sản phẩm đang kinh doanh phải có bảng giá mặc định đang dùng và dòng giá trong bảng đó. Giá 0 là giá hợp lệ; chỉ thiếu dòng giá mới là lỗi. Mỗi sản phẩm chỉ đếm một lần." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="price-health">
        <StatCard label="Sản phẩm đang kinh doanh" value={h.active_products} tone="green" href="/san-pham?tt=active" testId="ph-active" />
        <StatCard label="Thiếu giá mặc định hợp lệ" value={h.missing_products} tone={h.missing_products ? "orange" : "slate"} href="/san-pham?tt=missing" hint="Mỗi sản phẩm một lần, theo product_id" testId="ph-missing" />
        <StatCard label="Đề nghị chờ duyệt" value={h.pending_requests} tone={h.pending_requests ? "amber" : "slate"} href="/bang-gia/de-nghi?tt=pending" testId="ph-pending" />
        <StatCard label="Đã duyệt · chờ hiệu lực" value={h.waiting_effective} tone="sky" href="/bang-gia/de-nghi?tt=waiting" testId="ph-waiting" />
      </section>
      <nav aria-label="Loại lỗi giá" className="flex flex-wrap gap-2 text-sm">
        {([["", "Tất cả lỗi", h.missing_products], ["no_default", ISSUE_LABEL.no_default!, h.by_issue.no_default ?? 0], ["default_inactive", ISSUE_LABEL.default_inactive!, h.by_issue.default_inactive ?? 0], ["no_line", ISSUE_LABEL.no_line!, h.by_issue.no_line ?? 0]] as const).map(([k, l, n]) => (
          <Link key={k} href={k ? `/san-pham/dieu-hanh?loi=${k}` : "/san-pham/dieu-hanh"} aria-current={(issue ?? "") === k ? "true" : undefined} className={cn("rounded-full border px-3 py-1 font-medium", (issue ?? "") === k ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>{l} <span className="tabular-nums text-muted-foreground">{n}</span></Link>))}
      </nav>
      {items.length === 0 ? <EmptyState title="Không có sản phẩm nào thiếu giá" description="Mọi sản phẩm đang kinh doanh đều có giá mặc định hợp lệ." /> : (
        <ul className="divide-y rounded-xl border bg-card shadow-[var(--shadow-card)]" data-testid="price-issues">
          {items.map((i) => (
            <li key={i.product_id} className="flex flex-col gap-3 px-4 py-3 text-sm" data-product={i.product_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><Link className="font-medium text-primary hover:underline" href={`/san-pham/${i.product_id}`}>{i.name}</Link>{i.code ? <span className="ml-2 text-xs text-muted-foreground">{i.code}</span> : null}
                  <p className="text-xs text-muted-foreground">{i.default_book_name ? `Bảng mặc định: ${i.default_book_name}` : "Chưa có bảng mặc định"}</p></div>
                <Badge className="bg-amber-50 text-amber-800 ring-amber-300">{ISSUE_LABEL[i.issue]}</Badge>
              </div>
              {i.issue === "no_line" && i.default_book_id ? (
                <Link href={`/bang-gia/${i.default_book_id}?them=${i.product_id}`} className="w-fit rounded-lg border bg-card px-3 py-1.5 font-medium text-primary hover:bg-primary-soft/40" data-testid="add-line-action">{ISSUE_ACTION.no_line} (mở “{i.default_book_name}”)</Link>
              ) : (
                <RpcForm rpc="set_product_default_book" fixed={{ p_product: i.product_id }} submitLabel={ISSUE_ACTION[i.issue] ?? "Lưu"} revalidate={rev} columns={2} variant="outline"
                  fields={[{ name: "p_book", label: "Bảng giá mặc định", type: "select", as: "uuid", required: true, options: activeBooks }]} />
              )}
            </li>))}
        </ul>
      )}
      <Alert tone="info">Sau khi chọn bảng mặc định, sản phẩm vẫn cần có dòng giá trong bảng đó — nếu chưa, sản phẩm chuyển sang “Bảng mặc định thiếu dòng giá” và hiện nút “Bổ sung dòng giá”.</Alert>
    </div>
  );
}
