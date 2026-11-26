import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getOpenVideos, getPeople, getVideos } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { OverdueBadge, StageBadge } from "@/components/status";
import { PIPELINE, STAGE } from "@/lib/labels";
import { isOverdue, monthRange, monthlyKpi, myAction } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const month = ctx.today.slice(0, 7);
  const [open, monthVideos, people] = await Promise.all([getOpenVideos(), getVideos(monthRange(month)), getPeople()]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const todo = open
    .map((v) => ({ v, action: myAction(v, ctx.user_id, ctx.roles) }))
    .filter((x): x is { v: typeof x.v; action: string } => !!x.action);
  const kpi = monthlyKpi(monthVideos, ctx.today);
  const overdue = open.filter((v) => isOverdue(v, ctx.today));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Xin chào, {ctx.full_name}</h1>
        <p className="text-sm text-muted-foreground">Hôm nay {formatDate(ctx.today)} · {ctx.org_name}</p>
      </header>

      <section aria-labelledby="todo-h" className="flex flex-col gap-2">
        <h2 id="todo-h" className="text-lg font-semibold">Việc cần làm của tôi ({todo.length})</h2>
        {todo.length === 0 ? (
          <EmptyState title="Không có việc nào đang chờ bạn" description="Video được giao, cần xác nhận, cần dựng hoặc cần duyệt sẽ hiện ở đây." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="my-todo">
            {todo.map(({ v, action }) => (
              <li key={v.id}>
                <Link href={`/video/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:shadow-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{v.code}</span>{" "}
                    <span className="font-medium">{v.title}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{action}</span>
                    <StageBadge stage={v.stage} />
                    {isOverdue(v, ctx.today) ? <OverdueBadge /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pipe-h" className="flex flex-col gap-2">
        <h2 id="pipe-h" className="text-lg font-semibold">Dây chuyền sản xuất hiện tại</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {[...PIPELINE.filter((s) => s !== "published"), "on_hold" as const].map((s) => (
            <Link key={s} href={`/video?thang=tat-ca&giai_doan=${s}`}>
              <Card className="hover:shadow-md">
                <CardContent className="pt-3">
                  <p className="text-xs text-muted-foreground">{STAGE[s].label}</p>
                  <p className="text-2xl font-semibold tabular-nums" data-testid={`pipe-${s}`}>{open.filter((v) => v.stage === s).length}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="kpi-h" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="kpi-h" className="text-lg font-semibold">Tháng {month.slice(5)}/{month.slice(0, 4)}</h2>
          <Link href="/bao-cao" className="text-sm text-primary underline">Xem báo cáo tháng</Link>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Video trong tháng" value={kpi.total} />
          <Kpi label="Đã bàn giao Edit" value={kpi.handedOver} />
          <Kpi label="Đã đăng" value={kpi.published} />
          <Kpi label="Quá hạn đăng" value={overdue.length} warn />
        </div>
      </section>

      {overdue.length > 0 ? (
        <section aria-labelledby="od-h" className="flex flex-col gap-2">
          <h2 id="od-h" className="text-lg font-semibold">Video quá hạn đăng</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {overdue.map((v) => (
              <li key={v.id}><Link className="hover:underline" href={`/video/${v.id}`}><span className="font-mono text-xs">{v.code}</span> {v.title} — hạn {formatDate(v.due_date)} · {STAGE[v.stage].label} · {v.stage === "idea" || v.stage === "preparing" ? names.get(v.content_owner_id ?? "") : names.get(v.editor_id ?? "")}</Link></li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  const hot = warn && typeof value === "number" && value > 0;
  return (
    <Card className={hot ? "border-orange-200 bg-orange-50" : undefined}>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
