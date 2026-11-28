import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oppInfo } from "@/lib/crm-data";
import type { Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, QUOTE_STATUS } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, NoAccess } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";

import { PriceDiffPanel } from "@/components/pricing/price-diff";

export const metadata: Metadata = { title: "Báo giá" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx, "crm.view")) return <NoAccess what="Báo giá" />;
  const supabase = await createSupabaseServerClient();
  const [{ data }, items, contracts] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    supabase.from("contracts").select("id, code, status").eq("quote_id", id).is("deleted_at", null),
  ]);
  if (!data) notFound();
  const q = data as Row;
  const info = (await oppInfo([String(q.opportunity_id)])).get(String(q.opportunity_id));
  const canWrite = can(ctx, "crm.manage");
  const st = String(q.status);
  const rev = [`/bao-gia/${id}`, "/bao-gia", "/co-hoi", "/hop-dong"];
  const btn = (to: string, label: string, variant: "outline" | "default" | "destructive" = "outline") => <RpcButton key={to} rpc="set_quote_status" args={{ p_id: id, p_status: to }} label={label} variant={variant} revalidate={rev} />;
  const actions: Record<string, React.ReactNode[]> = {
    draft: [btn("pending_approval", "Gửi duyệt", "default")],
    pending_approval: [btn("approved", "Duyệt báo giá", "default"), btn("draft", "Trả về nháp")],
    approved: [btn("sent", "Đã gửi cho khách", "default"), btn("draft", "Trả về nháp")],
    sent: [btn("accepted", "Khách chấp nhận", "default"), btn("rejected", "Khách từ chối", "destructive"), btn("expired", "Hết hạn")],
    rejected: [btn("draft", "Mở lại bản nháp")], expired: [btn("draft", "Mở lại bản nháp")],
  };
  const hasContract = (contracts.data?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href="/bao-gia" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Báo giá</Link>
      <PageHeader title={`${q.code} · phiên bản ${q.version}`} actions={<><a href={`/bao-gia/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><FileText className="size-4" aria-hidden />Xem PDF</a><a href={`/bao-gia/${id}/pdf?tai=1`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"><Download className="size-4" aria-hidden />Tải PDF</a></>} eyebrow={info ? <span>Cơ hội: <Link href={`/co-hoi/${info.id}`} className="text-primary hover:underline">{info.name}</Link> · {info.account_name}</span> : undefined} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trạng thái" value={badge(QUOTE_STATUS, st)} tone="sky" />
        <StatCard label="Tạm tính" value={money(q.subtotal as number)} tone="slate" />
        <StatCard label="Thuế" value={money(q.tax_amount as number)} tone="amber" />
        <StatCard label="Tổng cộng" value={money(q.total as number)} tone="green" hint={q.expiry_date ? `Hết hạn ${formatDate(q.expiry_date as string)}` : undefined} />
      </section>
      {canWrite && actions[st]?.length ? <Card><CardHeader><CardTitle>Bước tiếp theo</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{actions[st]}</CardContent></Card> : null}
      {st === "draft" ? <PriceDiffPanel kind="quote" id={id} canWrite={canWrite} revalidate={rev} /> : null}
      {st === "accepted" && canWrite && !hasContract ? (
        <Card>
          <CardHeader><CardTitle>Lập hợp đồng</CardTitle></CardHeader>
          <CardContent>
            <RpcForm rpc="create_contract" fixed={{ p_quote: id }} submitLabel="Tạo hợp đồng" redirectTo="/hop-dong/{}" revalidate={rev}
              fields={[{ name: "p_effective", label: "Ngày hiệu lực", type: "date" }, { name: "p_expiry", label: "Ngày hết hạn", type: "date" }, { name: "p_note", label: "Ghi chú", type: "textarea" }]} />
          </CardContent>
        </Card>
      ) : null}
      {hasContract ? <p className="text-sm">Hợp đồng: {contracts.data!.map((c) => <Link key={String(c.id)} className="mr-2 text-primary hover:underline" href={`/hop-dong/${c.id}`}>{String(c.code)}</Link>)}</p> : null}
      <Card>
        <CardHeader><CardTitle>Nội dung báo giá</CardTitle></CardHeader>
        <CardContent>
          <DataTable rows={(items.data ?? []) as (Row & { id: string })[]}
            cols={[
              { label: "#", cell: (r) => String(r.position), className: "w-10" }, { label: "Nội dung", cell: (r) => String(r.description) },
              { label: "SL", cell: (r) => `${r.quantity} ${r.unit ?? ""}`.trim(), className: "text-right" }, { label: "Đơn giá", cell: (r) => money(r.unit_price as number), className: "text-right" },
              { label: "Thuế", cell: (r) => `${r.tax_percent}%`, className: "hidden sm:table-cell text-right" }, { label: "Thành tiền", cell: (r) => <strong>{money(r.amount as number)}</strong>, className: "text-right" },
            ]} />
          {q.recipient_name ? <p className="mt-3 text-sm text-muted-foreground">Người nhận: {String(q.recipient_name)}{q.billing_address ? ` · ${q.billing_address}` : ""}</p> : null}
          {q.note ? <p className="mt-1 text-sm text-muted-foreground">Ghi chú: {String(q.note)}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
