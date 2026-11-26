// Quy tắc tiến độ (bản TypeScript, khớp với view public.project_stats trong CSDL).
import type { TaskStatus } from "./types";

export type ProgressInput = { progress: number; weight: number; status: TaskStatus };

/**
 * Tiến độ dự án = Σ(tiến độ × trọng số) / Σ trọng số, loại việc đã hủy.
 * Trả về null khi chưa có việc hợp lệ ("Chưa có dữ liệu tiến độ"). Làm tròn 1 chữ số thập phân.
 */
export function projectProgress(tasks: ProgressInput[]): number | null {
  let sumW = 0;
  let sum = 0;
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    if (!(t.weight > 0)) throw new Error("Trọng số phải lớn hơn 0");
    sumW += t.weight;
    sum += t.progress * t.weight;
  }
  if (sumW === 0) return null;
  return Math.round((sum / sumW) * 10) / 10;
}

/** Số việc hoàn tất: chỉ việc đã được duyệt. Việc báo 100% (Chờ duyệt) không tính. */
export function doneCount(tasks: { status: TaskStatus }[]): number {
  return tasks.filter((t) => t.status === "done").length;
}

/** Trạng thái mới khi người phụ trách báo tiến độ (khớp app.apply_progress). */
export function nextStatusOnProgress(current: TaskStatus, progress: number): TaskStatus {
  if (current === "in_review" || current === "done" || current === "cancelled") return current;
  if (progress === 100) return "in_review";
  if (progress > 0 || current === "in_progress") return "in_progress";
  return "todo";
}

export function formatProgress(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Chưa có dữ liệu tiến độ";
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")}%`;
}
