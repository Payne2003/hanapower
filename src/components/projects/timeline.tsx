import Link from "next/link";
import { PROJECT_STAGE } from "@/lib/status-maps";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/form-spec";
import { cn } from "@/lib/utils";
import type { ProjectRow } from "@/lib/projects";

export type MilestoneDot = { project_id: string; name: string; amount: number; due_date: string | null; payment: string };
const day = (d: string) => Math.floor(Date.parse(d) / 86400000);
const BAR: Record<string, string> = { planning: "bg-sky-300", in_progress: "bg-indigo-400", acceptance: "bg-amber-400", completed: "bg-emerald-400", on_hold: "bg-orange-300", cancelled: "bg-neutral-300" };

/** Dòng thời gian: thanh = ngày bắt đầu → kết thúc; chấm = hạn thu của mốc. Dự án thiếu ngày được liệt kê riêng bên dưới. */
export function ProjectTimeline({ rows, milestones, today, href }: { rows: ProjectRow[]; milestones: MilestoneDot[]; today: string; href: (r: ProjectRow) => string }) {
  const dated = rows.filter((r) => r.start_date && r.end_date && r.end_date >= r.start_date);
  const undated = rows.filter((r) => !(r.start_date && r.end_date && r.end_date >= r.start_date));
  if (!dated.length) return <UndatedList rows={undated} href={href} only />;
  const dots = new Map<string, MilestoneDot[]>();
  for (const m of milestones) if (m.due_date) dots.set(m.project_id, [...(dots.get(m.project_id) ?? []), m]);
  const all = [...dated.flatMap((r) => [day(r.start_date!), day(r.end_date!)]), ...dated.flatMap((r) => (dots.get(r.id) ?? []).map((m) => day(m.due_date!))), day(today)];
  const min = Math.min(...all) - 3, max = Math.max(...all) + 3, span = max - min;
  const pct = (d: number) => `${((d - min) / span) * 100}%`;
  const months: { label: string; left: string }[] = [];
  for (let d = new Date(min * 86400000); d.getTime() <= max * 86400000; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const start = Math.max(min, Math.floor(d.getTime() / 86400000));
    months.push({ label: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`, left: pct(start) });
  }
  return (
    <div className="flex flex-col gap-4" data-testid="timeline">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[14rem_1fr] border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            <div className="px-3 py-2">Dự án</div>
            <div className="relative h-8">{months.map((m) => <span key={m.label} className="absolute top-2 border-l pl-1.5" style={{ left: m.left }}>{m.label}</span>)}</div>
          </div>
          {dated.map((r) => (
            <div key={r.id} className="grid grid-cols-[14rem_1fr] items-center border-b last:border-b-0">
              <Link href={href(r)} className="truncate px-3 py-3 text-sm hover:text-primary hover:underline" title={`${r.code} · ${r.name}`}><span className="font-medium">{r.code}</span> · {r.name}</Link>
              <div className="relative h-10">
                <span className="absolute inset-y-0 w-px bg-primary/60" style={{ left: pct(day(today)) }} aria-hidden title={`Hôm nay ${formatDate(today)}`} />
                <div className={cn("absolute top-2.5 h-5 overflow-hidden rounded-md", BAR[r.stage] ?? "bg-neutral-300")} style={{ left: pct(day(r.start_date!)), width: `${((day(r.end_date!) - day(r.start_date!) + 1) / span) * 100}%` }}
                  title={`${r.name}: ${formatDate(r.start_date)} → ${formatDate(r.end_date)} · ${PROJECT_STAGE[r.stage]?.[0] ?? r.stage} · ${r.progress}%`}>
                  <div className="h-full bg-black/20" style={{ width: `${r.progress}%` }} />
                </div>
                {(dots.get(r.id) ?? []).map((m, i) => {
                  const late = m.payment !== "paid" && m.due_date! < today;
                  return <span key={i} className={cn("absolute top-1 size-3 rotate-45 border border-white", m.payment === "paid" ? "bg-emerald-600" : late ? "bg-red-600" : "bg-amber-500")}
                    style={{ left: pct(day(m.due_date!)) }} title={`${m.name} · ${money(m.amount)} · hạn ${formatDate(m.due_date)} · ${m.payment === "paid" ? "đã thu" : late ? "quá hạn" : "chưa thu"}`} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Thanh: thời gian dự án (phần tối = tiến độ). Chấm thoi: hạn thu của mốc — xanh lá đã thu, vàng chưa đến hạn, đỏ quá hạn (chỉ hiện với người được xem tiền). Đường dọc: hôm nay.</p>
      {undated.length ? <UndatedList rows={undated} href={href} /> : null}
    </div>
  );
}

function UndatedList({ rows, href, only }: { rows: ProjectRow[]; href: (r: ProjectRow) => string; only?: boolean }) {
  if (!rows.length) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Không có dự án nào để hiển thị.</p>;
  return (
    <section aria-label="Dự án chưa có đủ ngày" className="rounded-xl border border-dashed bg-muted/30 p-4" data-testid="timeline-undated">
      <h3 className="text-sm font-semibold">Chưa có đủ ngày bắt đầu / kết thúc ({rows.length})</h3>
      <p className="mb-2 text-xs text-muted-foreground">{only ? "Chưa dự án nào có đủ hai ngày để vẽ dòng thời gian. " : ""}Bổ sung ngày trong hồ sơ dự án để hiển thị trên dòng thời gian.</p>
      <ul className="flex flex-wrap gap-2">{rows.map((r) => <li key={r.id}><Link href={href(r)} className="inline-block rounded-lg border bg-card px-2.5 py-1 text-sm hover:bg-muted">{r.code} · {r.name}</Link></li>)}</ul>
    </section>
  );
}
