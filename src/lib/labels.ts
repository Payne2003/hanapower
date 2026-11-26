import type { AppRole, ProjectStatus, TaskPriority, TaskStatus } from "./types";

// Trạng thái luôn có NHÃN CHỮ đi cùng màu (không chỉ dựa vào màu).
export const TASK_STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: "Cần làm", tone: "bg-neutral-100 text-neutral-700 ring-neutral-300" },
  in_progress: { label: "Đang làm", tone: "bg-sky-50 text-sky-800 ring-sky-300" },
  in_review: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-800 ring-amber-300" },
  done: { label: "Hoàn tất", tone: "bg-emerald-50 text-emerald-800 ring-emerald-300" },
  cancelled: { label: "Đã hủy", tone: "bg-neutral-50 text-neutral-500 ring-neutral-200 line-through" },
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

export const TASK_PRIORITY: Record<TaskPriority, { label: string; tone: string }> = {
  low: { label: "Thấp", tone: "text-neutral-600" },
  medium: { label: "Trung bình", tone: "text-neutral-800" },
  high: { label: "Cao", tone: "text-orange-700" },
  urgent: { label: "Khẩn", tone: "text-red-700 font-semibold" },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  planning: { label: "Lên kế hoạch", tone: "bg-neutral-100 text-neutral-700 ring-neutral-300" },
  active: { label: "Đang thực hiện", tone: "bg-emerald-50 text-emerald-800 ring-emerald-300" },
  on_hold: { label: "Tạm dừng", tone: "bg-amber-50 text-amber-800 ring-amber-300" },
  completed: { label: "Đã xong", tone: "bg-sky-50 text-sky-800 ring-sky-300" },
  cancelled: { label: "Đã hủy", tone: "bg-neutral-50 text-neutral-500 ring-neutral-200" },
};

export const ROLE_LABEL: Record<AppRole, string> = {
  system_admin: "Quản trị hệ thống",
  department_manager: "Quản lý phòng ban",
  project_manager: "Quản lý dự án",
  employee: "Nhân viên",
};
