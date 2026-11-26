import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getMyTasks, getProjects } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Alert } from "@/components/ui/alert";
import { ProgressBar } from "@/components/ui/progress";
import { BlockedBadge, OverdueBadge, PriorityText, TaskStatusBadge } from "@/components/status";
import { QuickUpdate } from "@/components/quick-update";
import { formatDate, isOverdue } from "@/lib/dates";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Việc của tôi" };

const GROUPS: { key: string; title: string; match: (t: Task) => boolean }[] = [
  { key: "active", title: "Đang thực hiện", match: (t) => t.status === "todo" || t.status === "in_progress" },
  { key: "review", title: "Chờ duyệt", match: (t) => t.status === "in_review" },
  { key: "done", title: "Đã hoàn tất", match: (t) => t.status === "done" },
];

export default async function MyTasksPage() {
  const ctx = await requireContext();
  const [tasks, projects] = await Promise.all([getMyTasks(ctx.user_id), getProjects()]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Việc của tôi</h1>
        <p className="text-sm text-muted-foreground">Cập nhật nhanh tiến độ, hoặc gửi tất cả trong <Link className="text-primary underline" href="/bao-cao">báo cáo ngày</Link>.</p>
      </header>

      {tasks.length === 0 ? (
        <EmptyState title="Bạn chưa được giao việc nào" description="Khi quản lý dự án giao việc, công việc sẽ xuất hiện tại đây." />
      ) : (
        GROUPS.map((g) => {
          const list = tasks.filter(g.match);
          if (list.length === 0) return null;
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-3">
              <h2 id={`g-${g.key}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {g.title} ({list.length})
              </h2>
              <ul className="flex flex-col gap-3">
                {list.map((t) => (
                  <li key={t.id}>
                    <Card data-testid="my-task" data-task-id={t.id}>
                      <CardContent className="flex flex-col gap-3 pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{t.title}</p>
                            <Link href={`/du-an/${t.project_id}`} className="text-xs text-muted-foreground hover:underline">
                              {projectName.get(t.project_id) ?? "Dự án"}
                            </Link>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <TaskStatusBadge status={t.status} />
                            {t.is_blocked ? <BlockedBadge note={t.blocker_note} /> : null}
                            {isOverdue(t.due_date, ctx.today, t.status) ? <OverdueBadge /> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Hạn: {formatDate(t.due_date)}</span>
                          <PriorityText priority={t.priority} />
                          <span className="tabular-nums">Tiến độ: {t.progress}%</span>
                        </div>
                        <ProgressBar value={t.progress} label={`Tiến độ ${t.title}`} />
                        {t.return_reason && t.status === "in_progress" ? (
                          <Alert tone="warning">Bị trả lại: {t.return_reason}</Alert>
                        ) : null}
                        {t.is_blocked && t.blocker_note ? <p className="text-sm text-red-800">Vướng mắc: {t.blocker_note}</p> : null}
                        <QuickUpdate taskId={t.id} progress={t.progress} status={t.status} blocker={t.blocker_note} />
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
