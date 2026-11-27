import Link from "next/link";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/alert";

export type Col<T> = { label: string; cell: (r: T) => ReactNode; className?: string };

/** Bảng đơn giản, cuộn ngang trên màn hình hẹp. `href` biến cả dòng thành liên kết ở ô đầu tiên. */
export function DataTable<T extends { id?: unknown }>({ rows, cols, href, empty, testId }: {
  rows: T[]; cols: Col<T>[]; href?: (r: T) => string | null; empty?: ReactNode; testId?: string;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Chưa có dữ liệu" />}</>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]" data-testid={testId}>
      <table className="w-full min-w-[480px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>{cols.map((c) => <th key={c.label} scope="col" className={cn("px-3.5 py-2.5", c.className)}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => {
            const to = href?.(r);
            return (
              <tr key={String(r.id ?? i)} className="hover:bg-muted/30">
                {cols.map((c, ci) => (
                  <td key={c.label} className={cn("px-3.5 py-2.5 align-middle", c.className)}>
                    {ci === 0 && to ? <Link href={to} className="block hover:text-primary hover:underline">{c.cell(r)}</Link> : c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Ô tìm kiếm + lọc theo một cột (GET form, hoạt động không cần JavaScript). */
export function ListToolbar({ q, filter, filterValue, action, hidden }: {
  q?: string; filter?: { col: string; label: string; options: [string, string][] }; filterValue?: string; action: string; hidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Tìm kiếm…" className="pl-9" aria-label="Tìm kiếm" />
      </div>
      {filter ? (
        <select name="f" defaultValue={filterValue ?? ""} aria-label={filter.label} className="select-chevron h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">{filter.label}: tất cả</option>
          {filter.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : null}
      <Button type="submit" variant="outline">Lọc</Button>
    </form>
  );
}

export function NoAccess({ what }: { what: string }) {
  return <EmptyState title="Bạn chưa có quyền xem mục này" description={`${what} chỉ hiển thị với người được phân quyền. Liên hệ quản trị viên nếu cần truy cập.`} />;
}
