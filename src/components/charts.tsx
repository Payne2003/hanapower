import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Biểu đồ nhẹ, không phụ thuộc thư viện: thanh / cột bằng HTML-CSS (chữ luôn đọc được trên điện thoại), đường và vòng bằng SVG.
// Mỗi biểu đồ có role="img" + aria-label tóm tắt số liệu, và chú giải bằng chữ (không chỉ dựa vào màu).
export const PALETTE = ["#0f6b3f", "#2f8fb8", "#e0a22a", "#7a5ac8", "#d2554d", "#4aa39a", "#8a8f98", "#c46a9b"];

/** 1.234.567.890 → "1,23 tỷ"; 12.300.000 → "12,3 tr"; 540.000 → "540 nghìn". */
export function compactVnd(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "−" : "";
  const f = (x: number, d = 1) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d }).format(x);
  if (a >= 1e9) return `${sign}${f(a / 1e9, 2)} tỷ`;
  if (a >= 1e6) return `${sign}${f(a / 1e6, 1)} tr`;
  if (a >= 1e3) return `${sign}${f(a / 1e3, 0)} nghìn`;
  return `${sign}${f(a, 0)}`;
}

export function ChartCard({ title, subtitle, children, className, empty }: { title: string; subtitle?: string; children: ReactNode; className?: string; empty?: boolean }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]", className)}>
      <div>
        <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {empty ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu để vẽ biểu đồ.</p> : children}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
          <span className="text-foreground/80">{i.label}</span>
          {i.value ? <span className="font-medium tabular-nums">{i.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

type Series = { name: string; color: string; values: number[] };

/** Cột đứng (một hoặc nhiều chuỗi) theo nhóm nhãn. */
export function ColumnChart({ labels, series, format = (n) => String(n), height = 160, label }: { labels: string[]; series: Series[]; format?: (n: number) => string; height?: number; label: string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const summary = `${label}: ` + labels.map((l, i) => `${l} — ${series.map((s) => `${s.name} ${format(s.values[i] ?? 0)}`).join(", ")}`).join("; ");
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={summary} className="flex items-end gap-1.5 sm:gap-2.5" style={{ height }}>
        {labels.map((l, i) => (
          <div key={l + i} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
            {series.map((s) => {
              const v = s.values[i] ?? 0;
              return (
                <div key={s.name} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="mb-0.5 max-w-full truncate text-[10px] font-medium tabular-nums text-muted-foreground" title={v ? `${s.name}: ${format(v)}` : undefined}>{v ? format(v) : ""}</span>
                  <div className="w-full rounded-t-sm" style={{ height: `${(v / max) * (height - 22)}px`, minHeight: v ? 2 : 0, background: s.color }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2.5" aria-hidden>
        {labels.map((l, i) => <span key={l + i} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">{l}</span>)}
      </div>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} /> : null}
    </div>
  );
}

/** Đường (có vùng tô nhẹ) theo nhãn; nhiều chuỗi dùng chung trục. */
export function LineChart({ labels, series, height = 150, label, format = (n) => String(n) }: { labels: string[]; series: Series[]; height?: number; label: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = Math.max(2, labels.length);
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => 96 - (v / max) * 88;
  const summary = `${label}: ` + labels.map((l, i) => `${l} — ${series.map((s) => `${s.name} ${format(s.values[i] ?? 0)}`).join(", ")}`).join("; ");
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={summary} className="relative" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {[25, 50, 75].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />)}
          {series.map((s) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.name}>
                <polygon points={`0,100 ${pts} 100,100`} fill={s.color} fillOpacity="0.08" />
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
        {series.map((s) => s.values.map((v, i) => (
          <span key={`${s.name}${i}`} className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${x(i)}%`, top: `${y(v)}%`, background: s.color }} title={`${labels[i]} — ${s.name}: ${format(v)}`} aria-hidden />
        )))}
      </div>
      <div className="flex justify-between gap-1" aria-hidden>
        {labels.map((l, i) => <span key={l + i} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">{l}</span>)}
      </div>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} /> : null}
    </div>
  );
}

/** Thanh ngang có nhãn và giá trị ở đầu mỗi dòng; dùng cho phễu, xếp hạng. */
export function HBarChart({ data, format = (n) => String(n), label, sub }: { data: { label: string; value: number; color?: string; sub?: string }[]; format?: (n: number) => string; label: string; sub?: (d: { label: string; value: number; sub?: string }) => string | undefined }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = `${label}: ` + data.map((d) => `${d.label} ${format(d.value)}`).join("; ");
  return (
    <ul role="img" aria-label={summary} className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-foreground/85">{d.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{format(d.value)}{(sub?.(d) ?? d.sub) ? <span className="ml-1.5 font-normal text-muted-foreground">{sub?.(d) ?? d.sub}</span> : null}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(d.value ? 2 : 0, (d.value / max) * 100)}%`, background: d.color ?? PALETTE[i % PALETTE.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vòng tròn tỷ trọng + chú giải có số và phần trăm. */
export function DonutChart({ data, label, center }: { data: { label: string; value: number; color?: string }[]; label: string; center?: string }) {
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  const R = 15.9155; let acc = 0;
  const summary = `${label}: ` + items.map((d) => `${d.label} ${d.value}`).join("; ");
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div role="img" aria-label={summary} className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden>
          <circle cx="21" cy="21" r={R} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="6" />
          {items.map((d, i) => {
            const len = (d.value / total) * 100;
            const el = <circle key={d.label} cx="21" cy="21" r={R} fill="none" stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth="6" strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div><p className="text-xl font-semibold leading-none tabular-nums">{total}</p>{center ? <p className="mt-0.5 text-[10px] text-muted-foreground">{center}</p> : null}</div>
        </div>
      </div>
      <ul className="grid w-full min-w-0 flex-1 gap-1.5 text-xs">
        {items.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{d.label}</span>
            <span className="font-medium tabular-nums">{d.value}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
