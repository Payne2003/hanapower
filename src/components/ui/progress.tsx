import { cn } from "@/lib/utils";

export function ProgressBar({ value, className, label }: { value: number | null; className?: string; label?: string }) {
  const v = value ?? 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-label={label ?? "Tiến độ"}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.55_0.13_150)] transition-all" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
    </div>
  );
}
