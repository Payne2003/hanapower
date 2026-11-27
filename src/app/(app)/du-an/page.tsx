import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { formatDate } from "@/lib/dates";
import { badge, opts, PROJECT_STAGE } from "@/lib/status-maps";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { DataTable, ListToolbar } from "@/components/data-table";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Dự án" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("projects").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const term = (sp.q ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 60);
  if (term) q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  if (sp.f && /^[a-z_]+$/.test(sp.f)) q = q.eq("stage", sp.f);
  const canCreate = can(ctx, "projects.create");
  const [{ data, error }, L] = await Promise.all([q, loadLookups(["accounts", "people"])]);
  if (error) throw new Error(`Không tải được dự án: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Dự án" eyebrow={`${rows.length} dự án`} description="Mỗi dự án có thành viên từ nhiều bộ phận; người ngoài dự án không xem được. Tiền chỉ quản lý dự án và kế toán thấy." />
      {canCreate ? (
        <Disclosure summary="Tạo dự án" icon={<Plus className="size-4" aria-hidden />}>
          <RpcForm
            rpc="create_project" submitLabel="Tạo dự án" redirectTo="/du-an/{}" revalidate={["/du-an"]} columns={3}
            fields={[
              { name: "p_name", label: "Tên dự án", required: true, wide: true },
              { name: "p_kind", label: "Loại", type: "select", required: true, defaultValue: "client", options: [["client", "Dự án khách hàng"], ["internal", "Nội bộ"]] },
              { name: "p_customer_id", label: "Khách hàng", type: "select", as: "uuid", options: L.accounts ?? [], hint: "Bắt buộc với dự án khách hàng" },
              { name: "p_manager_id", label: "Quản lý dự án", type: "select", as: "uuid", options: L.people ?? [], defaultValue: ctx.user_id, required: true },
              { name: "p_start", label: "Bắt đầu", type: "date" }, { name: "p_end", label: "Kết thúc", type: "date" },
              { name: "p_contract_value", label: "Giá trị hợp đồng (₫)", type: "number", defaultValue: 0 }, { name: "p_budget_cost", label: "Ngân sách chi phí (₫)", type: "number", defaultValue: 0 },
              { name: "p_description", label: "Mô tả", type: "textarea" },
              { name: "p_members", label: "Thành viên (từ nhiều bộ phận)", type: "checks", options: (L.people ?? []).filter(([v]) => v !== ctx.user_id) },
            ]}
          />
        </Disclosure>
      ) : null}
      <ListToolbar action="/du-an" q={sp.q} filter={{ col: "stage", label: "Trạng thái", options: opts(PROJECT_STAGE) }} filterValue={sp.f} />
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/du-an/${r.id}`} testId="list-projects"
        empty={<EmptyState title="Chưa có dự án nào bạn tham gia" description={canCreate ? "Tạo dự án mới hoặc tạo từ hợp đồng đã kích hoạt." : "Quản lý sẽ thêm bạn vào dự án."} />}
        cols={[
          { label: "Mã", cell: (r) => <span className="font-medium">{String(r.code)}</span> }, { label: "Dự án", cell: (r) => String(r.name) },
          { label: "Khách hàng", cell: (r) => nameOf(L, "accounts", r.customer_id), className: "hidden md:table-cell" },
          { label: "Quản lý", cell: (r) => nameOf(L, "people", r.manager_id), className: "hidden lg:table-cell" },
          { label: "Trạng thái", cell: (r) => badge(PROJECT_STAGE, r.stage) },
          { label: "Thời gian", cell: (r) => `${formatDate(r.start_date as string)} → ${formatDate(r.end_date as string)}`, className: "hidden lg:table-cell" },
        ]} />
    </div>
  );
}
