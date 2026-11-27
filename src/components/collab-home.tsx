import Link from "next/link";
import { Briefcase } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MyContext } from "@/lib/types";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { ASSIGNMENT, PAYMENT, badge } from "@/lib/status-maps";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/alert";

/** Trang chủ của cộng tác viên: chỉ các đầu việc được giao cho họ. */
export async function CollabHome({ ctx }: { ctx: MyContext }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("freelance_assignments").select("*").order("due_date", { ascending: true, nullsFirst: false });
  const rows = data ?? [];
  const open = rows.filter((r) => ["assigned", "accepted", "delivered"].includes(String(r.status)));
  const done = rows.filter((r) => !["assigned", "accepted", "delivered"].includes(String(r.status)));
  const Item = ({ r }: { r: (typeof rows)[number] }) => (
    <li>
      <Link href={`/cong-tac-vien/viec/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3.5 shadow-[var(--shadow-card)] hover:border-primary/30">
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{String(r.title)}</span><span className="block truncate text-xs text-muted-foreground">{String(r.context ?? "")} · hạn {formatDate(r.due_date as string)}</span></span>
        <span className="text-sm font-medium tabular-nums">{money(r.fee as number)}</span>
        {badge(ASSIGNMENT, r.status)}{r.status === "approved" ? badge(PAYMENT, r.payment) : null}
      </Link>
    </li>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={`Xin chào, ${ctx.full_name}`} description={open.length ? `Bạn có ${open.length} đầu việc đang mở.` : "Hiện chưa có đầu việc nào đang mở."} />
      {open.length === 0 ? <EmptyState icon={<Briefcase />} title="Chưa có đầu việc" description="Khi được giao việc, bạn sẽ nhận thông báo và thấy đầu việc ở đây." /> : <ul className="flex flex-col gap-2" data-testid="collab-open">{open.map((r) => <Item key={String(r.id)} r={r} />)}</ul>}
      {done.length ? (<><h2 className="text-lg font-semibold">Đã xong / lịch sử</h2><ul className="flex flex-col gap-2">{done.map((r) => <Item key={String(r.id)} r={r} />)}</ul></>) : null}
    </div>
  );
}
