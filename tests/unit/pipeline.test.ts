import { describe, expect, it } from "vitest";
import { contentStatus, csvCell, handoverBlockers, isOverdue, itemsDone, monthRange, monthlyKpi, myAction, shiftMonth } from "@/lib/pipeline";
import { toUserMessage } from "@/lib/errors";
import type { Video } from "@/lib/types";

const base: Video = {
  id: "v1", code: "D0001", title: "t", brief: null, channel_id: null, priority: "medium", stage: "preparing",
  report_date: "2026-11-18", due_date: null, content_owner_id: "c", resource_url: null, content_note: null, editor_id: "e",
  handover_status: null, handover_submitted_at: null, handover_confirmed_at: null, editor_note: null, supplement_count: 0,
  edit_progress: 0, draft_url: null, review_note: null, revision_count: 0, approved_at: null, published_url: null,
  published_at: null, hold_reason: null, created_at: "", updated_at: "",
  items: { real_footage: "done", ai_video: "doing", script_vo: "done", edit_map: "todo" },
};
const v = (p: Partial<Video>): Video => ({ ...base, ...p });

describe("quy tắc quy trình", () => {
  it("Trạng thái Content khớp cột của bảng gốc", () => {
    expect(contentStatus("idea")).toBe("Đang triển khai");
    expect(contentStatus("preparing")).toBe("Đang triển khai");
    expect(contentStatus("handover")).toBe("Chờ bàn giao");
    expect(contentStatus("editing")).toBe("Đã bàn giao");
    expect(contentStatus("published")).toBe("Đã bàn giao");
  });
  it("điều kiện bàn giao", () => {
    expect(itemsDone(base.items)).toBe(2);
    expect(handoverBlockers(base)).toEqual(["Chưa hoàn thành: Video AI, Sơ đồ dựng", "Chưa có link tài nguyên"]);
    expect(handoverBlockers(v({ items: { real_footage: "done", ai_video: "done", script_vo: "done", edit_map: "done" }, resource_url: "https://x", editor_id: null }))).toEqual(["Chưa chọn Editor tiếp nhận"]);
  });
  it("việc cần làm theo vai trò", () => {
    expect(myAction(base, "c", ["content"])).toBe("Chuẩn bị Content");
    expect(myAction(v({ handover_status: "needs_more" }), "c", ["content"])).toBe("Bổ sung theo yêu cầu của Editor");
    expect(myAction(v({ stage: "handover" }), "e", ["editor"])).toBe("Xác nhận bàn giao");
    expect(myAction(v({ stage: "editing", revision_count: 1, review_note: "x" }), "e", ["editor"])).toBe("Sửa theo góp ý");
    expect(myAction(v({ stage: "review" }), "m", ["manager"])).toBe("Duyệt bản dựng");
    expect(myAction(v({ stage: "review" }), "e", ["editor"])).toBeNull();
  });
  it("quá hạn và tháng", () => {
    expect(isOverdue(v({ due_date: "2026-11-20" }), "2026-11-26")).toBe(true);
    expect(isOverdue(v({ due_date: "2026-11-20", stage: "published" }), "2026-11-26")).toBe(false);
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("chỉ số tháng", () => {
    const k = monthlyKpi([
      v({ stage: "editing", supplement_count: 1 }),
      v({ stage: "published", revision_count: 2 }),
      v({ stage: "handover" }),
      v({ stage: "cancelled", supplement_count: 5 }),
    ], "2026-11-26");
    expect(k).toMatchObject({ total: 3, handedOver: 2, firstPassRate: 50, supplements: 1, revisions: 2, published: 1 });
  });
  it("CSV an toàn: chống chèn công thức, bọc dấu phẩy/ngoặc kép", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('cá sấu, "sư tử"')).toBe('"cá sấu, ""sư tử"""');
    expect(csvCell(null)).toBe("");
  });
  it("thông báo lỗi tiếng Việt", () => {
    expect(toUserMessage({ code: "42501", message: "permission denied" })).toBe("Bạn không có quyền thực hiện thao tác này.");
    expect(toUserMessage({ code: "22023", message: "Chưa hoàn thành: Video AI" })).toBe("Chưa hoàn thành: Video AI");
  });
});
