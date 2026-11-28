// Nhãn, bản đồ trạng thái và tiện ích dùng chung cho màn hình Dự án và Thu chi (không phụ thuộc máy chủ).
import type { Tone } from "@/lib/status-maps";

const N = "bg-neutral-100 text-neutral-700 ring-neutral-300";
const B = "bg-sky-50 text-sky-800 ring-sky-300";
const A = "bg-amber-50 text-amber-800 ring-amber-300";
const G = "bg-emerald-50 text-emerald-800 ring-emerald-300";
const R = "bg-red-50 text-red-800 ring-red-300";
const O = "bg-orange-50 text-orange-800 ring-orange-300";

/** Mức rủi ro luôn đi kèm chữ — không chỉ dựa vào màu. */
export const RISK: Record<string, Tone> = { high: ["Rủi ro cao", R], medium: ["Rủi ro trung bình", A], low: ["Rủi ro thấp", G] };
export const RISK_MANUAL: [string, string][] = [["low", "Thấp"], ["medium", "Trung bình"], ["high", "Cao"]];
export const RISK_FLAG: Record<string, string> = {
  manual_high: "Quản lý đánh dấu rủi ro cao", manual_medium: "Quản lý đánh dấu rủi ro trung bình", overdue_30: "Mốc thu quá hạn trên 30 ngày",
  overdue: "Có mốc thu quá hạn", over_budget: "Chi vượt ngân sách chi", late: "Trễ hạn kết thúc dự án",
};

/** Nhóm tuổi nợ của mốc chưa thu. */
export const BUCKET: Record<string, Tone> = {
  not_due: ["Chưa đến hạn", N], today: ["Đến hạn hôm nay", B], d1_30: ["Quá hạn 1–30 ngày", A], d31_60: ["Quá hạn 31–60 ngày", O], d61_90: ["Quá hạn 61–90 ngày", R], d90p: ["Quá hạn trên 90 ngày", R], no_date: ["Chưa có hạn", N],
};
export const BUCKET_ORDER = ["not_due", "today", "d1_30", "d31_60", "d61_90", "d90p", "no_date"];

export const METHODS = ["Chuyển khoản", "Tiền mặt", "Thẻ", "Ví điện tử", "Khác"];
export const VOUCHER: [string, string][] = [["has", "Đã có chứng từ"], ["missing", "Thiếu chứng từ"]];
export const ISSUE: Record<string, { label: string; tone: string; fix: string }> = {
  paid_no_income: { label: "Mốc đã thu nhưng thiếu khoản thu", tone: R, fix: "Ghi nhận thu với ngày thực tế để tạo khoản thu liên kết" },
  income_no_paid: { label: "Khoản thu gắn mốc chưa đóng", tone: R, fix: "Kiểm tra mốc và khoản thu; hủy khoản thu nếu sai" },
  amount_mismatch: { label: "Số tiền thu khác số tiền mốc", tone: R, fix: "Hủy khoản thu sai (kèm lý do) rồi ghi nhận lại đúng số tiền mốc" },
  date_mismatch: { label: "Ngày thu của mốc lệch ngày khoản thu", tone: A, fix: "Đối chiếu sao kê; hủy và ghi nhận lại nếu ngày thu sai" },
  period_mismatch: { label: "Tổng kỳ đã chốt lệch chi tiết", tone: R, fix: "Mở lại kỳ (có lý do), sửa giao dịch, chốt lại" },
  project_no_milestone: { label: "Dự án có hợp đồng nhưng chưa có lịch thu", tone: A, fix: "Lập các mốc thanh toán trong dự án" },
  schedule_gap: { label: "Tổng mốc khác giá trị hợp đồng", tone: A, fix: "Điều chỉnh mốc hoặc giá trị hợp đồng cho khớp" },
  income_no_voucher: { label: "Khoản thu thiếu chứng từ", tone: N, fix: "Đính kèm chứng từ" },
  expense_no_voucher: { label: "Khoản chi đã duyệt thiếu chứng từ", tone: N, fix: "Đính kèm chứng từ" },
};

export const PROJECT_VIEWS: [key: string, label: string, hint: string][] = [
  ["", "Tất cả", "Mọi dự án bạn xem được"],
  ["mine", "Tôi quản lý", "Dự án có tên bạn trong danh sách quản lý"],
  ["member", "Tôi tham gia", "Dự án bạn là thành viên"],
  ["risk", "Rủi ro cao", "Quản lý đánh dấu cao, mốc thu quá hạn trên 30 ngày hoặc chi vượt ngân sách"],
  ["due7", "Đến hạn trong 7 ngày", "Tính theo HẠN KẾT THÚC DỰ ÁN trong 7 ngày tới"],
  ["pay7", "Mốc thu trong 7 ngày", "Tính theo HẠN THU của mốc thanh toán trong 7 ngày tới"],
  ["overdue_pay", "Có mốc thu quá hạn", "Tính theo HẠN THU của mốc đã qua mà chưa thu"],
];

export const PROJECT_COLS: [key: string, label: string, money?: boolean][] = [
  ["ma", "Mã"], ["ten", "Dự án"], ["khach", "Khách hàng"], ["quanly", "Quản lý"], ["tiendo", "Tiến độ"], ["giaidoan", "Giai đoạn"], ["ruiro", "Rủi ro"],
  ["han", "Ngày kết thúc"], ["moc", "Mốc thu kế tiếp", true], ["hopdong", "Giá trị hợp đồng", true], ["dathu", "Đã thu", true],
];
export const DEFAULT_COLS = ["ten", "khach", "quanly", "tiendo", "giaidoan", "ruiro", "han", "moc"];

/** Dựng chuỗi truy vấn, bỏ giá trị rỗng. */
export function qs(p: Record<string, string | number | undefined | null | false>): string {
  const e = Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Kỳ tài chính (tháng) của một ngày — theo ngày thực thu / ngày phát sinh. */
export const periodOf = (d: string) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) });
export const periodLabel = (year: number, month: number) => `Tháng ${String(month).padStart(2, "0")}/${year}`;
export const monthRange = (year: number, month: number): [string, string] => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const m = String(month).padStart(2, "0");
  return [`${year}-${m}-01`, `${year}-${m}-${String(last).padStart(2, "0")}`];
};
/** Đường dẫn quay lại danh sách đã lọc (chỉ nhận chuỗi truy vấn an toàn). */
export const safeBack = (v: string | undefined) => (v && /^\?[A-Za-z0-9_=&%.,:+-]*$/.test(v) && v.length < 600 ? v : "");
