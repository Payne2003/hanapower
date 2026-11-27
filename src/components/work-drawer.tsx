import Link from "next/link";
import { X } from "lucide-react";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { Badge } from "@/components/ui/badge";
import { badge, TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from "@/lib/status-maps";
import { STAGE } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import { stepAnchor, type Card, type Viewer } from "@/lib/work-board";
import type { Person } from "@/lib/types";

/** Chi tiết một thẻ (ngăn kéo bên phải): bước hiện tại, ai xử lý tiếp, ghi chú mới nhất, liên kết, đặt lịch / phân công theo quyền. */
export function WorkDrawer({ card: k, closeHref, viewer, people, groups, projects }: { card: Card; closeHref: string; viewer: Viewer; people: Person[]; groups: { id: string; name: string }[]; projects: { id: string; code: string; name: string }[] }) {
  const rev = ["/cong-viec"];
  const isVideo = !!k.video;
  const step = k.video ? stepAnchor(k.video.stage) : null;
  const canSchedule = isVideo ? viewer.canManage : (k.createdBy === viewer.userId || viewer.canCrm || viewer.canManage);
  const canAssign = !isVideo && canSchedule;
  const open = k.status !== "completed" && k.status !== "cancelled";
  const opts = people.filter((p) => p.is_active).map((p) => [p.id, p.full_name] as [string, string]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="task-drawer">
      <Link href={closeHref} scroll={false} aria-label="Đóng chi tiết" className="absolute inset-0 bg-black/30" />
      <aside role="dialog" aria-label={`Chi tiết: ${k.title}`} className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-5 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {k.video ? <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{k.video.code}</span> : null}
              {badge(TASK_STATUS, k.status)}
              {k.flags.overdue ? <Badge className="bg-red-50 text-red-700 ring-red-200">Quá hạn</Badge> : null}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug">{k.title}</h2>
          </div>
          <Link href={closeHref} scroll={false} aria-label="Đóng" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="size-4" aria-hidden /></Link>
        </header>

        <dl className="grid grid-cols-[7.5rem_1fr] gap-y-2 text-sm">
          {k.video ? <><dt className="text-muted-foreground">Video</dt><dd><Link className="text-primary hover:underline" href={`/video/${k.video.id}`}>{k.video.title}</Link> · {STAGE[k.video.stage].label}</dd></> : <><dt className="text-muted-foreground">Loại</dt><dd>{TASK_TYPE[k.taskType] ?? k.taskType}</dd></>}
          {k.step ? <><dt className="text-muted-foreground">Tiến độ / bước</dt><dd className="tabular-nums">{k.step}</dd></> : null}
          {k.next ? <><dt className="text-muted-foreground">Xử lý tiếp</dt><dd data-testid="drawer-next">{k.next}</dd></> : null}
          <dt className="text-muted-foreground">Dự án</dt><dd>{k.project ? <Link className="text-primary hover:underline" href={`/du-an/${k.project.id}`} data-testid="drawer-project">{k.project.code} · {k.project.name}</Link> : "—"}</dd>
          <dt className="text-muted-foreground">Nhóm</dt><dd>{groups.find((g) => g.id === k.groupId)?.name ?? "Chưa phân nhóm"}</dd>
          <dt className="text-muted-foreground">Phụ trách</dt><dd>{k.assignees.map((a) => a.name).join(", ") || "Chưa giao"}</dd>
          <dt className="text-muted-foreground">Bắt đầu</dt><dd>{formatDate(k.start)}</dd>
          <dt className="text-muted-foreground">Hạn</dt><dd className={k.flags.overdue ? "font-medium text-red-700" : undefined}>{formatDate(k.due)}</dd>
          <dt className="text-muted-foreground">Ưu tiên</dt><dd>{badge(TASK_PRIORITY, k.priority)}</dd>
        </dl>

        {k.note ? <div className="rounded-lg bg-muted p-3 text-sm" data-testid="drawer-note"><p className="text-xs font-medium text-muted-foreground">{k.note.label}</p><p className="mt-0.5 whitespace-pre-wrap">{k.note.text}</p></div> : null}
        {k.content && !isVideo ? <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{k.content}</p> : null}

        {k.video ? (
          <div className="flex flex-wrap gap-2">
            {step ? <Link href={`/video/${k.video.id}#${step.anchor}`} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">{step.label}</Link> : null}
            <Link href={`/video/${k.video.id}`} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Trang video</Link>
            {k.video.draftUrl ? <a href={k.video.draftUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Mở bản dựng</a> : null}
            {k.video.resourceUrl ? <a href={k.video.resourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Mở tài nguyên</a> : null}
          </div>
        ) : null}
        {k.related ? <p className="text-sm text-muted-foreground">Liên quan: {k.related.type}</p> : null}

        {!isVideo ? (
          <div className="flex flex-wrap gap-1.5">
            {k.status === "not_started" ? <RpcButton rpc="set_task_status" args={{ p_id: k.id, p_status: "in_progress" }} label="Bắt đầu" variant="ghost" revalidate={rev} /> : null}
            {open ? <RpcButton rpc="set_task_status" args={{ p_id: k.id, p_status: "completed" }} label="Hoàn thành" variant="soft" revalidate={rev} /> : null}
            {!open ? <RpcButton rpc="set_task_status" args={{ p_id: k.id, p_status: "in_progress" }} label="Mở lại" variant="ghost" revalidate={rev} /> : null}
            {k.createdBy === viewer.userId || viewer.canCrm ? <RpcButton rpc="delete_task" args={{ p_id: k.id }} label="Xóa" variant="ghost" confirm="Xóa công việc này?" revalidate={rev} redirectTo="/cong-viec" /> : null}
          </div>
        ) : null}

        {canSchedule ? (
          <section aria-label="Đặt lịch" className="rounded-xl border p-3.5">
            <h3 className="mb-2 text-sm font-semibold">Đặt lịch</h3>
            <RpcForm rpc="set_task_schedule" fixed={{ p_id: k.id }} submitLabel="Lưu lịch" okMessage="Đã lưu lịch." revalidate={rev} columns={2} variant="soft"
              fields={[
                { name: "p_start", label: "Ngày bắt đầu", type: "date", defaultValue: k.start },
                { name: "p_due", label: "Hạn hoàn thành", type: "datetime", defaultValue: k.dueAt ? `${k.due}T${new Intl.DateTimeFormat("en-GB", { timeZone: viewer.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(k.dueAt))}` : null },
              ]} />
          </section>
        ) : null}
        <section aria-label="Nhóm và dự án" className="rounded-xl border p-3.5">
          <h3 className="mb-2 text-sm font-semibold">Nhóm công việc{!isVideo && canSchedule ? " & dự án" : ""}</h3>
          <div className="flex flex-col gap-3">
            <RpcForm rpc="set_task_group" fixed={{ p_id: k.id }} submitLabel="Lưu nhóm" okMessage="Đã xếp nhóm." revalidate={rev} columns={1} variant="soft"
              fields={[{ name: "p_group", label: "Nhóm", type: "select", as: "uuid", options: groups.map((g) => [g.id, g.name] as [string, string]), defaultValue: k.groupId }]} />
            {!isVideo && canSchedule ? (
              <RpcForm rpc="set_task_project" fixed={{ p_id: k.id }} submitLabel="Lưu dự án" okMessage="Đã liên kết dự án." revalidate={rev} columns={1} variant="soft"
                fields={[{ name: "p_project", label: "Dự án liên quan", type: "select", as: "uuid", options: projects.map((x) => [x.id, `${x.code} · ${x.name}`] as [string, string]), defaultValue: k.project?.id ?? null }]} />
            ) : null}
          </div>
        </section>
        {canAssign ? (
          <section aria-label="Phân công" className="rounded-xl border p-3.5">
            <h3 className="mb-2 text-sm font-semibold">Phân công</h3>
            <RpcForm rpc="set_task_assignees" fixed={{ p_id: k.id }} submitLabel="Lưu người phụ trách" okMessage="Đã lưu phân công." revalidate={rev} columns={1} variant="soft"
              fields={[{ name: "p_users", label: "Người phụ trách", type: "checks", options: opts, defaultValue: k.assignees.map((a) => a.id) }]} />
          </section>
        ) : null}
        {isVideo ? <p className="text-xs text-muted-foreground">Trạng thái, người phụ trách và mức ưu tiên của đầu việc video lấy từ bước sản xuất của video; đổi ở trang Video.</p> : null}
      </aside>
    </div>
  );
}
