import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { entityBySlug, loadLookups, nameOf, STAGE_OPP, tag, FORECAST, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, QUOTE_STATUS, CONTRACT_STATUS } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, NoAccess } from "@/components/data-table";
import { EntityForm, DeleteEntityButton } from "@/components/entity-form";
import { OpportunityLineForm, DeleteLineButton } from "@/components/line-forms";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { NotesPanel } from "@/components/notes-panel";

import { PriceDiffPanel } from "@/components/pricing/price-diff";

export const metadata: Metadata = { title: "Cơ hội" };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const e = entityBySlug("co-hoi")!;
  const ctx = await requireContext();
  if (!can(ctx, e.view)) return <NoAccess what="Cơ hội" />;
  const supabase = await createSupabaseServerClient();
  const [{ data }, lines, quotes, contracts, L, prods] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("opportunity_products").select("*").eq("opportunity_id", id).order("created_at"),
    supabase.from("quotes").select("id, code, version, status, total, expiry_date").eq("opportunity_id", id).is("deleted_at", null).order("version", { ascending: false }),
    supabase.from("contracts").select("id, code, status, current_value").eq("opportunity_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    loadLookups(e.lookups),
    supabase.from("products").select("id, name").eq("is_active", true).is("deleted_at", null).order("name"),
  ]);
  if (!data) notFound();
  const o = data as Row;
  const canWrite = can(ctx, e.write);
  const closed = o.stage === "won" || o.stage === "lost";
  const lineRows = (lines.data ?? []) as Row[];
  const fields = e.fields(L).map((f) => ({ ...f, defaultValue: (o[f.name] as string | null) ?? null }));
  const revalidate = [`/co-hoi/${id}`, "/co-hoi", "/bao-gia", "/hop-dong"];
  const nextStages: [string, string][] = [["needs_analysis", "Phân tích nhu cầu"], ["presentation", "Trình bày giải pháp"], ["negotiation", "Thương lượng"]];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/co-hoi" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Cơ hội</Link>
      <PageHeader
        title={String(o.name)} eyebrow={<span>Khách hàng: <Link className="text-primary hover:underline" href={`/tai-khoan/${o.account_id}`}>{nameOf(L, "accounts", o.account_id)}</Link></span>}
        actions={canWrite && !closed ? <DeleteEntityButton entity={e.key} id={id} /> : null}
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Tóm tắt">
        <StatCard label="Giai đoạn" value={tag(STAGE_OPP, o.stage)} tone="sky" />
        <StatCard label="Giá trị dự kiến" value={money(o.expected_revenue as number)} tone="green" />
        <StatCard label="Xác suất thắng" value={`${Number(o.win_probability)}%`} tone="violet" hint={FORECAST[String(o.forecast)]} />
        <StatCard label="Dự kiến chốt" value={formatDate(o.expected_close_date as string)} tone="slate" />
      </section>

      {canWrite && !closed ? (
        <Card>
          <CardHeader><CardTitle>Đổi giai đoạn</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {nextStages.filter(([s]) => s !== o.stage).map(([s, l]) => <RpcButton key={s} rpc="set_opportunity_stage" args={{ p_id: id, p_stage: s }} label={l} revalidate={revalidate} />)}
            <RpcButton rpc="set_opportunity_stage" args={{ p_id: id, p_stage: "lost" }} label="Thua" variant="destructive" prompt={{ text: "Lý do thua cơ hội?", arg: "p_lost_reason", required: true }} revalidate={revalidate} />
            <p className="basis-full text-xs text-muted-foreground">Giai đoạn “Thắng” tự động khi hợp đồng của cơ hội này được kích hoạt.</p>
          </CardContent>
        </Card>
      ) : null}
      {o.stage === "lost" && o.lost_reason ? <p className="rounded-lg border bg-muted/40 p-3 text-sm">Lý do thua: {String(o.lost_reason)}</p> : null}

      <Card>
        <CardHeader><CardTitle>Sản phẩm / dịch vụ ({lineRows.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable rows={lineRows as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có sản phẩm / dịch vụ. Thêm bên dưới rồi tạo báo giá.</p>}
            cols={[
              { label: "Nội dung", cell: (r) => String(r.description) }, { label: "ĐVT", cell: (r) => String(r.unit ?? "—"), className: "hidden sm:table-cell" },
              { label: "SL", cell: (r) => String(r.quantity), className: "text-right" }, { label: "Đơn giá", cell: (r) => money(r.unit_price as number), className: "text-right" },
              { label: "Phí / Thuế", cell: (r) => `${r.fee_percent}% / ${r.tax_percent}%`, className: "hidden md:table-cell text-right" },
              { label: "Thành tiền", cell: (r) => <strong>{money(r.total as number)}</strong>, className: "text-right" },
              ...(canWrite && !closed ? [{ label: "", cell: (r: Row) => <DeleteLineButton table="opportunity_products" id={String(r.id)} path={`/co-hoi/${id}`} /> }] : []),
            ]} />
          {!closed ? <PriceDiffPanel kind="opportunity" id={id} canWrite={canWrite} revalidate={revalidate} /> : null}
          {canWrite && !closed ? <OpportunityLineForm opportunityId={id} products={(prods.data ?? []).map((p) => [p.id as string, p.name as string])} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Báo giá ({quotes.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable rows={(quotes.data ?? []) as (Row & { id: string })[]} href={(r) => `/bao-gia/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có báo giá.</p>}
            cols={[{ label: "Mã", cell: (r) => `${r.code} · v${r.version}` }, { label: "Trạng thái", cell: (r) => badge(QUOTE_STATUS, r.status) }, { label: "Tổng", cell: (r) => money(r.total as number), className: "text-right" }, { label: "Hết hạn", cell: (r) => formatDate(r.expiry_date as string), className: "hidden sm:table-cell" }]} />
          {canWrite && !closed && lineRows.length > 0 ? (
            <RpcForm rpc="create_quote" fixed={{ p_opportunity: id }} submitLabel="Tạo báo giá từ các dòng trên" redirectTo="/bao-gia/{}" revalidate={revalidate} variant="soft"
              fields={[{ name: "p_expiry", label: "Hết hạn báo giá", type: "date" }, { name: "p_note", label: "Ghi chú", type: "text" }]} />
          ) : null}
        </CardContent>
      </Card>

      {(contracts.data?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader><CardTitle>Hợp đồng</CardTitle></CardHeader>
          <CardContent>
            <DataTable rows={(contracts.data ?? []) as (Row & { id: string })[]} href={(r) => `/hop-dong/${r.id}`}
              cols={[{ label: "Mã", cell: (r) => String(r.code) }, { label: "Trạng thái", cell: (r) => badge(CONTRACT_STATUS, r.status) }, { label: "Giá trị", cell: (r) => money(r.current_value as number), className: "text-right" }]} />
          </CardContent>
        </Card>
      ) : null}

      <NotesPanel type="opportunity" id={id} canWrite={canWrite} userId={ctx.user_id} people={L.people ?? []} isManager={ctx.roles.includes("manager") || ctx.roles.includes("system_admin")} />
      <Card>
        <CardHeader><CardTitle>Thông tin cơ hội</CardTitle></CardHeader>
        <CardContent><EntityForm entity={e.key} id={id} fields={fields} canWrite={canWrite && !closed} /></CardContent>
      </Card>
    </div>
  );
}
