import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { addDays, calendarItems, layoutWeek, monthGrid, weekStart, type Card } from "@/lib/work-board";
import { WorkCardBody } from "@/components/work-card";

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const barTone = (c: Card) =>
  c.status === "completed" ? "bg-emerald-100 text-emerald-900 border-emerald-300"
  : c.flags.overdue ? "bg-red-100 text-red-900 border-red-300"
  : c.status === "in_progress" ? "bg-indigo-100 text-indigo-900 border-indigo-300"
  : "bg-slate-100 text-slate-900 border-slate-300";

/**
 * Lịch sản xuất theo tuần / tháng. Việc có ngày bắt đầu + hạn hiện thành thanh trải dài; việc chỉ có hạn là cột mốc ◆ ở đúng ngày;
 * việc chưa có ngày nào nằm ở "Chưa xếp lịch" bên dưới.
 */
export function WorkCalendar({ cards, mode, anchor, today, base }: { cards: Card[]; mode: "tuan" | "thang"; anchor: string; today: string; base: string }) {
  const { items, unscheduled } = calendarItems(cards);
  const weeks = mode === "tuan" ? [Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))] : monthGrid(anchor).weeks;
  const month = anchor.slice(0, 7);
  const prev = mode === "tuan" ? addDays(anchor, -7) : addDays(`${month}-01`, -1);
  const next = mode === "tuan" ? addDays(anchor, 7) : addDays(`${month}-28`, 5);
  const q = (a: string, m = mode) => `${base}${base.includes("?") ? "&" : "?"}lich=${m}&ngay=${a}`;
  const first = weeks[0]![0]!; const last = weeks[weeks.length - 1]![6]!;
  const title = mode === "tuan" ? `${dm(first)} – ${dm(last)}/${last.slice(0, 4)}` : `Tháng ${month.slice(5)}/${month.slice(0, 4)}`;

  return (
    <div className="flex flex-col gap-4" data-testid="work-calendar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={q(prev)} aria-label="Kỳ trước" className="grid size-9 place-items-center rounded-lg border hover:bg-muted"><ChevronLeft className="size-4" aria-hidden /></Link>
          <Link href={q(today)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Hôm nay</Link>
          <Link href={q(next)} aria-label="Kỳ sau" className="grid size-9 place-items-center rounded-lg border hover:bg-muted"><ChevronRight className="size-4" aria-hidden /></Link>
          <h2 className="ml-2 text-base font-semibold" data-testid="calendar-title">{title}</h2>
        </div>
        <div className="flex gap-1" role="group" aria-label="Chế độ lịch">
          {(["tuan", "thang"] as const).map((m) => (
            <Link key={m} href={q(anchor, m)} aria-current={mode === m ? "true" : undefined} className={cn("rounded-lg px-3 py-2 text-sm font-medium", mode === m ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{m === "tuan" ? "Tuần" : "Tháng"}</Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            {DOW.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          {weeks.map((days) => {
            const laid = layoutWeek(days, items);
            const lanes = laid.reduce((m, x) => Math.max(m, x.lane + 1), 0);
            return (
              <div key={days[0]} className="relative border-b last:border-b-0" data-week={days[0]}>
                <div className="grid grid-cols-7">
                  {days.map((d) => (
                    <div key={d} data-day={d} style={{ minHeight: `${2.25 + Math.max(lanes, 1) * 1.75}rem` }} className={cn("border-r px-1.5 pt-1 last:border-r-0", mode === "thang" && d.slice(0, 7) !== month && "bg-muted/30 text-muted-foreground", d === today && "bg-primary-soft/40")}>
                      <span className={cn("inline-grid size-6 place-items-center rounded-full text-xs tabular-nums", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8, 10))}</span>
                    </div>
                  ))}
                </div>
                <ul className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 gap-y-1 px-0.5" style={{ gridTemplateRows: `repeat(${Math.max(lanes, 1)}, 1.5rem)` }}>
                  {laid.map(({ item, col, span, lane, clipL, clipR }) => (
                    <li key={item.card.id} style={{ gridColumn: `${col} / span ${span}`, gridRow: lane + 1 }} className="pointer-events-auto min-w-0 px-0.5">
                      <Link href={`${base}${base.includes("?") ? "&" : "?"}the=${item.card.id}`} data-cal-item={item.card.id} data-milestone={item.milestone ? "1" : "0"} title={`${item.card.title}${item.card.next ? ` · ${item.card.next}` : ""}`}
                        className={cn("flex h-6 items-center gap-1 truncate border px-1.5 text-[11px] font-medium hover:brightness-95", barTone(item.card), clipL ? "rounded-l-none border-l-0" : "rounded-l-md", clipR ? "rounded-r-none border-r-0" : "rounded-r-md")}>
                        {item.milestone ? <span aria-hidden>◆</span> : null}<span className="truncate">{item.card.video ? `${item.card.video.code} · ` : ""}{item.card.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-label="Chưa xếp lịch" data-testid="calendar-unscheduled" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Chưa xếp lịch <span className="font-normal text-muted-foreground">({unscheduled.length})</span></h3>
        {unscheduled.length === 0 ? <EmptyState title="Mọi việc đang mở đều đã có ngày" /> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.slice(0, 60).map((k) => <li key={k.id} className="rounded-lg border bg-card p-3 text-sm"><WorkCardBody card={k} href={`${base}${base.includes("?") ? "&" : "?"}the=${k.id}`} /></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
