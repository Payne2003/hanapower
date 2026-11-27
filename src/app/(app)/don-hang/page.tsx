import type { Metadata } from "next";
import Link from "next/link";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, opts, ORDER_STATUS } from "@/lib/status-maps";
import type { Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, ListToolbar, NoAccess } from "@/components/data-table";

export const metadata: Metadata = { title: "Đơn hàng" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <NoAccess what="Đơn hàng" />;
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("orders").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const term = (sp.q ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 60);
  if (term) q = q.ilike("code", `%${term}%`);
  if (sp.f && /^[a-z_]+$/.test(sp.f)) q = q.eq("status", sp.f);
  const { data, error } = await q;
  if (error) throw new Error(`Không tải được đơn hàng: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => r.contract_id as string))];
  const { data: cs } = ids.length ? await supabase.from("contracts").select("id, code").in("id", ids) : { data: [] };
  const cc = new Map((cs ?? []).map((c) => [c.id as string, c.code as string]));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Đơn hàng" eyebrow={`${rows.length} đơn hàng`} description="Đơn hàng được tạo từ hợp đồng đang hiệu lực." />
      <ListToolbar action="/don-hang" q={sp.q} filter={{ col: "status", label: "Trạng thái", options: opts(ORDER_STATUS) }} filterValue={sp.f} />
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/don-hang/${r.id}`} testId="list-orders"
        cols={[
          { label: "Mã", cell: (r) => <span className="font-medium">{String(r.code)}</span> },
          { label: "Hợp đồng", cell: (r) => <Link className="text-primary hover:underline" href={`/hop-dong/${r.contract_id}`}>{cc.get(String(r.contract_id)) ?? "—"}</Link> },
          { label: "Trạng thái", cell: (r) => badge(ORDER_STATUS, r.status) }, { label: "Giá trị", cell: (r) => money(r.total as number), className: "text-right tabular-nums" },
          { label: "Kích hoạt", cell: (r) => formatDate(String(r.activated_at ?? "").slice(0, 10)), className: "hidden md:table-cell" },
        ]} />
    </div>
  );
}
