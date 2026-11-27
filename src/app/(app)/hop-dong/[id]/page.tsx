import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oppInfo } from "@/lib/crm-data";
import { loadLookups, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, CONTRACT_STATUS, ORDER_STATUS } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, NoAccess } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx, "crm.view")) return <NoAccess what="Hợp đồng" />;
  const supabase = await createSupabaseServerClient();
  const [{ data }, orders, projects, L] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("orders").select("id, code, status, total").eq("contract_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("projects").select("id, code, name").eq("contract_id", id).is("deleted_at", null),
    loadLookups(["people"]),
  ]);
  if (!data) notFound();
  const c = data as Row;
  const info = (await oppInfo([String(c.opportunity_id)])).get(String(c.opportunity_id));
  const canWrite = can(ctx, "crm.manage");
  const st = String(c.status);
  const rev = [`/hop-dong/${id}`, "/hop-dong", "/co-hoi", "/don-hang", "/du-an"];
  const btn = (to: string, label: string, variant: "outline" | "default" | "destructive" = "outline", confirm?: string) =>
    <RpcButton key={to} rpc="set_contract_status" args={{ p_id: id, p_status: to }} label={label} variant={variant} confirm={confirm} revalidate={rev} />;
  const actions: Record<string, React.ReactNode[]> = {
    draft: [btn("pending", "Gửi chờ hiệu lực", "default"), btn("cancelled", "Hủy hợp đồng", "destructive", "Hủy hợp đồng này?")],
    pending: [btn("active", "Kích hoạt hợp đồng", "default", "Kích hoạt hợp đồng? Cơ hội sẽ chuyển sang Thắng."), btn("draft", "Trả về nháp"), btn("cancelled", "Hủy hợp đồng", "destructive", "Hủy hợp đồng này?")],
    active: [btn("expired", "Đánh dấu hết hạn"), btn("terminated", "Chấm dứt", "destructive", "Chấm dứt hợp đồng đang hiệu lực?")],
  };
  const hasProject = (projects.data?.length ?? 0) > 0;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href="/hop-dong" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Hợp đồng</Link>
      <PageHeader title={`Hợp đồng ${c.code}`} eyebrow={info ? <span><Link className="text-primary hover:underline" href={`/co-hoi/${info.id}`}>{info.name}</Link> · {info.account_name}</span> : undefined} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trạng thái" value={badge(CONTRACT_STATUS, st)} tone="sky" />
        <StatCard label="Giá trị hiện tại" value={money(c.current_value as number)} tone="green" hint={`Ban đầu ${money(c.initial_value as number)}`} />
        <StatCard label="Hiệu lực" value={formatDate(c.effective_date as string)} tone="violet" />
        <StatCard label="Hết hạn" value={formatDate(c.expiry_date as string)} tone="amber" />
      </section>
      {canWrite && actions[st]?.length ? <Card><CardHeader><CardTitle>Bước tiếp theo</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{actions[st]}<p className="basis-full text-xs text-muted-foreground">Kích hoạt hợp đồng cần quyền quản lý.</p></CardContent></Card> : null}

      {st === "active" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {canWrite ? (
            <Card>
              <CardHeader><CardTitle>Tạo đơn hàng</CardTitle></CardHeader>
              <CardContent>
                <RpcForm rpc="create_order" fixed={{ p_contract: id }} submitLabel="Tạo đơn hàng" revalidate={rev} okMessage="Đã tạo đơn hàng." columns={1}
                  fields={[{ name: "p_total", label: "Giá trị đơn hàng (₫)", type: "number", hint: "Để trống = toàn bộ giá trị hợp đồng" }, { name: "p_note", label: "Ghi chú" }]} />
              </CardContent>
            </Card>
          ) : null}
          {!hasProject && can(ctx, "projects.create") ? (
            <Card>
              <CardHeader><CardTitle>Tạo dự án thực hiện</CardTitle></CardHeader>
              <CardContent>
                <RpcForm rpc="create_project_from_contract" fixed={{ p_contract: id }} submitLabel="Tạo dự án" redirectTo="/du-an/{}" revalidate={rev} columns={1}
                  fields={[{ name: "p_manager_id", label: "Quản lý dự án", type: "select", as: "uuid", options: L.people ?? [], defaultValue: ctx.user_id }]} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
      {hasProject ? <p className="text-sm">Dự án: {projects.data!.map((p) => <Link key={String(p.id)} className="mr-2 text-primary hover:underline" href={`/du-an/${p.id}`}>{String(p.code)} – {String(p.name)}</Link>)}</p> : null}

      <Card>
        <CardHeader><CardTitle>Đơn hàng ({orders.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <DataTable rows={(orders.data ?? []) as (Row & { id: string })[]} href={(r) => `/don-hang/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có đơn hàng.</p>}
            cols={[{ label: "Mã", cell: (r) => String(r.code) }, { label: "Trạng thái", cell: (r) => badge(ORDER_STATUS, r.status) }, { label: "Giá trị", cell: (r) => money(r.total as number), className: "text-right" }]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Chữ ký & ghi chú</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Khách ký: {String(c.customer_signed_by ?? "—")} ({formatDate(c.customer_signed_date as string)})</p>
          <p>Công ty ký: {c.company_signed_by_id ? ((L.people ?? []).find(([v]) => v === c.company_signed_by_id)?.[1] ?? "—") : "—"} ({formatDate(c.company_signed_date as string)})</p>
          {c.note ? <p className="sm:col-span-2">Ghi chú: {String(c.note)}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
