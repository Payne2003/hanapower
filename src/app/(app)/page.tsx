import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyTasks, getProfilesMap, getProjects, getTasksAwaitingMyApproval } from "@/lib/queries";
import { can } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { ProgressBar } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, isOverdue } from "@/lib/dates";
import { formatProgress } from "@/lib/progress";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const [tasks, projects, people, awaiting, todayReport] = await Promise.all([
    getMyTasks(ctx.user_id),
    getProjects(),
    getProfilesMap(),
    getTasksAwaitingMyApproval(ctx.user_id, can(ctx, "projects.manage_all")),
    supabase.from("daily_reports").select("status, submitted_at").eq("user_id", ctx.user_id).eq("report_date", ctx.today).maybeSingle(),
  ]);
  const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const overdue = open.filter((t) => isOverdue(t.due_date, ctx.today, t.status));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const reportStatus = todayReport.data?.status;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Xin chào, {ctx.full_name}</h1>
        <p className="text-sm text-muted-foreground">Hôm nay {formatDate(ctx.today)}</p>
      </header>

      <section aria-label="Tóm tắt" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Việc đang làm" value={open.length} href="/viec-cua-toi" />
        <Summary label="Việc quá hạn" value={overdue.length} href="/viec-cua-toi" warn />
        <Summary label="Chờ tôi duyệt" value={awaiting.length} href="#cho-duyet" />
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Báo cáo hôm nay</p>
            <p className="mt-1 font-semibold" data-testid="today-report-status">
              {reportStatus === "submitted" ? "Đã gửi" : reportStatus === "draft" ? "Bản nháp" : "Chưa gửi"}
            </p>
            {reportStatus !== "submitted" ? (
              <Link href="/bao-cao" className={buttonVariants({ size: "sm", className: "mt-2" })}>Viết báo cáo</Link>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {awaiting.length > 0 ? (
        <section id="cho-duyet" aria-labelledby="await-h" className="flex flex-col gap-2">
          <h2 id="await-h" className="text-lg font-semibold">Công việc chờ duyệt</h2>
          <ul className="flex flex-col gap-2">
            {awaiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <span><span className="font-medium">{t.title}</span> · {people.get(t.assignee_id)?.full_name} · {projectName.get(t.project_id)}</span>
                <Link href={`/du-an/${t.project_id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Xem & duyệt</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="proj-h" className="flex flex-col gap-3">
        <h2 id="proj-h" className="text-lg font-semibold">Tiến độ dự án</h2>
        {projects.length === 0 ? (
          <EmptyState title="Chưa có dự án" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <Link key={p.id} href={`/du-an/${p.id}`}>
                <Card className="hover:shadow-md">
                  <CardHeader><CardTitle className="text-sm">{p.name}</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Hoàn tất {p.stats?.done_tasks ?? 0}/{p.stats?.total_tasks ?? 0}</span>
                      <span className="font-semibold tabular-nums">{formatProgress(p.stats?.progress)}</span>
                    </div>
                    <ProgressBar value={p.stats?.progress ?? null} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href}>
      <Card className={warn && value > 0 ? "border-orange-200 bg-orange-50" : "hover:shadow-md"}>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
