import { describe, expect, it } from "vitest";
import { doneCount, formatProgress, nextStatusOnProgress, projectProgress } from "@/lib/progress";
import { isOverdue } from "@/lib/dates";
import { toUserMessage } from "@/lib/errors";

describe("projectProgress", () => {
  it("tính có trọng số và loại việc đã hủy", () => {
    expect(
      projectProgress([
        { progress: 100, weight: 1, status: "done" },
        { progress: 60, weight: 2, status: "in_progress" },
        { progress: 40, weight: 1, status: "in_progress" },
        { progress: 0, weight: 1, status: "todo" },
        { progress: 10, weight: 5, status: "cancelled" },
      ]),
    ).toBe(52);
  });
  it("null khi không có việc hợp lệ", () => {
    expect(projectProgress([])).toBeNull();
    expect(projectProgress([{ progress: 50, weight: 1, status: "cancelled" }])).toBeNull();
  });
  it("làm tròn 1 chữ số", () => {
    expect(projectProgress([{ progress: 30, weight: 1, status: "todo" }, { progress: 0, weight: 3, status: "todo" }])).toBe(7.5);
    expect(projectProgress([{ progress: 10, weight: 1, status: "todo" }, { progress: 0, weight: 2, status: "todo" }])).toBe(3.3);
  });
  it("từ chối trọng số ≤ 0", () => {
    expect(() => projectProgress([{ progress: 10, weight: 0, status: "todo" }])).toThrow();
  });
});

describe("trạng thái và hoàn tất", () => {
  it("100% → Chờ duyệt, không tự hoàn tất", () => {
    expect(nextStatusOnProgress("in_progress", 100)).toBe("in_review");
    expect(nextStatusOnProgress("todo", 30)).toBe("in_progress");
    expect(nextStatusOnProgress("todo", 0)).toBe("todo");
    expect(nextStatusOnProgress("in_review", 50)).toBe("in_review");
    expect(doneCount([{ status: "in_review" }, { status: "done" }, { status: "done" }])).toBe(2);
  });
  it("hiển thị tiến độ", () => {
    expect(formatProgress(null)).toBe("Chưa có dữ liệu tiến độ");
    expect(formatProgress(52)).toBe("52%");
    expect(formatProgress(7.5)).toBe("7,5%");
  });
  it("quá hạn theo ngày doanh nghiệp", () => {
    expect(isOverdue("2026-11-25", "2026-11-26", "in_progress")).toBe(true);
    expect(isOverdue("2026-11-26", "2026-11-26", "in_progress")).toBe(false);
    expect(isOverdue("2026-11-01", "2026-11-26", "done")).toBe(false);
  });
  it("thông báo lỗi tiếng Việt", () => {
    expect(toUserMessage({ code: "42501", message: "permission denied for table tasks" })).toBe("Bạn không có quyền thực hiện thao tác này.");
    expect(toUserMessage({ code: "22023", message: "Cần nhập lý do trả lại" })).toBe("Cần nhập lý do trả lại");
  });
});
