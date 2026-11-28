import { describe, expect, it } from "vitest";
import { checklistDetail, handoverInfo, inQuickView, nextStep, parseQuickView, quickViewCounts } from "@/lib/pipeline";
import type { Video } from "@/lib/types";

const base: Video = {
  id: "v", code: "D0012", title: "t", brief: null, channel_id: null, priority: "medium", stage: "handover", report_date: "2026-11-18", due_date: null,
  content_owner_id: "c", resource_url: "https://drive.example.com/x", content_note: null, editor_id: "e", handover_status: "pending", handover_submitted_at: "2026-11-20T03:00:00Z",
  handover_confirmed_at: null, editor_note: null, supplement_count: 0, edit_progress: 0, draft_url: null, review_note: null, revision_count: 0, approved_at: null,
  published_url: null, published_at: null, hold_reason: null, created_at: "", updated_at: "",
  items: { real_footage: "done", ai_video: "done", script_vo: "done", edit_map: "done" },
};
const v = (p: Partial<Video>): Video => ({ ...base, ...p });

describe("góc nhìn nhanh và trạng thái bàn giao", () => {
  it("D0012: đủ 4/4 nhưng chờ Editor xác nhận — hoàn tất checklist ≠ xác nhận bàn giao", () => {
    const d12 = v({});
    expect(checklistDetail(d12.items).every((i) => i.status === "done")).toBe(true);
    expect(handoverInfo(d12)).toMatchObject({ key: "pending", label: "Chờ Editor xác nhận" });
    expect(inQuickView(d12, "cho-ban-giao")).toBe(true);
    expect(nextStep(d12, { editor: "Duy" }).text).toBe("Chờ Duy xác nhận");
  });
  it("D0028: chưa có Editor, 0/4 hạng mục", () => {
    const d28 = v({ stage: "preparing", editor_id: null, handover_status: null, handover_submitted_at: null, items: { real_footage: "todo", ai_video: "todo", script_vo: "todo", edit_map: "todo" }, resource_url: null });
    expect(inQuickView(d28, "chua-editor")).toBe(true);
    expect(inQuickView(d28, "cho-ban-giao")).toBe(false);
    expect(handoverInfo(d28).key).toBe("not_sent");
    expect(nextStep(d28).text).toBe("Content hoàn tất 4 hạng mục còn lại");
  });
  it("D0020: đã nhận đủ nhưng đang tạm dừng", () => {
    const d20 = v({ stage: "on_hold", handover_status: "received", handover_confirmed_at: "2026-11-21T03:00:00Z", hold_reason: "Chờ khách duyệt kịch bản" });
    expect(inQuickView(d20, "tam-dung")).toBe(true);
    expect(inQuickView(d20, "cho-ban-giao")).toBe(false);
    expect(handoverInfo(d20)).toMatchObject({ key: "received", label: "Đã nhận đủ" });
    expect(nextStep(d20).tone).toBe("paused");
  });
  it("video đã đăng / hủy không tính là 'chưa có Editor'; đếm theo góc nhìn", () => {
    expect(inQuickView(v({ editor_id: null, stage: "published" }), "chua-editor")).toBe(false);
    expect(inQuickView(v({ editor_id: null, stage: "cancelled" }), "chua-editor")).toBe(false);
    const c = quickViewCounts([v({}), v({ editor_id: null, stage: "preparing", handover_status: null }), v({ stage: "on_hold" })]);
    expect(c).toEqual({ "tat-ca": 3, "cho-ban-giao": 1, "chua-editor": 1, "tam-dung": 1 });
    expect(parseQuickView("rac")).toBe("tat-ca");
  });
  it("đủ 4/4 nhưng thiếu link / Editor thì bước tiếp theo nói rõ thiếu gì", () => {
    expect(nextStep(v({ stage: "preparing", handover_status: null, resource_url: null })).text).toBe("Content thêm link tài nguyên");
    expect(nextStep(v({ stage: "preparing", handover_status: null, editor_id: null })).text).toBe("Chọn Editor tiếp nhận");
    expect(nextStep(v({ stage: "preparing", handover_status: null })).text).toBe("Content gửi bàn giao");
    expect(nextStep(v({ stage: "preparing", handover_status: "needs_more" })).text).toContain("bổ sung");
  });
});
