// Quy tắc nghiệp vụ thuần (không phụ thuộc CSDL) — dùng cho giao diện, báo cáo và kiểm thử đơn vị.
import { ITEM_KINDS } from "./labels";
import type { AppRole, ItemStatus, Video, VideoStage } from "./types";

/** "Trạng thái Content" như cột trong bảng gốc. */
export function contentStatus(stage: VideoStage): "Đang triển khai" | "Chờ bàn giao" | "Đã bàn giao" | "Tạm dừng" | "Đã hủy" {
  if (stage === "idea" || stage === "preparing") return "Đang triển khai";
  if (stage === "handover") return "Chờ bàn giao";
  if (stage === "on_hold") return "Tạm dừng";
  if (stage === "cancelled") return "Đã hủy";
  return "Đã bàn giao";
}

/** Số hạng mục Content đã Hoàn thành (0–4). */
export function itemsDone(items: Record<string, ItemStatus>): number {
  return ITEM_KINDS.filter((k) => items[k] === "done").length;
}

/** Thiếu gì để bàn giao (rỗng = sẵn sàng). */
export function handoverBlockers(v: Pick<Video, "items" | "resource_url" | "editor_id">): string[] {
  const out: string[] = [];
  const names: Record<string, string> = { real_footage: "Nguồn thật", ai_video: "Video AI", script_vo: "Kịch bản / VO", edit_map: "Sơ đồ dựng" };
  const missing = ITEM_KINDS.filter((k) => v.items[k] !== "done").map((k) => names[k]);
  if (missing.length) out.push(`Chưa hoàn thành: ${missing.join(", ")}`);
  if (!v.resource_url) out.push("Chưa có link tài nguyên");
  if (!v.editor_id) out.push("Chưa chọn Editor tiếp nhận");
  return out;
}

/** Quá hạn đăng: có hạn, hạn < hôm nay, chưa đăng/hủy. */
export function isOverdue(v: Pick<Video, "due_date" | "stage">, today: string): boolean {
  return !!v.due_date && v.due_date < today && v.stage !== "published" && v.stage !== "cancelled";
}

/** Việc người dùng cần làm với video này (null = không có). */
export function myAction(v: Video, userId: string, roles: AppRole[]): string | null {
  const isManager = roles.includes("manager");
  if (v.content_owner_id === userId && (v.stage === "idea" || v.stage === "preparing")) {
    return v.handover_status === "needs_more" ? "Bổ sung theo yêu cầu của Editor" : "Chuẩn bị Content";
  }
  if (v.editor_id === userId && v.stage === "handover") return "Xác nhận bàn giao";
  if (v.editor_id === userId && v.stage === "editing") return v.revision_count > 0 && v.review_note ? "Sửa theo góp ý" : "Dựng video";
  if (isManager && v.stage === "review") return "Duyệt bản dựng";
  if (isManager && v.stage === "ready") return "Đăng kênh";
  return null;
}

/** Khoảng ngày của tháng "YYYY-MM". */
export function monthRange(month: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error("Tháng không hợp lệ");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type MonthlyKpi = {
  total: number;
  handedOver: number;
  firstPassRate: number | null; // % video được nhận đủ ngay lần đầu (trong số đã bàn giao)
  supplements: number;
  revisions: number;
  inEditing: number;
  inReview: number;
  published: number;
  overdue: number;
};

export function monthlyKpi(videos: Video[], today: string): MonthlyKpi {
  const active = videos.filter((v) => v.stage !== "cancelled");
  const handed = active.filter((v) => ["editing", "review", "ready", "published"].includes(v.stage));
  const firstPass = handed.filter((v) => v.supplement_count === 0).length;
  return {
    total: active.length,
    handedOver: handed.length,
    firstPassRate: handed.length ? Math.round((firstPass / handed.length) * 100) : null,
    supplements: active.reduce((s, v) => s + v.supplement_count, 0),
    revisions: active.reduce((s, v) => s + v.revision_count, 0),
    inEditing: active.filter((v) => v.stage === "editing").length,
    inReview: active.filter((v) => v.stage === "review").length,
    published: active.filter((v) => v.stage === "published").length,
    overdue: active.filter((v) => isOverdue(v, today)).length,
  };
}

/** Một ô CSV an toàn (chống chèn công thức khi mở bằng Excel/Sheets). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
