import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Phân trang bằng liên kết (chạy được không cần JavaScript): số liệu tổng lấy từ CSDL, không phải số dòng của trang. */
export function Pager({ total, page, size, href }: { total: number; page: number; size: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const near = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground" data-testid="pager">
      <span data-testid="pager-range">{total === 0 ? "Không có kết quả" : `${from}–${to} / ${total}`}</span>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          {page > 1 ? <Link href={href(page - 1)} aria-label="Trang trước" className="grid size-8 place-items-center rounded-lg border hover:bg-muted"><ChevronLeft className="size-4" aria-hidden /></Link> : null}
          {near.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - near[i - 1]! > 1 ? <span aria-hidden>…</span> : null}
              <Link href={href(n)} aria-current={n === page ? "page" : undefined} className={cn("grid h-8 min-w-8 place-items-center rounded-lg border px-2", n === page ? "border-primary bg-primary-soft font-medium text-primary" : "hover:bg-muted")}>{n}</Link>
            </span>
          ))}
          {page < pages ? <Link href={href(page + 1)} aria-label="Trang sau" className="grid size-8 place-items-center rounded-lg border hover:bg-muted"><ChevronRight className="size-4" aria-hidden /></Link> : null}
        </div>
      ) : null}
    </nav>
  );
}

/** Tiêu đề cột bấm để sắp xếp. */
export function SortTh({ label, col, sort, dir, href, className }: { label: string; col: string; sort: string; dir: "asc" | "desc"; href: (col: string, dir: "asc" | "desc") => string; className?: string }) {
  const on = sort === col;
  return (
    <th scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3.5 py-2.5", className)}>
      <Link href={href(col, on && dir === "asc" ? "desc" : "asc")} className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}>
        {label}{on ? (dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
      </Link>
    </th>
  );
}

export const TABLE = "overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]";
export const THEAD = "border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
export const SELECT = "select-chevron h-10 min-w-[9.5rem] rounded-lg border border-input bg-card px-3 pr-8 text-sm";

/** Chip lọc nhanh: số liệu tổng hợp bấm vào mở danh sách đã lọc. */
export function Chip({ href, label, count, active }: { href: string; label: string; count: number; active?: boolean }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted", active ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
      {label}<span className="tabular-nums text-muted-foreground">{count}</span>
    </Link>
  );
}
