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

// ---------------------------------------------------------------------------------------------------
// Trang Video "Quản lý sản xuất": ba câu hỏi — video nào cần xử lý, ai phụ trách, việc tiếp theo là gì.
// Ba thông tin nghiệp vụ tách riêng: HẠNG MỤC (checklist Content), BÀN GIAO (gửi / xác nhận tài nguyên), GIAI ĐOẠN (bước sản xuất).
// ---------------------------------------------------------------------------------------------------

export type QuickView = "tat-ca" | "cho-ban-giao" | "chua-editor" | "tam-dung";
export const QUICK_VIEWS: { key: QuickView; label: string; hint: string }[] = [
  { key: "tat-ca", label: "Tất cả", hint: "Mọi video khớp tìm kiếm và bộ lọc" },
  { key: "cho-ban-giao", label: "Chờ xác nhận bàn giao", hint: "Content đã gửi bàn giao, Editor chưa xác nhận đã nhận" },
  { key: "chua-editor", label: "Chưa có Editor", hint: "Video đang chạy mà chưa phân công Editor" },
  { key: "tam-dung", label: "Tạm dừng", hint: "Video đang tạm dừng" },
];

export function parseQuickView(v: string | undefined): QuickView {
  return QUICK_VIEWS.some((q) => q.key === v) ? (v as QuickView) : "tat-ca";
}

/** Video có thuộc góc nhìn nhanh không. */
export function inQuickView(v: Pick<Video, "stage" | "handover_status" | "editor_id">, view: QuickView): boolean {
  switch (view) {
    case "cho-ban-giao": return v.stage === "handover" && v.handover_status === "pending";
    case "chua-editor": return !v.editor_id && v.stage !== "published" && v.stage !== "cancelled";
    case "tam-dung": return v.stage === "on_hold";
    default: return true;
  }
}

/** Chi tiết 4 hạng mục Content: tên + trạng thái, theo thứ tự cố định. */
export function checklistDetail(items: Record<string, ItemStatus>) {
  return ITEM_KINDS.map((kind) => ({ kind, label: ITEM_LABELS[kind], status: items[kind] ?? ("todo" as ItemStatus) }));
}
const ITEM_LABELS: Record<string, string> = { real_footage: "Nguồn thật", ai_video: "Video AI", script_vo: "Kịch bản / VO", edit_map: "Sơ đồ dựng" };

export type HandoverInfo = { key: "not_sent" | "pending" | "received" | "needs_more"; label: string; at: string | null; atLabel: string | null };
/**
 * Tình trạng BÀN GIAO tài nguyên (khác với checklist Content và khác với giai đoạn):
 * chưa gửi · đã gửi, chờ Editor xác nhận · Editor đã nhận đủ · Editor yêu cầu bổ sung.
 * "Hoàn tất checklist" và "xác nhận bàn giao" là hai sự kiện riêng: 4/4 hạng mục chưa có nghĩa là Editor đã nhận.
 */
export function handoverInfo(v: Pick<Video, "handover_status" | "handover_submitted_at" | "handover_confirmed_at">): HandoverInfo {
  switch (v.handover_status) {
    case "pending": return { key: "pending", label: "Chờ Editor xác nhận", at: v.handover_submitted_at, atLabel: "Gửi" };
    case "received": return { key: "received", label: "Đã nhận đủ", at: v.handover_confirmed_at, atLabel: "Nhận" };
    case "needs_more": return { key: "needs_more", label: "Yêu cầu bổ sung", at: v.handover_confirmed_at, atLabel: "Yêu cầu" };
    default: return { key: "not_sent", label: "Chưa gửi bàn giao", at: null, atLabel: null };
  }
}

/** Bước tiếp theo bằng một câu ngắn, ví dụ "Chờ Editor xác nhận" — dựa trên dữ liệu thật của video. */
export function nextStep(v: Video, names: { content?: string | null; editor?: string | null } = {}): { text: string; tone: "action" | "wait" | "done" | "paused" } {
  const done = itemsDone(v.items);
  switch (v.stage) {
    case "idea":
    case "preparing":
      if (v.handover_status === "needs_more") return { text: "Content bổ sung theo yêu cầu của Editor", tone: "action" };
      if (done < 4) return { text: `Content hoàn tất ${4 - done} hạng mục còn lại`, tone: "action" };
      if (!v.resource_url) return { text: "Content thêm link tài nguyên", tone: "action" };
      if (!v.editor_id) return { text: "Chọn Editor tiếp nhận", tone: "action" };
      return { text: "Content gửi bàn giao", tone: "action" };
    case "handover":
      return v.editor_id ? { text: `Chờ ${names.editor ?? "Editor"} xác nhận`, tone: "wait" } : { text: "Chọn Editor để xác nhận bàn giao", tone: "action" };
    case "editing": return { text: v.revision_count > 0 && v.review_note ? "Editor sửa theo góp ý" : `Editor đang dựng (${v.edit_progress}%)`, tone: "wait" };
    case "review": return { text: "Chờ Leader duyệt bản dựng", tone: "wait" };
    case "ready": return { text: "Chờ đăng kênh", tone: "action" };
    case "published": return { text: "Đã đăng", tone: "done" };
    case "on_hold": return { text: v.hold_reason ? `Tạm dừng: ${v.hold_reason}` : "Tạm dừng — chờ Leader tiếp tục", tone: "paused" };
    case "cancelled": return { text: "Đã hủy", tone: "done" };
  }
}

/** Đếm số video theo từng góc nhìn nhanh trên một tập video đã lọc theo tháng / tìm kiếm / người (chưa lọc giai đoạn). */
export function quickViewCounts(videos: Pick<Video, "stage" | "handover_status" | "editor_id">[]): Record<QuickView, number> {
  return Object.fromEntries(QUICK_VIEWS.map((q) => [q.key, videos.filter((v) => inQuickView(v, q.key)).length])) as Record<QuickView, number>;
}

/** Bộ lọc người: "c:<id>" (chỉ Content), "e:<id>" (chỉ Editor), "toi" (của tôi — Content hoặc Editor), "<id>" (Content hoặc Editor). */
export function parsePersonFilter(raw: string | undefined, userId: string): { id?: string; role?: "content" | "editor" } {
  if (!raw) return {};
  if (raw === "toi") return { id: userId };
  const m = /^([ce]):([0-9a-f-]{36})$/i.exec(raw);
  if (m) return { id: m[2]!, role: m[1]!.toLowerCase() === "c" ? "content" : "editor" };
  return /^[0-9a-f-]{36}$/i.test(raw) ? { id: raw } : {};
}
