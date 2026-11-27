import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SELECT } from "@/components/hr/ui";
import { METHODS, VOUCHER, monthRange } from "@/lib/finance-ui";
import type { FinanceLookups, FinanceQuery } from "@/lib/finance";
import { financeParams } from "@/lib/finance";

export type FilterKey = "nguon" | "kh" | "da" | "pb" | "pt" | "ht" | "ct" | "loai" | "tt" | "lc" | "dv" | "chung";

const INPUT = "mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm";

function Sel({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={`Lọc theo ${label.toLowerCase()}`} className={SELECT}>
      <option value="">{label}: tất cả</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Các khoảng thời gian chọn nhanh (theo ngày của doanh nghiệp). */
export function presets(today: string): [string, string, string][] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return [
    ["Tháng này", ...monthRange(y, m)],
    ["Tháng trước", ...monthRange(prev[0]!, prev[1]!)],
    ["Quý này", monthRange(y, qStart)[0], monthRange(y, qStart + 2)[1]],
    ["Năm nay", `${y}-01-01`, `${y}-12-31`],
  ];
}

/**
 * Thanh lọc dùng chung cho các tab Thu chi (GET form, chạy không cần JavaScript).
 * Mỗi tab chỉ hiện các bộ lọc có nghĩa với nó; "Xóa lọc" về tháng hiện tại.
 */
export function FilterBar({ tab, q, today, keys, L, exportHref, extraHidden }: {
  tab: string; q: FinanceQuery; today: string; keys: FilterKey[]; L: FinanceLookups; exportHref?: string; extraHidden?: Record<string, string>;
}) {
  const has = (k: FilterKey) => keys.includes(k);
  return (
    <div className="flex flex-col gap-3" data-testid="finance-filters">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Khoảng nhanh:</span>
        {presets(today).map(([label, from, to]) => (
          <Link key={label} href={`/thu-chi${financeParams({ ...q, from, to, page: 1 }, { tab })}`} className="rounded-full border bg-card px-3 py-1 font-medium hover:bg-muted">{label}</Link>
        ))}
      </div>
      <form action="/thu-chi" method="get" className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        {Object.entries(extraHidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-xs">Từ ngày<input type="date" name="tu" defaultValue={q.from} className={INPUT} /></label>
        <label className="text-xs">Đến ngày<input type="date" name="den" defaultValue={q.to} className={INPUT} /></label>
        {has("nguon") ? <Sel name="nguon" label="Nguồn thu" value={q.source} options={L.sources} /> : null}
        {has("lc") ? <Sel name="lc" label="Loại chi phí" value={q.category} options={L.categories} /> : null}
        {has("kh") ? <Sel name="kh" label="Khách hàng" value={q.customer} options={L.customers} /> : null}
        {has("da") ? <Sel name="da" label="Dự án" value={q.project} options={L.projects} /> : null}
        {has("pb") ? <Sel name="pb" label="Phòng ban" value={q.dept} options={L.departments} /> : null}
        {has("pt") ? <Sel name="pt" label="Người phụ trách" value={q.owner} options={L.people} /> : null}
        {has("ht") ? <Sel name="ht" label="Hình thức" value={q.method} options={METHODS.map((m) => [m, m])} /> : null}
        {has("ct") ? <Sel name="ct" label="Chứng từ" value={q.voucher} options={VOUCHER} /> : null}
        {has("loai") ? <Sel name="loai" label="Loại thu" value={q.kind} options={[["milestone", "Thu theo mốc"], ["other", "Thu khác"]]} /> : null}
        {has("tt") ? <Sel name="tt" label="Trạng thái" value={q.status === "confirmed" ? "" : q.status} options={[["cancelled", "Đã hủy"], ["all", "Gồm cả đã hủy"]]} /> : null}
        {has("dv") ? <Sel name="dv" label="Duyệt" value={q.approval} options={[["draft", "Nháp"], ["submitted", "Chờ duyệt"], ["approved", "Đã duyệt"], ["rejected", "Từ chối"]]} /> : null}
        {has("chung") ? <label className="flex h-10 items-center gap-1.5 text-sm"><input type="checkbox" name="chung" value="1" defaultChecked={q.general} className="size-4 accent-[var(--primary)]" />Chỉ chi chung (không gắn dự án)</label> : null}
        <Button type="submit" variant="outline">Lọc</Button>
        <Link href={`/thu-chi?tab=${tab}`} className="px-2 pb-2.5 text-sm text-muted-foreground underline">Xóa lọc</Link>
        {exportHref ? <a href={exportHref} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium text-primary hover:bg-primary-soft/40" data-testid="export-csv"><Download className="size-4" aria-hidden />Xuất CSV (đúng bộ lọc)</a> : null}
      </form>
    </div>
  );
}
