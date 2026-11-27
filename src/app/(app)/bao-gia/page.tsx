import type { Metadata } from "next";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oppInfo } from "@/lib/crm-data";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { badge, opts, QUOTE_STATUS } from "@/lib/status-maps";
import type { Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, ListToolbar, NoAccess } from "@/components/data-table";

export const metadata: Metadata = { title: "Báo giá" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, "crm.view")) return <NoAccess what="Báo giá" />;
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("quotes").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const term = (sp.q ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 60);
  if (term) q = q.ilike("code", `%${term}%`);
  if (sp.f && /^[a-z_]+$/.test(sp.f)) q = q.eq("status", sp.f);
  const { data, error } = await q;
  if (error) throw new Error(`Không tải được báo giá: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const info = await oppInfo(rows.map((r) => r.opportunity_id as string));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Báo giá" eyebrow={`${rows.length} báo giá`} description="Báo giá được tạo từ trang Cơ hội (chụp lại sản phẩm tại thời điểm báo giá). Khách chấp nhận → lập hợp đồng." />
      <ListToolbar action="/bao-gia" q={sp.q} filter={{ col: "status", label: "Trạng thái", options: opts(QUOTE_STATUS) }} filterValue={sp.f} />
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/bao-gia/${r.id}`} testId="list-quotes"
        cols={[
          { label: "Mã", cell: (r) => <span className="font-medium">{`${r.code} · v${r.version}`}</span> },
          { label: "Cơ hội", cell: (r) => info.get(String(r.opportunity_id))?.name ?? "—" },
          { label: "Khách hàng", cell: (r) => info.get(String(r.opportunity_id))?.account_name ?? "—", className: "hidden md:table-cell" },
          { label: "Trạng thái", cell: (r) => badge(QUOTE_STATUS, r.status) },
          { label: "Tổng", cell: (r) => money(r.total as number), className: "text-right tabular-nums" },
          { label: "Hết hạn", cell: (r) => formatDate(r.expiry_date as string), className: "hidden lg:table-cell" },
        ]} />
    </div>
  );
}
