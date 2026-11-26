import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HANDOVER, ITEM_KINDS, ITEM_KIND_LABEL, ITEM_STATUS, PIPELINE, STAGE } from "@/lib/labels";
import type { HandoverStatus, ItemKind, ItemStatus, VideoStage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Màu chấm theo giai đoạn (đi kèm nhãn chữ). */
export const STAGE_DOT: Record<VideoStage, string> = {
  idea: "bg-slate-400",
  preparing: "bg-sky-500",
  handover: "bg-violet-500",
  editing: "bg-indigo-500",
  review: "bg-amber-500",
  ready: "bg-teal-500",
  published: "bg-emerald-500",
  on_hold: "bg-orange-500",
  cancelled: "bg-slate-300",
};

export function StageBadge({ stage }: { stage: VideoStage }) {
  const s = STAGE[stage];
  return (
    <Badge className={s.tone} data-stage={stage}>
      <span className={cn("size-1.5 rounded-full", STAGE_DOT[stage])} aria-hidden />
      {s.label}
    </Badge>
  );
}

export function ItemBadge({ status }: { status: ItemStatus }) {
  const s = ITEM_STATUS[status];
  return <Badge className={s.tone}>{s.label}</Badge>;
}

/** 4 hạng mục Content gọn: 4 chấm + số hoàn thành (nhãn đầy đủ khi rê chuột / đọc màn hình). */
export function ItemDots({ items, className }: { items: Record<ItemKind, ItemStatus>; className?: string }) {
  const done = ITEM_KINDS.filter((k) => items[k] === "done").length;
  const title = ITEM_KINDS.map((k) => `${ITEM_KIND_LABEL[k]}: ${ITEM_STATUS[items[k]].label}`).join(" · ");
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={title} aria-label={`Hạng mục ${done}/4 — ${title}`}>
      <span className="flex gap-1" aria-hidden>
        {ITEM_KINDS.map((k) => (
          <span
            key={k}
            className={cn(
              "size-2.5 rounded-full ring-1 ring-inset",
              items[k] === "done" ? "bg-emerald-500 ring-emerald-600" : items[k] === "doing" ? "bg-amber-300 ring-amber-500" : "bg-transparent ring-slate-300",
            )}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{done}/4</span>
    </span>
  );
}

export function HandoverBadge({ status }: { status: HandoverStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const s = HANDOVER[status];
  return <Badge className={s.tone}>{s.label}</Badge>;
}

export function OverdueBadge() {
  return <Badge className="bg-orange-50 text-orange-800 ring-orange-300">Quá hạn</Badge>;
}

/** Thanh các bước. Màn hình hẹp: "Bước x/7" + thanh tiến trình; màn hình rộng: các vòng tròn nối nhau. */
export function StageStepper({ stage }: { stage: VideoStage }) {
  const idx = PIPELINE.indexOf(stage);
  const pct = idx < 0 ? 0 : Math.round((idx / (PIPELINE.length - 1)) * 100);
  return (
    <div aria-label="Các bước sản xuất">
      <div className="md:hidden">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{idx >= 0 ? `Bước ${idx + 1}/${PIPELINE.length}` : STAGE[stage].label}</span>
          <span>{idx >= 0 && idx < PIPELINE.length - 1 ? `Tiếp theo: ${STAGE[PIPELINE[idx + 1]!].label}` : ""}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      </div>
      <ol className="hidden grid-cols-7 md:grid">
        {PIPELINE.map((s, i) => {
          const done = idx >= 0 && i < idx;
          const current = s === stage;
          return (
            <li key={s} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={current ? "step" : undefined}>
              {i < PIPELINE.length - 1 ? (
                <span className={cn("absolute top-3.5 left-1/2 h-0.5 w-full", done ? "bg-primary/50" : "bg-border")} aria-hidden />
              ) : null}
              <span
                className={cn(
                  "relative grid size-7 place-items-center rounded-full text-xs font-semibold ring-4 ring-card",
                  current ? "bg-primary text-primary-foreground" : done ? "bg-primary-soft text-primary" : "border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("px-1 text-[11px] leading-tight", current ? "font-semibold text-primary" : done ? "text-foreground/80" : "text-muted-foreground")}>
                {STAGE[s].label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
