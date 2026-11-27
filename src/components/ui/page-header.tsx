import * as React from "react";
import { cn } from "@/lib/utils";

/** Tiêu đề trang thống nhất: tiêu đề + mô tả bên trái, nút thao tác bên phải (xuống dòng trên điện thoại). */
export function PageHeader({ title, description, actions, eyebrow, className }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Ô chỉ số: biểu tượng + nhãn + số. */
export function StatCard({ label, value, icon, tone = "green", hint, testId, href }: {
  label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: "green" | "amber" | "sky" | "violet" | "orange" | "slate";
  hint?: string; testId?: string; href?: string;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    orange: "bg-orange-50 text-orange-700",
    slate: "bg-slate-100 text-slate-700",
  };
  const body = (
    <div className="flex h-full min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]">
      {icon ? <div className={cn("grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5", tones[tone])}>{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-xl font-semibold tabular-nums tracking-tight sm:text-2xl" data-testid={testId}>{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? <a href={href} className="block h-full min-w-0 rounded-xl">{body}</a> : body;
}

/** Ảnh đại diện: ảnh nếu có (src), nếu chưa có hoặc ảnh lỗi thì hiện chữ cái đầu. */
export function Avatar({ name, src, className }: { name: string | null | undefined; src?: string | null; className?: string }) {
  const n = (name ?? "?").trim();
  const parts = n.split(/\s+/);
  const initials = (parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : n.slice(0, 2)).toUpperCase();
  const hues = [155, 200, 260, 30, 340, 90];
  const h = hues[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <span
      aria-hidden
      data-avatar={src ? "image" : "initials"}
      className={cn("relative inline-grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-semibold", className)}
      style={{ background: `oklch(0.93 0.05 ${h})`, color: `oklch(0.38 0.1 ${h})` }}
    >
      {initials}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : null}
    </span>
  );
}
