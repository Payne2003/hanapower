import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ISSUE_LABEL: Record<string, string> = {
  no_default: "Chưa chọn bảng giá mặc định", default_inactive: "Bảng mặc định đã ngừng dùng", no_line: "Bảng mặc định thiếu dòng giá",
};
export const ISSUE_ACTION: Record<string, string> = { no_default: "Chọn bảng mặc định", default_inactive: "Đổi bảng giá", no_line: "Bổ sung dòng giá" };

export const REQUEST_STATUS: Record<string, [string, string]> = {
  draft: ["Nháp", "bg-neutral-100 text-neutral-700 ring-neutral-300"], pending: ["Chờ duyệt", "bg-amber-50 text-amber-800 ring-amber-300"],
  changes_requested: ["Yêu cầu chỉnh sửa", "bg-orange-50 text-orange-800 ring-orange-300"], waiting: ["Đã duyệt · chờ hiệu lực", "bg-sky-50 text-sky-800 ring-sky-300"],
  applied: ["Đang áp dụng", "bg-emerald-50 text-emerald-800 ring-emerald-300"], cancelled: ["Đã hủy", "bg-neutral-100 text-neutral-600 ring-neutral-300"],
};
export const RequestBadge = ({ s }: { s: string }) => <Badge className={REQUEST_STATUS[s]?.[1]}>{REQUEST_STATUS[s]?.[0] ?? s}</Badge>;
export const EVENT_LABEL: Record<string, string> = { created: "Tạo đề nghị", edited: "Chỉnh sửa", submitted: "Gửi duyệt", approved: "Đã duyệt", changes_requested: "Yêu cầu chỉnh sửa", cancelled: "Hủy đề nghị", rebased: "Đối chiếu lại giá hiện hành", applied: "Có hiệu lực" };

export function ProductThumb({ id, name, size = 40 }: { id: string | null; name: string; size?: number }) {
  return id ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/san-pham/tep/${id}?xem=1`} alt={`Ảnh ${name}`} width={size} height={size} className="shrink-0 rounded-lg border bg-muted object-cover" style={{ width: size, height: size }} />
  ) : <span aria-hidden className="grid shrink-0 place-items-center rounded-lg border bg-muted text-xs font-semibold text-muted-foreground" style={{ width: size, height: size }}>{name.slice(0, 2).toUpperCase()}</span>;
}

export function Tabs({ items, current, hrefOf }: { items: [string, string][]; current: string; hrefOf: (k: string) => string }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Các phần">
      {items.map(([k, l]) => <Link key={k} href={hrefOf(k)} aria-current={current === k ? "page" : undefined} data-testid={`tab-${k}`} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", current === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
    </nav>
  );
}
