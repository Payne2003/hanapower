import type { Metadata } from "next";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oppInfo } from "@/lib/crm-data";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, opts, CONTRACT_STATUS } from "@/lib/status-maps";
import type { Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, ListToolbar, NoAccess } from "@/components/data-table";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <NoAccess what="Hợp đồng" />;
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("contracts").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const term = (sp.q ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 60);
  if (term) q = q.ilike("code", `%${term}%`);
  if (sp.f && /^[a-z_]+$/.test(sp.f)) q = q.eq("status", sp.f);
  const { data, error } = await q;
  if (error) throw new Error(`Không tải được hợp đồng: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const info = await oppInfo(rows.map((r) => r.opportunity_id as string));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Hợp đồng" eyebrow={`${rows.length} hợp đồng`} description="Lập từ báo giá khách đã chấp nhận. Hợp đồng có hiệu lực → cơ hội thắng → tạo đơn hàng và dự án." />
      <ListToolbar action="/hop-dong" q={sp.q} filter={{ col: "status", label: "Trạng thái", options: opts(CONTRACT_STATUS) }} filterValue={sp.f} />
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/hop-dong/${r.id}`} testId="list-contracts"
        cols={[
          { label: "Mã", cell: (r) => <span className="font-medium">{String(r.code)}</span> },
          { label: "Khách hàng", cell: (r) => info.get(String(r.opportunity_id))?.account_name ?? "—" },
          { label: "Trạng thái", cell: (r) => badge(CONTRACT_STATUS, r.status) },
          { label: "Giá trị", cell: (r) => money(r.current_value as number), className: "text-right tabular-nums" },
          { label: "Hiệu lực", cell: (r) => `${formatDate(r.effective_date as string)} → ${formatDate(r.expiry_date as string)}`, className: "hidden md:table-cell" },
        ]} />
    </div>
  );
}
