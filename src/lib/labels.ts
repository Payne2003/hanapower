import type { AppRole, HandoverStatus, ItemKind, ItemStatus, VideoPriority, VideoStage } from "./types";

// Trạng thái luôn có NHÃN CHỮ đi cùng màu.
export const STAGE: Record<VideoStage, { label: string; tone: string }> = {
  idea: { label: "Ý tưởng", tone: "bg-neutral-100 text-neutral-700 ring-neutral-300" },
  preparing: { label: "Đang chuẩn bị", tone: "bg-sky-50 text-sky-800 ring-sky-300" },
  handover: { label: "Chờ bàn giao", tone: "bg-violet-50 text-violet-800 ring-violet-300" },
  editing: { label: "Đang dựng", tone: "bg-indigo-50 text-indigo-800 ring-indigo-300" },
  review: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-800 ring-amber-300" },
  ready: { label: "Chờ đăng", tone: "bg-teal-50 text-teal-800 ring-teal-300" },
  published: { label: "Đã đăng", tone: "bg-emerald-50 text-emerald-800 ring-emerald-300" },
  on_hold: { label: "Tạm dừng", tone: "bg-orange-50 text-orange-800 ring-orange-300" },
  cancelled: { label: "Đã hủy", tone: "bg-neutral-50 text-neutral-500 ring-neutral-200 line-through" },
};

/** Các bước chính theo thứ tự (dùng cho thanh tiến trình và Kanban). */
export const PIPELINE: VideoStage[] = ["idea", "preparing", "handover", "editing", "review", "ready", "published"];

export const ITEM_KINDS: ItemKind[] = ["real_footage", "ai_video", "script_vo", "edit_map"];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  real_footage: "Nguồn thật",
  ai_video: "Video AI",
  script_vo: "Kịch bản / VO",
  edit_map: "Sơ đồ dựng",
};

export const ITEM_STATUS: Record<ItemStatus, { label: string; tone: string }> = {
  todo: { label: "Chưa làm", tone: "bg-neutral-100 text-neutral-700 ring-neutral-300" },
  doing: { label: "Đang làm", tone: "bg-amber-50 text-amber-800 ring-amber-300" },
  done: { label: "Hoàn thành", tone: "bg-emerald-50 text-emerald-800 ring-emerald-300" },
};

export const HANDOVER: Record<HandoverStatus, { label: string; tone: string }> = {
  pending: { label: "Chờ xác nhận", tone: "bg-violet-50 text-violet-800 ring-violet-300" },
  received: { label: "Đã nhận đủ", tone: "bg-emerald-50 text-emerald-800 ring-emerald-300" },
  needs_more: { label: "Yêu cầu bổ sung", tone: "bg-red-50 text-red-800 ring-red-300" },
};

export const PRIORITY: Record<VideoPriority, { label: string; tone: string }> = {
  low: { label: "Thấp", tone: "text-neutral-600" },
  medium: { label: "Bình thường", tone: "text-neutral-800" },
  high: { label: "Cao", tone: "text-orange-700" },
  urgent: { label: "Gấp", tone: "text-red-700 font-semibold" },
};

export const ROLE_LABEL: Record<AppRole, string> = {
  system_admin: "Quản trị hệ thống",
  manager: "Leader / Quản lý sản xuất",
  content: "Content",
  editor: "Editor",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "Tạo video",
  imported: "Nhập từ bảng báo cáo cũ",
  edit_info: "Sửa thông tin",
  assign: "Phân công",
  content_update: "Cập nhật Content",
  handover_submit: "Content bàn giao",
  handover_received: "Editor xác nhận đã nhận đủ",
  handover_needs_more: "Editor yêu cầu bổ sung",
  edit_progress: "Cập nhật tiến độ dựng",
  review_submit: "Nộp duyệt",
  revision_requested: "Yêu cầu sửa",
  approved: "Duyệt",
  published: "Đăng kênh",
  hold: "Tạm dừng",
  resume: "Tiếp tục",
  cancel: "Hủy",
};
