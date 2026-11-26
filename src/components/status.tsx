import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS, TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import type { ProjectStatus, TaskPriority, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  return <Badge className={s.tone} data-status={status}>{s.label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <Badge className={s.tone}>{s.label}</Badge>;
}

export function PriorityText({ priority }: { priority: TaskPriority }) {
  const p = TASK_PRIORITY[priority];
  return <span className={cn("text-xs", p.tone)}>Ưu tiên: {p.label}</span>;
}

export function BlockedBadge({ note }: { note?: string | null }) {
  return (
    <Badge className="bg-red-50 text-red-800 ring-red-300" title={note ?? undefined}>
      Vướng mắc
    </Badge>
  );
}

export function OverdueBadge() {
  return <Badge className="bg-orange-50 text-orange-800 ring-orange-300">Quá hạn</Badge>;
}
