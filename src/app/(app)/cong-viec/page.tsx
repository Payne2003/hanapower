import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, type Row } from "@/lib/entities";
import { formatDateTime } from "@/lib/dates";
import { badge, opts, TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from "@/lib/status-maps";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Công việc" };

const VIEWS: [string, string][] = [["dang-lam", "Đang làm"], ["xong", "Hoàn thành"], ["tat-ca", "Tất cả"]];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const view = VIEWS.some(([k]) => k === sp.v) ? String(sp.v) : "dang-lam";
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("tasks").select("*").is("deleted_at", null).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(300);
  if (view === "dang-lam") q = q.in("status", ["not_started", "in_progress", "deferred"]);
  if (view === "xong") q = q.in("status", ["completed", "cancelled"]);
  const [{ data, error }, L, asg] = await Promise.all([q, loadLookups(["people"]), supabase.from("task_assignees").select("task_id, user_id")]);
  if (error) throw new Error(`Không tải được công việc: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const who = new Map<string, string[]>();
  const nm = new Map(L.people ?? []);
  for (const a of asg.data ?? []) who.set(a.task_id as string, [...(who.get(a.task_id as string) ?? []), nm.get(a.user_id as string) ?? "?"]);
  const rev = ["/cong-viec"];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Công việc" description="Việc cần làm, cuộc gọi, cuộc họp… giao cho đồng nghiệp. Bạn thấy việc do bạn tạo hoặc được giao." />
      <Disclosure summary="Thêm công việc" icon={<Plus className="size-4" aria-hidden />}>
        <RpcForm rpc="save_task" fixed={{ p_id: null }} submitLabel="Thêm công việc" revalidate={rev} resetOnSuccess columns={3}
          fields={[
            { name: "p_title", label: "Tiêu đề", required: true, wide: true },
            { name: "p_type", label: "Loại", type: "select", required: true, defaultValue: "to_do", options: opts(TASK_TYPE) },
            { name: "p_priority", label: "Ưu tiên", type: "select", required: true, defaultValue: "normal", options: opts(TASK_PRIORITY) },
            { name: "p_scheduled_at", label: "Thời hạn / giờ hẹn", type: "datetime" },
            { name: "p_remind_before", label: "Nhắc trước (phút)", type: "number", as: "number", min: 0 },
            { name: "p_content", label: "Nội dung", type: "textarea" },
            { name: "p_assignees", label: "Giao cho", type: "checks", options: (L.people ?? []), defaultValue: [ctx.user_id] },
          ]} />
      </Disclosure>
      <nav className="flex gap-1" aria-label="Lọc công việc">
        {VIEWS.map(([k, l]) => <Link key={k} href={`/cong-viec?v=${k}`} aria-current={view === k ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-sm font-medium", view === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
      </nav>
      <DataTable rows={rows as (Row & { id: string })[]} testId="list-tasks" empty={<EmptyState title="Không có công việc" description="Bấm “Thêm công việc” để tạo mới." />}
        cols={[
          { label: "Công việc", cell: (r) => <div><p className="font-medium">{String(r.title)}</p><p className="text-xs text-muted-foreground">{TASK_TYPE[String(r.task_type)]} · {(who.get(String(r.id)) ?? []).join(", ") || "Chưa giao"}</p></div> },
          { label: "Hạn", cell: (r) => (r.scheduled_at ? formatDateTime(r.scheduled_at as string, ctx.timezone) : "—"), className: "hidden sm:table-cell" },
          { label: "Ưu tiên", cell: (r) => badge(TASK_PRIORITY, r.priority), className: "hidden md:table-cell" },
          { label: "Trạng thái", cell: (r) => badge(TASK_STATUS, r.status) },
          { label: "", cell: (r) => (
            <div className="flex flex-wrap gap-1.5">
              {r.status === "not_started" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "in_progress" }} label="Bắt đầu" variant="ghost" revalidate={rev} /> : null}
              {r.status !== "completed" && r.status !== "cancelled" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "completed" }} label="Hoàn thành" variant="soft" revalidate={rev} /> : null}
              {r.status === "completed" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "in_progress" }} label="Mở lại" variant="ghost" revalidate={rev} /> : null}
              {r.created_by === ctx.user_id ? <RpcButton rpc="delete_task" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa công việc này?" revalidate={rev} /> : null}
            </div>
          ) },
        ]} />
    </div>
  );
}
