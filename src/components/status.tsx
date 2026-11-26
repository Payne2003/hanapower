import { Badge } from "@/components/ui/badge";
import { HANDOVER, ITEM_STATUS, PIPELINE, STAGE } from "@/lib/labels";
import type { HandoverStatus, ItemStatus, VideoStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StageBadge({ stage }: { stage: VideoStage }) {
  const s = STAGE[stage];
  return <Badge className={s.tone} data-stage={stage}>{s.label}</Badge>;
}

export function ItemBadge({ status }: { status: ItemStatus }) {
  const s = ITEM_STATUS[status];
  return <Badge className={s.tone}>{s.label}</Badge>;
}

export function HandoverBadge({ status }: { status: HandoverStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const s = HANDOVER[status];
  return <Badge className={s.tone}>{s.label}</Badge>;
}

export function OverdueBadge() {
  return <Badge className="bg-orange-50 text-orange-800 ring-orange-300">Quá hạn</Badge>;
}

/** Thanh các bước: Ý tưởng → … → Đã đăng. */
export function StageStepper({ stage }: { stage: VideoStage }) {
  const idx = PIPELINE.indexOf(stage);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Các bước sản xuất">
      {PIPELINE.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const current = s === stage;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "rounded-full px-2 py-0.5 ring-1 ring-inset",
                current ? "bg-primary text-primary-foreground ring-primary font-medium" : done ? "bg-primary-soft text-primary ring-primary/30" : "bg-card text-muted-foreground ring-border",
              )}
            >
              {done ? "✓ " : ""}{STAGE[s].label}
            </span>
            {i < PIPELINE.length - 1 ? <span className="text-muted-foreground" aria-hidden>→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
