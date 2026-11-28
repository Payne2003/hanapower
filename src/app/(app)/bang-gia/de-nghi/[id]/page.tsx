import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { money } from "@/lib/form-spec";
import { getChange } from "@/lib/pricing";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RpcButton } from "@/components/rpc-button";
import { NoAccess } from "@/components/data-table";
import { RequestEditor } from "@/components/pricing/request-editor";
import { EVENT_LABEL, RequestBadge } from "@/components/pricing/ui";

export const metadata: Metadata = { title: "Đề nghị thay đổi giá" };
const sign = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

export default async function PriceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, requireContext()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><NoAccess what="Đề nghị thay đổi giá" /></div>;
  let d;
  try { d = await getChange(id); } catch { notFound(); }
  const rev = [`/bang-gia/de-nghi/${id}`, "/bang-gia/de-nghi", "/bang-gia", "/san-pham"];
  const editable = d.is_mine && ["draft", "changes_requested"].includes(d.status);
  const total = d.lines.reduce((s, l) => s + (l.diff ?? 0), 0);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/bang-gia/de-nghi" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Đề nghị thay đổi giá</Link>
      <PageHeader title={`${d.code} · ${d.book_name}`} eyebrow={`Người lập: ${d.requester ?? "—"}`} actions={<span data-testid="request-status"><RequestBadge s={d.display_status} /></span>} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ngày hiệu lực" value={formatDate(d.effective_date)} tone="sky" hint={d.display_status === "waiting" ? "Giá hiện hành còn dùng tới ngày này" : d.display_status === "applied" ? `Áp dụng ${d.applied_at ? formatDateTime(d.applied_at) : ""}` : undefined} />
        <StatCard label="Số dòng thay đổi" value={d.lines.length} tone="slate" /><StatCard label="Tổng chênh lệch đơn giá" value={sign(total)} tone={total >= 0 ? "amber" : "green"} hint="Cộng chênh lệch đơn giá các dòng đã có giá cũ" />
        <StatCard label="Phiên bản bảng giá" value={`${d.base_version} → ${d.book_version}`} tone={d.stale ? "orange" : "slate"} hint="Khi lập → hiện tại" />
      </section>
      {d.reason ? <p className="text-sm"><span className="text-muted-foreground">Lý do: </span>{d.reason}</p> : null}
      {d.decision_note ? <Alert tone={d.status === "changes_requested" ? "warning" : "info"} data-testid="decision-note">{d.decided_by} · {d.decided_at ? formatDateTime(d.decided_at) : ""}: “{d.decision_note}”</Alert> : null}
      {d.stale ? (
        <Alert tone="warning" data-testid="stale-warning">Dữ liệu gốc của bảng giá đã thay đổi trong lúc đề nghị này chờ xử lý (giá “trước” không còn khớp giá hiện hành). Cần đối chiếu lại phiên bản trước khi duyệt.
          {d.is_mine ? <span className="ml-2 inline-block"><RpcButton rpc="rebase_price_change" args={{ p_id: id }} label="Đối chiếu giá hiện hành" variant="outline" revalidate={rev} /></span> : null}</Alert>
      ) : null}
      <Card><CardHeader><CardTitle>Các dòng thay đổi</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-sm" data-testid="request-lines">
          <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-3.5 py-2.5">Sản phẩm</th><th className="px-3.5 py-2.5 text-right">Giá cũ</th><th className="px-3.5 py-2.5 text-right">Giá đề nghị</th><th className="px-3.5 py-2.5 text-right">Chênh lệch (₫)</th><th className="px-3.5 py-2.5 text-right">Chênh lệch (%)</th><th className="px-3.5 py-2.5 text-right">Phí / thuế (cũ → mới)</th><th className="px-3.5 py-2.5 text-right">Giá sau phí / thuế</th></tr></thead>
          <tbody className="divide-y">{d.lines.map((l) => (
            <tr key={l.product_id}><td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/san-pham/${l.product_id}?tab=bang-gia`}>{l.name}</Link><span className="ml-1.5 text-xs text-muted-foreground">{l.code}{l.unit ? ` · ${l.unit}` : ""}</span>{l.is_new ? <span className="ml-2 rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">Dòng mới</span> : null}</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">{l.old_unit_price === null ? "—" : money(l.old_unit_price)}</td><td className="px-3.5 py-2.5 text-right tabular-nums font-medium">{money(l.new_unit_price)}</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums" data-testid="line-diff">{l.diff === null ? "—" : sign(l.diff)}</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums" data-testid="line-diff-pct">{l.diff_pct === null ? <span className="text-xs text-muted-foreground">{l.pct_reason ?? "—"}</span> : `${l.diff_pct >= 0 ? "+" : "−"}${Math.abs(l.diff_pct)}%`}</td>
              <td className="px-3.5 py-2.5 text-right text-xs tabular-nums">{l.is_new ? "—" : `${l.old_fee_percent}% / ${l.old_tax_percent}%`} → {l.new_fee_percent}% / {l.new_tax_percent}%</td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">{l.old_after === null ? "" : `${money(l.old_after)} → `}{money(l.new_after)}</td></tr>))}</tbody></table></div>
        <p className="mt-2 text-xs text-muted-foreground">Tác động: báo giá mới dùng giá mới từ ngày hiệu lực. Báo giá nháp chỉ đổi sau khi người dùng xem chênh lệch và xác nhận; báo giá đã gửi giữ nguyên giá đã chào.</p>
      </CardContent></Card>
      <div className="flex flex-wrap gap-2">
        {d.can_decide ? (<>
          <RpcButton rpc="decide_price_change" args={{ p_id: id, p_decision: "approve" }} prompt={{ text: "Ý kiến duyệt (có thể để trống):", arg: "p_note" }} label={`Duyệt đề nghị ${d.code}`} variant="default" confirm={`Duyệt ${d.lines.length} dòng giá, hiệu lực ${formatDate(d.effective_date)}?`} revalidate={rev} />
          <RpcButton rpc="decide_price_change" args={{ p_id: id, p_decision: "request_changes" }} prompt={{ text: "Ý kiến yêu cầu chỉnh sửa (bắt buộc):", arg: "p_note", required: true }} label="Yêu cầu chỉnh sửa" variant="outline" revalidate={rev} />
        </>) : d.status === "pending" && can(ctx, "pricing.approve") && d.is_mine ? <Alert tone="info">Bạn là người lập đề nghị này nên không thể tự duyệt — cần một người duyệt khác.</Alert> : null}
        {d.is_mine && ["pending", "draft", "changes_requested"].includes(d.status) ? <RpcButton rpc="cancel_price_change" args={{ p_id: id }} label="Hủy đề nghị" variant="ghost" confirm="Hủy đề nghị này?" revalidate={rev} /> : null}
      </div>
      {editable ? <RequestEditor d={d} today={ctx.today} /> : null}
      <Card><CardHeader><CardTitle>Lịch sử xử lý</CardTitle></CardHeader><CardContent>
        <ol className="flex flex-col gap-2 text-sm" data-testid="request-events">{d.events.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{formatDateTime(e.at)}</span><strong>{e.by ?? "Hệ thống"}</strong><span>{EVENT_LABEL[e.action] ?? e.action}</span>{e.note ? <span className="text-muted-foreground">— “{e.note}”</span> : null}</li>))}</ol>
      </CardContent></Card>
    </div>
  );
}
