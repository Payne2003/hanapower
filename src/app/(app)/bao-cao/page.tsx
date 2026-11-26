import type { Metadata } from "next";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyTasks, getProfilesMap, getProjects } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/alert";
import { DailyReportForm, type ReportTask } from "@/components/daily-report-form";
import { TaskStatusBadge } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Báo cáo" };

type ReportRow = {
  id: string; user_id: string; report_date: string; status: "draft" | "submitted"; note: string | null; submitted_at: string | null;
  daily_report_items: { task_id: string; project_id: string; result: string; progress: number; blocker: string | null;
    progress_before: number | null; status_after: TaskStatus | null; position: number }[];
};

export default async function ReportsPage() {
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const [tasks, projects, people, reportsRes, taskTitles] = await Promise.all([
    getMyTasks(ctx.user_id),
    getProjects(),
    getProfilesMap(),
    supabase
      .from("daily_reports")
      .select("id, user_id, report_date, status, note, submitted_at, daily_report_items(task_id, project_id, result, progress, blocker, progress_before, status_after, position)")
      .order("report_date", { ascending: false })
      .order("submitted_at", { ascending: false })
      .limit(60),
    supabase.from("tasks").select("id, title"),
  ]);
  if (reportsRes.error) throw new Error(reportsRes.error.message);
  const reports = (reportsRes.data ?? []) as ReportRow[];
  const title = new Map((taskTitles.data ?? []).map((t) => [t.id as string, t.title as string]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const today = reports.find((r) => r.user_id === ctx.user_id && r.report_date === ctx.today) ?? null;
  const reportTasks: ReportTask[] = tasks
    .filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "in_review")
    .map((t) => ({ id: t.id, title: t.title, project: projectName.get(t.project_id) ?? "", progress: t.progress, status: t.status, blocker: t.blocker_note }));
  const mine = reports.filter((r) => r.user_id === ctx.user_id && r.status === "submitted");
  const team = reports.filter((r) => r.user_id !== ctx.user_id && r.status === "submitted");
  const isManager = ctx.roles.some((r) => r !== "employee");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Báo cáo</h1>
        <p className="text-sm text-muted-foreground">Báo cáo ngày {formatDate(ctx.today)} (múi giờ {ctx.timezone}).</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo ngày hôm nay</CardTitle>
          <CardDescription>Mỗi dòng gắn với một công việc. Khi gửi, tiến độ công việc được cập nhật cùng lúc.</CardDescription>
        </CardHeader>
        <CardContent>
          {today?.status === "submitted" ? (
            <div className="flex flex-col gap-3">
              <Alert tone="success" data-testid="report-submitted">Đã gửi lúc {formatDateTime(today.submitted_at, ctx.timezone)}.</Alert>
              <ReportItems report={today} title={title} projectName={projectName} />
            </div>
          ) : (
            <>
              {today?.status === "draft" ? <Alert tone="info" className="mb-3">Đang có bản nháp đã lưu trên máy chủ.</Alert> : null}
              <DailyReportForm
                userId={ctx.user_id}
                reportDate={ctx.today}
                tasks={reportTasks}
                initial={today ? { note: today.note ?? "", items: today.daily_report_items.sort((a, b) => a.position - b.position) } : null}
              />
            </>
          )}
        </CardContent>
      </Card>

      {isManager || team.length > 0 ? (
      <section aria-labelledby="team-h" className="flex flex-col gap-3">
        <h2 id="team-h" className="text-lg font-semibold">Báo cáo của nhân sự trong phạm vi quản lý</h2>
        <p className="-mt-2 text-sm text-muted-foreground">Quản lý dự án chỉ thấy các dòng thuộc dự án mình quản lý; quản lý phòng ban thấy báo cáo của nhân sự phòng mình.</p>
        {team.length === 0 ? (
          <EmptyState title="Chưa có báo cáo nào" description="Báo cáo đã gửi của nhân sự bạn quản lý sẽ hiển thị tại đây." />
        ) : (
          team.map((r) => (
            <Card key={r.id} data-testid="team-report">
              <CardHeader>
                <CardTitle className="text-sm">{people.get(r.user_id)?.full_name ?? "Nhân sự"} · {formatDate(r.report_date)}</CardTitle>
                <CardDescription>Gửi lúc {formatDateTime(r.submitted_at, ctx.timezone)}{r.note ? ` · ${r.note}` : ""}</CardDescription>
              </CardHeader>
              <CardContent><ReportItems report={r} title={title} projectName={projectName} /></CardContent>
            </Card>
          ))
        )}
      </section>
      ) : null}

      <section aria-labelledby="mine-h" className="flex flex-col gap-3">
        <h2 id="mine-h" className="text-lg font-semibold">Báo cáo đã gửi của tôi</h2>
        {mine.length === 0 ? (
          <EmptyState title="Bạn chưa gửi báo cáo nào" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {mine.map((r) => (
              <li key={r.id} className="rounded-md border bg-card px-3 py-2">
                <span className="font-medium">{formatDate(r.report_date)}</span> · {r.daily_report_items.length} dòng · gửi lúc {formatDateTime(r.submitted_at, ctx.timezone)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReportItems({ report, title, projectName }: { report: ReportRow; title: Map<string, string>; projectName: Map<string, string> }) {
  const items = [...report.daily_report_items].sort((a, b) => a.position - b.position);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Công việc</th>
            <th className="py-1.5 pr-3 font-medium">Kết quả</th>
            <th className="py-1.5 pr-3 font-medium">Tiến độ</th>
            <th className="py-1.5 font-medium">Vướng mắc</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.task_id} className="border-b align-top last:border-0">
              <td className="py-2 pr-3">
                <div className="font-medium">{title.get(i.task_id) ?? "Công việc"}</div>
                <div className="text-xs text-muted-foreground">{projectName.get(i.project_id) ?? ""}</div>
              </td>
              <td className="py-2 pr-3 whitespace-pre-wrap">{i.result || "—"}</td>
              <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                {i.progress_before !== null ? `${i.progress_before}% → ` : ""}{i.progress}%
                {i.status_after ? <div className="mt-1"><TaskStatusBadge status={i.status_after} /></div> : null}
              </td>
              <td className="py-2 text-red-800">{i.blocker ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
