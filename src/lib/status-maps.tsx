import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export type Tone = [label: string, classes: string];
const N = "bg-neutral-100 text-neutral-700 ring-neutral-300";
const B = "bg-sky-50 text-sky-800 ring-sky-300";
const I = "bg-indigo-50 text-indigo-800 ring-indigo-300";
const A = "bg-amber-50 text-amber-800 ring-amber-300";
const G = "bg-emerald-50 text-emerald-800 ring-emerald-300";
const R = "bg-red-50 text-red-800 ring-red-300";
const O = "bg-orange-50 text-orange-800 ring-orange-300";

export const QUOTE_STATUS: Record<string, Tone> = {
  draft: ["Nháp", N], pending_approval: ["Chờ duyệt", A], approved: ["Đã duyệt", B], sent: ["Đã gửi khách", I], accepted: ["Khách chấp nhận", G], rejected: ["Khách từ chối", R], expired: ["Hết hạn", O],
};
export const CONTRACT_STATUS: Record<string, Tone> = {
  draft: ["Nháp", N], pending: ["Chờ hiệu lực", A], active: ["Đang hiệu lực", G], expired: ["Hết hạn", O], terminated: ["Đã chấm dứt", R], cancelled: ["Đã hủy", N],
};
export const ORDER_STATUS: Record<string, Tone> = { draft: ["Nháp", N], active: ["Đang thực hiện", G], cancelled: ["Đã hủy", R] };
export const PROJECT_STAGE: Record<string, Tone> = {
  planning: ["Lên kế hoạch", B], in_progress: ["Đang thực hiện", I], acceptance: ["Nghiệm thu", A], completed: ["Hoàn thành", G], on_hold: ["Tạm dừng", O], cancelled: ["Đã hủy", N],
};
export const APPROVAL: Record<string, Tone> = { draft: ["Nháp", N], submitted: ["Chờ duyệt", A], approved: ["Đã duyệt", G], rejected: ["Từ chối", R] };
export const PAYMENT: Record<string, Tone> = { unpaid: ["Chưa thanh toán", O], paid: ["Đã thanh toán", G], invoiced: ["Đã xuất hóa đơn", I] };
export const ADVANCE: Record<string, Tone> = { requested: ["Chờ duyệt", A], approved: ["Đã duyệt", B], rejected: ["Từ chối", R], disbursed: ["Đã giải ngân", I], settled: ["Đã quyết toán", G] };
export const ASSIGNMENT: Record<string, Tone> = { assigned: ["Chờ nhận việc", A], accepted: ["Đang làm", I], delivered: ["Đã bàn giao", B], approved: ["Đã nghiệm thu", G], declined: ["Từ chối", R], cancelled: ["Đã hủy", N] };
export const PAYROLL: Record<string, Tone> = { draft: ["Nháp", N], checked: ["Nhân sự đã kiểm tra", A], approved: ["Kế toán đã duyệt", B], paid: ["Đã chi trả", G] };
export const BONUS: Record<string, Tone> = { requested: ["Chờ duyệt", A], approved: ["Đã duyệt", G], rejected: ["Từ chối", R] };
export const ATTENDANCE: Record<string, Tone> = { present: ["Đi làm", G], half: ["Nửa ngày", B], leave_paid: ["Nghỉ phép", I], leave_unpaid: ["Nghỉ không lương", O], absent: ["Vắng", R], holiday: ["Nghỉ lễ", N] };
export const TASK_STATUS: Record<string, Tone> = { not_started: ["Chưa bắt đầu", N], in_progress: ["Đang làm", I], completed: ["Hoàn thành", G], deferred: ["Hoãn", O], cancelled: ["Đã hủy", N] };
export const TASK_TYPE: Record<string, string> = { to_do: "Việc cần làm", call: "Gọi điện", email: "Gửi email", meeting: "Họp", appointment: "Cuộc hẹn", visit: "Thăm khách", other: "Khác" };
export const TASK_PRIORITY: Record<string, Tone> = { low: ["Thấp", N], normal: ["Bình thường", B], high: ["Cao", O], urgent: ["Gấp", R] };

export const badge = (map: Record<string, Tone>, v: unknown): ReactNode => {
  const e = map[String(v)];
  return e ? <Badge className={e[1]}>{e[0]}</Badge> : <>{String(v ?? "—")}</>;
};
export const opts = (map: Record<string, Tone | string>): [string, string][] => Object.entries(map).map(([k, v]) => [k, typeof v === "string" ? v : v[0]]);
