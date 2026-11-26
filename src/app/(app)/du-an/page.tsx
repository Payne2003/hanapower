import type { Metadata } from "next";
import Link from "next/link";
import { requireContext, can } from "@/lib/auth";
import { getProfilesMap, getProjects } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { ProgressBar } from "@/components/ui/progress";
import { ProjectStatusBadge } from "@/components/status";
import { ProjectCreateForm } from "@/components/project-create-form";
import { formatDate } from "@/lib/dates";
import { formatProgress } from "@/lib/progress";

export const metadata: Metadata = { title: "Dự án" };

export default async function ProjectsPage() {
  const ctx = await requireContext();
  const [projects, people] = await Promise.all([getProjects(), getProfilesMap()]);
  const canCreate = can(ctx, "projects.create");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dự án</h1>
          <p className="text-sm text-muted-foreground">Các dự án bạn tham gia hoặc quản lý.</p>
        </div>
      </header>

      {canCreate ? (
        <details className="rounded-lg border bg-card p-4 [&_summary]:cursor-pointer">
          <summary className="font-medium text-primary">+ Tạo dự án mới</summary>
          <div className="mt-4">
            <ProjectCreateForm
              today={ctx.today}
              people={[...people.values()].filter((p) => p.is_active && p.id !== ctx.user_id).map((p) => ({ id: p.id, full_name: p.full_name }))}
            />
          </div>
        </details>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState title="Chưa có dự án" description={canCreate ? "Tạo dự án đầu tiên để bắt đầu giao việc." : "Bạn chưa là thành viên dự án nào."} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/du-an/${p.id}`} className="block h-full rounded-lg focus-visible:outline-2">
                <Card className="h-full transition-shadow hover:shadow-md" data-testid="project-card">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{p.name}</CardTitle>
                      <ProjectStatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quản lý: {people.get(p.manager_id)?.full_name ?? "—"} · Hạn: {formatDate(p.due_date)}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">Tiến độ</span>
                      <span className="font-semibold tabular-nums" data-testid="project-progress">{formatProgress(p.stats?.progress)}</span>
                    </div>
                    <ProgressBar value={p.stats?.progress ?? null} label={`Tiến độ ${p.name}`} />
                    <dl className="mt-1 grid grid-cols-4 gap-1 text-center text-xs">
                      <Stat label="Hoàn tất" value={`${p.stats?.done_tasks ?? 0}/${p.stats?.total_tasks ?? 0}`} />
                      <Stat label="Chờ duyệt" value={p.stats?.review_tasks ?? 0} />
                      <Stat label="Quá hạn" value={p.stats?.overdue_tasks ?? 0} warn />
                      <Stat label="Vướng" value={p.stats?.blocked_tasks ?? 0} warn />
                    </dl>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  const hot = warn && typeof value === "number" && value > 0;
  return (
    <div className={`rounded-md px-1 py-1.5 ${hot ? "bg-orange-50 text-orange-800" : "bg-muted"}`}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
