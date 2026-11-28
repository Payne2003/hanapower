import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { getChanges } from "@/lib/pricing";
import { qs, UUID_RE } from "@/lib/finance-ui";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Chip, TABLE, THEAD } from "@/components/hr/ui";
import { REQUEST_STATUS, RequestBadge } from "@/components/pricing/ui";

export const metadata: Metadata = { title: "Đề nghị thay đổi giá" };

export default async function PriceRequestsPage({ searchParams }: { searchParams: Promise<{ tt?: string; cua?: string; bang?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><NoAccess what="Đề nghị thay đổi giá" /></div>;
  const status = Object.keys(REQUEST_STATUS).includes(sp.tt ?? "") ? sp.tt : undefined, mine = sp.cua === "1", book = sp.bang && UUID_RE.test(sp.bang) ? sp.bang : undefined;
  const data = await getChanges(status, mine, book);
  const all = await getChanges(undefined, mine, book);
  const l = (over: Record<string, string | undefined>) => `/bang-gia/de-nghi${qs({ tt: status, cua: mine ? "1" : undefined, bang: book, ...over })}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/bang-gia" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Bảng giá</Link>
      <PageHeader title="Đề nghị thay đổi giá" eyebrow={`${data.total} đề nghị`} description="Nháp → Chờ duyệt → Đã duyệt (chờ hiệu lực → đang áp dụng) hoặc Yêu cầu chỉnh sửa. Người lập và người duyệt là hai người khác nhau." />
      <nav aria-label="Trạng thái" className="flex flex-wrap gap-2" data-testid="request-filters">
        <Chip href={l({ tt: undefined })} label="Tất cả" count={all.total} active={!status} />
        {Object.entries(REQUEST_STATUS).map(([k, [label]]) => <Chip key={k} href={l({ tt: k })} label={label} count={all.counts[k] ?? 0} active={status === k} />)}
        <Chip href={l({ cua: mine ? undefined : "1" })} label="Của tôi" count={mine ? all.total : 0} active={mine} />
      </nav>
      {data.rows.length === 0 ? <EmptyState title="Không có đề nghị nào" description="Đề nghị được tạo từ trang chi tiết bảng giá khi bảng cần phê duyệt." /> : (
        <div className={TABLE}><table className="w-full min-w-[820px] text-sm" data-testid="list-requests">
          <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Mã</th><th className="px-3.5 py-2.5">Bảng giá</th><th className="px-3.5 py-2.5 text-right">Số dòng</th><th className="px-3.5 py-2.5">Người lập</th><th className="px-3.5 py-2.5">Ngày hiệu lực</th><th className="px-3.5 py-2.5">Trạng thái</th></tr></thead>
          <tbody className="divide-y">{data.rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40"><td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/bang-gia/de-nghi/${r.id}`}>{r.code}</Link></td><td className="px-3.5 py-2.5">{r.book_name}</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">{r.line_count}</td><td className="px-3.5 py-2.5">{r.requester ?? "—"}</td><td className="px-3.5 py-2.5">{formatDate(r.effective_date)}</td><td className="px-3.5 py-2.5"><RequestBadge s={r.display_status} /></td></tr>))}</tbody></table></div>
      )}
    </div>
  );
}
