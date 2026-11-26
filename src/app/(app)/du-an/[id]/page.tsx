import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext, can } from "@/lib/auth";
import { getProfilesMap, getProject } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { ProgressBar } from "@/components/ui/progress";
import { BlockedBadge, OverdueBadge, PriorityText, ProjectStatusBadge, TaskStatusBadge } from "@/components/status";
import { TaskCreateForm } from "@/components/task-create-form";
import { ReviewControls } from "@/components/review-controls";
import { AddMembersForm } from "@/components/add-members-form";
import { Disclosure } from "@/components/disclosure";
import { formatDate, isOverdue } from "@/lib/dates";
import { formatProgress } from "@/lib/progress";
import { TASK_STATUS, TASK_STATUS_ORDER } from "@/lib/labels";
import type { Profile, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Chi tiết dự án" };

export default async function ProjectDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const [data, people] = await Promise.all([getProject(id), getProfilesMap()]);
  if (!data) notFound();
  const { project, stats, tasks, members } = data;

  const canManage =
    project.manager_id === ctx.user_id ||
    members.some((m) => m.user_id === ctx.user_id && m.member_role === "manager") ||
    can(ctx, "projects.manage_all");
  const memberProfiles = members
    .map((m) => ({ ...m, profile: people.get(m.user_id) }))
    .filter((m): m is typeof m & { profile: Profile } => !!m.profile);
  const kanban = view === "kanban";
  const activeTasks = tasks.filter((t) => t.status !== "cancelled");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/du-an" className="hover:underline">Dự án</Link> / <span className="text-foreground">{project.name}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Quản lý: {people.get(project.manager_id)?.full_name ?? "—"} · Bắt đầu {formatDate(project.start_date)} · Hạn {formatDate(project.due_date)}
        </p>
        {project.description ? <p className="max-w-3xl text-sm">{project.description}</p> : null}
      </header>

      <section aria-label="Chỉ số dự án" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Tiến độ thực hiện</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="detail-progress">{formatProgress(stats?.progress)}</p>
            <ProgressBar value={stats?.progress ?? null} className="mt-2" />
          </CardContent>
        </Card>
        <Metric label="Việc đã hoàn tất (đã duyệt)" value={`${stats?.done_tasks ?? 0}/${stats?.total_tasks ?? 0}`} testId="detail-done" />
        <Metric label="Chờ duyệt" value={stats?.review_tasks ?? 0} testId="detail-review" />
        <Metric label="Quá hạn" value={stats?.overdue_tasks ?? 0} warn />
        <Metric label="Bị chặn / vướng mắc" value={stats?.blocked_tasks ?? 0} warn />
      </section>

      {canManage ? (
        <Disclosure summary="+ Giao việc mới" defaultOpen={activeTasks.length === 0}>
          <TaskCreateForm projectId={project.id} members={memberProfiles.map((m) => ({ id: m.user_id, full_name: m.profile.full_name }))} />
        </Disclosure>
      ) : null}

      <section aria-labelledby="tasks-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tasks-h" className="text-lg font-semibold">Công việc</h2>
          <div role="tablist" aria-label="Kiểu hiển thị" className="inline-flex rounded-md border bg-card p-0.5 text-sm">
            <Link role="tab" aria-selected={!kanban} href={`/du-an/${project.id}`} className={cn("rounded px-3 py-1", !kanban && "bg-primary-soft text-primary font-medium")}>Danh sách</Link>
            <Link role="tab" aria-selected={kanban} href={`/du-an/${project.id}?view=kanban`} className={cn("rounded px-3 py-1", kanban && "bg-primary-soft text-primary font-medium")}>Kanban</Link>
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState title="Dự án chưa có công việc" description="Chưa có dữ liệu tiến độ. Quản lý dự án giao việc để bắt đầu theo dõi." />
        ) : kanban ? (
          <div className="grid gap-3 md:grid-cols-4">
            {TASK_STATUS_ORDER.map((s) => {
              const col = tasks.filter((t) => t.status === s);
              return (
                <div key={s} className="flex flex-col gap-2 rounded-lg bg-muted p-2" aria-label={`Cột ${TASK_STATUS[s].label}`}>
                  <h3 className="px-1 text-sm font-semibold">{TASK_STATUS[s].label} <span className="text-muted-foreground">({col.length})</span></h3>
                  {col.map((t) => (
                    <TaskCard key={t.id} task={t} people={people} today={ctx.today} canManage={canManage} compact />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => (
              <li key={t.id}><TaskCard task={t} people={people} today={ctx.today} canManage={canManage} /></li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Thành viên ({memberProfiles.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-sm">
              {memberProfiles.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between">
                  <span>{m.profile.full_name} <span className="text-xs text-muted-foreground">· {m.profile.job_title ?? ""}</span></span>
                  {m.member_role === "manager" ? <span className="text-xs font-medium text-primary">Quản lý</span> : null}
                </li>
              ))}
            </ul>
            {canManage ? (
              <AddMembersForm
                projectId={project.id}
                candidates={[...people.values()].filter((p) => p.is_active && !members.some((m) => m.user_id === p.id)).map((p) => ({ id: p.id, full_name: p.full_name }))}
              />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tệp</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tệp đính kèm công việc sẽ có ở giai đoạn tiếp theo (bucket riêng, kiểm tra quyền theo công việc).</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, warn, testId }: { label: string; value: number | string; warn?: boolean; testId?: string }) {
  const hot = warn && typeof value === "number" && value > 0;
  return (
    <Card className={hot ? "border-orange-200 bg-orange-50" : undefined}>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", hot && "text-orange-800")} data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TaskCard({ task: t, people, today, canManage, compact }: {
  task: Task; people: Map<string, Profile>; today: string; canManage: boolean; compact?: boolean;
}) {
  return (
    <Card data-testid="task-card" data-task-id={t.id} className={t.status === "cancelled" ? "opacity-60" : undefined}>
      <CardContent className="flex flex-col gap-2 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">{t.title}</p>
          <div className="flex flex-wrap gap-1">
            {!compact ? <TaskStatusBadge status={t.status} /> : null}
            {t.is_blocked ? <BlockedBadge note={t.blocker_note} /> : null}
            {isOverdue(t.due_date, today, t.status) ? <OverdueBadge /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Phụ trách: {people.get(t.assignee_id)?.full_name ?? "—"}</span>
          <span>Hạn: {formatDate(t.due_date)}</span>
          <PriorityText priority={t.priority} />
          <span>Trọng số: {t.weight}</span>
        </div>
        <div className="flex items-center gap-2">
          <ProgressBar value={t.progress} className="flex-1" label={`Tiến độ ${t.title}`} />
          <span className="w-10 text-right text-xs tabular-nums">{t.progress}%</span>
        </div>
        {t.is_blocked && t.blocker_note ? <p className="text-xs text-red-800">Vướng mắc: {t.blocker_note}</p> : null}
        {t.return_reason && t.status === "in_progress" ? <p className="text-xs text-amber-800">Đã trả lại: {t.return_reason}</p> : null}
        {canManage && t.status === "in_review" ? <ReviewControls taskId={t.id} projectId={t.project_id} /> : null}
      </CardContent>
    </Card>
  );
}
