import Link from "next/link";
import { CalendarClock, ExternalLink, FolderKanban } from "lucide-react";
import { Avatar } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { badge, TASK_PRIORITY, TASK_STATUS } from "@/lib/status-maps";
import { cn } from "@/lib/utils";
import type { Card } from "@/lib/work-board";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Nội dung một thẻ công việc: tên, mã video, bước, ai xử lý tiếp, hạn, người phụ trách. Dùng chung cho bảng, việc của tôi, lịch. */
export function WorkCardBody({ card: k, href, showStatus = false }: { card: Card; href: string; showStatus?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {k.video ? <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{k.video.code}</span> : null}
        {showStatus ? badge(TASK_STATUS, k.status) : null}
        {k.flags.overdue ? <Badge className="bg-red-50 text-red-700 ring-red-200">Quá hạn</Badge> : k.flags.dueToday ? <Badge className="bg-amber-50 text-amber-800 ring-amber-300">Hôm nay</Badge> : null}
        {k.priority === "high" || k.priority === "urgent" ? badge(TASK_PRIORITY, k.priority) : null}
        {k.flags.supplement ? <Badge className="bg-violet-50 text-violet-800 ring-violet-300">Cần bổ sung</Badge> : null}
      </div>
      <Link href={href} scroll={false} className="font-medium leading-snug hover:text-primary hover:underline" data-testid="card-title">{k.title}</Link>
      {k.step || k.next ? (
        <p className="text-xs text-muted-foreground">
          {k.step ? <span className="font-medium text-foreground tabular-nums">{k.step}</span> : null}
          {k.step && k.next ? " · " : null}
          {k.next ? <span data-testid="card-next">{k.next}</span> : null}
        </p>
      ) : null}
      {k.note ? <p className="line-clamp-2 rounded-md bg-muted/70 px-2 py-1 text-xs" title={k.note.text}><span className="font-medium">{k.note.label}:</span> {k.note.text}</p> : null}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {k.due ? <span className={cn("inline-flex items-center gap-1", k.flags.overdue && "font-medium text-red-700")}><CalendarClock className="size-3.5" aria-hidden />{dm(k.due)}</span> : null}
        {k.assignees.length ? (
          <span className="inline-flex min-w-0 items-center gap-1"><span className="flex -space-x-1.5">{k.assignees.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} className="size-5 text-[9px] ring-2 ring-card" />)}</span>
            <span className="truncate">{k.assignees.map((a) => a.name).join(", ")}</span></span>
        ) : <span>Chưa giao</span>}
        {k.project ? <Link href={`/du-an/${k.project.id}`} data-testid="card-project" title={k.project.name} className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline"><FolderKanban className="size-3 shrink-0" aria-hidden />{k.project.code}</Link> : null}
        {k.video ? <Link href={`/video/${k.video.id}`} className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3" aria-hidden />Mở video</Link> : null}
        {k.video?.draftUrl && (k.needsApprove || k.kind === "edit") ? <a href={k.video.draftUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3" aria-hidden />Mở bản dựng</a> : null}
      </div>
    </div>
  );
}
