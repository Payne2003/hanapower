import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, ORDER_STATUS } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";

export const metadata: Metadata = { title: "Đơn hàng" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx, "crm.view")) return <NoAccess what="Đơn hàng" />;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const o = data as Row;
  const { data: c } = await supabase.from("contracts").select("id, code").eq("id", o.contract_id as string).maybeSingle();
  const canWrite = can(ctx, "crm.manage");
  const rev = [`/don-hang/${id}`, "/don-hang"];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href="/don-hang" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Đơn hàng</Link>
      <PageHeader title={`Đơn hàng ${o.code}`} eyebrow={c ? <span>Hợp đồng <Link href={`/hop-dong/${c.id}`} className="text-primary hover:underline">{String(c.code)}</Link></span> : undefined} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Trạng thái" value={badge(ORDER_STATUS, o.status)} tone="sky" />
        <StatCard label="Giá trị" value={money(o.total as number)} tone="green" />
        <StatCard label="Kích hoạt" value={formatDate(String(o.activated_at ?? "").slice(0, 10))} tone="slate" />
      </section>
      {canWrite && o.status !== "cancelled" ? (
        <Card>
          <CardHeader><CardTitle>Thao tác</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {o.status === "draft" ? <RpcButton rpc="set_order_status" args={{ p_id: id, p_status: "active" }} label="Kích hoạt đơn hàng" variant="default" revalidate={rev} /> : null}
            <RpcButton rpc="set_order_status" args={{ p_id: id, p_status: "cancelled" }} label="Hủy đơn hàng" variant="destructive" confirm="Hủy đơn hàng này?" revalidate={rev} />
          </CardContent>
        </Card>
      ) : null}
      {o.note ? <p className="rounded-lg border bg-card p-3 text-sm">Ghi chú: {String(o.note)}</p> : null}
    </div>
  );
}
