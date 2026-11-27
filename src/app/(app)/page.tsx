import Link from "next/link";
import { ArrowRight, CheckCircle2, Clapperboard, AlarmClock, Send, Inbox, ChevronRight } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { getOpenVideos, getPeople, getVideos } from "@/lib/queries";
import { EmptyState } from "@/components/ui/alert";
import { PageHeader, StatCard, Avatar } from "@/components/ui/page-header";
import { OverdueBadge, STAGE_DOT, StageBadge } from "@/components/status";
import { PIPELINE, STAGE } from "@/lib/labels";
import { isOverdue, monthRange, monthlyKpi, myAction } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { BusinessOverview } from "@/components/business-overview";
import { CollabHome } from "@/components/collab-home";
import { AttentionCard, DashboardCharts } from "@/components/dashboard-charts";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

export default async function DashboardPage() {
  // Bắt đầu tải song song những gì không phụ thuộc người dùng
  const openP = getOpenVideos();
  const peopleP = getPeople();
  // Tránh lỗi 'unhandled rejection' nếu trang chuyển hướng trước khi dùng tới (vẫn ném lỗi khi await).
  openP.catch(() => undefined);
  peopleP.catch(() => undefined);
  const ctx = await requireContext();
  if (ctx.roles.includes("collaborator")) return <CollabHome ctx={ctx} />;
  const month = ctx.today.slice(0, 7);
  const [open, monthVideos, people] = await Promise.all([openP, getVideos(monthRange(month)), peopleP]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const todo = open
    .map((v) => ({ v, action: myAction(v, ctx.user_id, ctx.roles) }))
    .filter((x): x is { v: typeof x.v; action: string } => !!x.action);
  const kpi = monthlyKpi(monthVideos, ctx.today);
  const overdue = open.filter((v) => isOverdue(v, ctx.today));
  const flow = [...PIPELINE.filter((s) => s !== "published"), "on_hold" as const];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      <PageHeader
        eyebrow={`${formatDate(ctx.today)} · ${ctx.org_name}`}
        title={<>Xin chào, {ctx.full_name}</>}
        description={`${greeting()}! ${todo.length ? `Bạn có ${todo.length} việc cần xử lý.` : "Hiện không có việc nào đang chờ bạn."}`}
        actions={<Link href="/video" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"><Clapperboard className="size-4" aria-hidden />Danh sách video</Link>}
      />

      <section aria-label="Chỉ số tháng" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Video tháng ${month.slice(5)}`} value={kpi.total} icon={<Clapperboard />} tone="green" />
        <StatCard label="Đã bàn giao Edit" value={kpi.handedOver} icon={<Send />} tone="violet" />
        <StatCard label="Đã đăng" value={kpi.published} icon={<CheckCircle2 />} tone="sky" />
        <StatCard label="Quá hạn đăng" value={overdue.length} icon={<AlarmClock />} tone={overdue.length ? "orange" : "slate"} />
      </section>

      <BusinessOverview ctx={ctx} />
      <AttentionCard ctx={ctx} />
      <DashboardCharts ctx={ctx} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="todo-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="todo-h" className="text-lg font-semibold tracking-tight">Việc cần làm của tôi <span className="text-muted-foreground">({todo.length})</span></h2>
          </div>
          {todo.length === 0 ? (
            <EmptyState icon={<Inbox />} title="Không có việc nào đang chờ bạn" description="Video được giao, cần xác nhận, cần dựng hoặc cần duyệt sẽ hiện ở đây." />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="my-todo">
              {todo.map(({ v, action }) => (
                <li key={v.id}>
                  <Link href={`/video/${v.id}`} className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-[var(--shadow-card)] transition-all hover:border-primary/30 hover:shadow-[var(--shadow-pop)]">
                    <span className={cn("hidden h-10 w-1 shrink-0 rounded-full sm:block", STAGE_DOT[v.stage])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{v.code}</span>
                        <StageBadge stage={v.stage} />
                        {isOverdue(v, ctx.today) ? <OverdueBadge /> : null}
                      </span>
                      <span className="mt-1 block truncate font-medium group-hover:text-primary">{v.title}</span>
                      <span className="mt-1 block text-xs font-medium text-primary sm:hidden" aria-hidden>→ {action}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary sm:inline">{action}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                    <span className="sr-only">{action}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="pipe-h" className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 id="pipe-h" className="mb-3 text-[15px] font-semibold">Dây chuyền sản xuất</h2>
            <ul className="flex flex-col gap-1">
              {flow.map((s) => {
                const n = open.filter((v) => v.stage === s).length;
                return (
                  <li key={s}>
                    <Link href={`/video?thang=tat-ca&giai_doan=${s}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                      <span className={cn("size-2.5 rounded-full", STAGE_DOT[s])} aria-hidden />
                      <span className="flex-1">{STAGE[s].label}</span>
                      <span className={cn("min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums", n ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")} data-testid={`pipe-${s}`}>{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href="/bao-cao" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Báo cáo tháng <ArrowRight className="size-3.5" aria-hidden /></Link>
          </section>

          {overdue.length > 0 ? (
            <section aria-labelledby="od-h" className="rounded-xl border border-orange-200 bg-orange-50/60 p-5">
              <h2 id="od-h" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-orange-900"><AlarmClock className="size-4" aria-hidden />Quá hạn đăng</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {overdue.map((v) => {
                  const who = v.stage === "idea" || v.stage === "preparing" ? v.content_owner_id : v.editor_id;
                  return (
                    <li key={v.id}>
                      <Link className="flex items-center gap-2 hover:underline" href={`/video/${v.id}`}>
                        <Avatar name={who ? names.get(who) : null} className="size-6 text-[10px]" />
                        <span className="min-w-0 flex-1 truncate">{v.title}</span>
                        <span className="shrink-0 text-xs text-orange-800">{formatDate(v.due_date)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
