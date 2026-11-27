import { FolderKanban, Target, FileSignature, ScrollText, UserPlus, Wallet, CheckSquare, Receipt, HandCoins, Hourglass } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth";
import { money } from "@/lib/form-spec";
import type { MyContext } from "@/lib/types";
import { StatCard } from "@/components/ui/page-header";

/** Tóm tắt kinh doanh – dự án – tài chính theo quyền của người xem (số liệu lấy qua RLS). */
export async function BusinessOverview({ ctx }: { ctx: MyContext }) {
  const supabase = await createSupabaseServerClient();
  const month = ctx.today.slice(0, 7);
  const crm = can(ctx, "crm.view"), fin = can(ctx, "finance.view");
  const cnt = (t: string) => supabase.from(t).select("id", { count: "exact", head: true });
  const [leads, opps, quotes, contracts, projects, tasks, inc, exp, ms, pay, pend] = await Promise.all([
    crm ? cnt("leads").is("deleted_at", null).in("status", ["new", "contacted", "working"]) : null,
    crm ? supabase.from("opportunities").select("expected_revenue, win_probability").is("deleted_at", null).not("stage", "in", "(won,lost)") : null,
    crm ? cnt("quotes").is("deleted_at", null).in("status", ["pending_approval", "sent"]) : null,
    crm ? cnt("contracts").is("deleted_at", null).eq("status", "active") : null,
    cnt("projects").is("deleted_at", null).in("stage", ["planning", "in_progress", "acceptance"]),
    cnt("tasks").is("deleted_at", null).in("status", ["not_started", "in_progress"]).lte("scheduled_at", `${ctx.today}T23:59:59+07:00`),
    fin ? supabase.from("incomes").select("amount").eq("status", "confirmed").gte("occurred_on", `${month}-01`).lte("occurred_on", ctx.today) : null,
    fin ? supabase.from("expenses").select("amount").is("deleted_at", null).eq("approval", "approved").gte("occurred_on", `${month}-01`).lte("occurred_on", ctx.today) : null,
    fin ? supabase.from("project_milestones").select("amount").eq("acceptance", "accepted").neq("payment", "paid") : null,
    fin ? supabase.from("expenses").select("amount").is("deleted_at", null).eq("approval", "approved").eq("payment", "unpaid") : null,
    can(ctx, "finance.approve") ? cnt("expenses").is("deleted_at", null).eq("approval", "submitted") : null,
  ]);
  const sum = (r: { data: { amount: unknown }[] | null } | null) => (r?.data ?? []).reduce((s, x) => s + Number(x.amount), 0);
  const pipeline = (opps?.data ?? []).reduce((s, o) => s + Number(o.expected_revenue) * Number(o.win_probability) / 100, 0);
  return (
    <section aria-label="Tổng quan kinh doanh" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Tổng quan hoạt động</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {crm ? <StatCard label="Lead đang theo" value={leads?.count ?? 0} icon={<UserPlus />} tone="sky" href="/lead" /> : null}
        {crm ? <StatCard label="Giá trị cơ hội (theo xác suất)" value={money(pipeline)} icon={<Target />} tone="violet" hint={`${opps?.data?.length ?? 0} cơ hội đang mở`} href="/co-hoi" /> : null}
        {crm ? <StatCard label="Báo giá chờ duyệt / chờ khách" value={quotes?.count ?? 0} icon={<FileSignature />} tone="amber" href="/bao-gia" /> : null}
        {crm ? <StatCard label="Hợp đồng đang hiệu lực" value={contracts?.count ?? 0} icon={<ScrollText />} tone="green" href="/hop-dong" /> : null}
        <StatCard label="Dự án đang chạy" value={projects.count ?? 0} icon={<FolderKanban />} tone="green" href="/du-an" />
        <StatCard label="Công việc đến hạn hôm nay" value={tasks.count ?? 0} icon={<CheckSquare />} tone={tasks.count ? "orange" : "slate"} href="/cong-viec" />
        {fin ? <StatCard label={`Thu tháng ${month.slice(5)}`} value={money(sum(inc))} icon={<Wallet />} tone="green" href="/thu-chi?tab=thu" /> : null}
        {fin ? <StatCard label={`Chi tháng ${month.slice(5)} (đã duyệt)`} value={money(sum(exp))} icon={<Receipt />} tone="amber" href="/thu-chi" /> : null}
        {fin ? <StatCard label="Phải thu" value={money(sum(ms))} icon={<HandCoins />} tone="sky" href="/thu-chi?tab=cong-no" /> : null}
        {fin ? <StatCard label="Phải trả" value={money(sum(pay))} icon={<Hourglass />} tone="orange" href="/thu-chi?tab=cong-no" /> : null}
        {pend ? <StatCard label="Chi phí chờ bạn duyệt" value={pend.count ?? 0} icon={<Receipt />} tone={pend.count ? "orange" : "slate"} href="/thu-chi" /> : null}
      </div>
    </section>
  );
}
