import { Badge } from "@/components/ui/badge";
import { RISK, RISK_FLAG } from "@/lib/finance-ui";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={`Tiến độ ${v}%`} className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{v}%</span>
    </div>
  );
}

/** Mức rủi ro bằng chữ (không chỉ màu) kèm lý do ngắn gọn khi có. */
export function RiskBadge({ level, flags, withReasons }: { level: string; flags?: string[]; withReasons?: boolean }) {
  const t = RISK[level] ?? RISK.low!;
  return (
    <span className="inline-flex flex-col gap-1">
      <Badge className={t[1]}>{t[0]}</Badge>
      {withReasons && flags?.length ? <ul className="text-[11px] leading-tight text-muted-foreground">{flags.map((f) => <li key={f}>• {RISK_FLAG[f] ?? f}</li>)}</ul> : null}
    </span>
  );
}

/** Ngày hạn kèm trạng thái bằng chữ: "Quá hạn 3 ngày" / "Còn 5 ngày" / "Hôm nay". */
export function DueText({ date, today, done }: { date: string | null; today: string; done?: boolean }) {
  if (!date) return <span className="text-muted-foreground">Chưa có hạn</span>;
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  const tone = done ? "text-muted-foreground" : days < 0 ? "text-red-700" : days <= 7 ? "text-amber-700" : "text-muted-foreground";
  const text = done ? "" : days < 0 ? `Quá hạn ${-days} ngày` : days === 0 ? "Hôm nay" : `Còn ${days} ngày`;
  return <span>{formatDate(date)}{text ? <span className={cn("block text-xs font-medium", tone)}>{text}</span> : null}</span>;
}
