"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const id = z.guid("Mã không hợp lệ");
const optId = z.union([z.literal(""), z.guid()]).optional().transform((v) => (v ? v : null));
const text = (max = 4000) => z.string().max(max).optional().default("");
const itemStatus = z.enum(["todo", "doing", "done"]);
const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().transform((v) => (v ? v : null));
const priority = z.enum(["low", "medium", "high", "urgent"]).default("medium");

function bad(e: z.ZodError): ActionResult {
  return { ok: false, error: e.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
}

/** Một server action cho mọi thao tác trên một video; `op` lấy từ nút bấm. Quyền kiểm tra trong hàm CSDL. */
export async function videoAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const vid = id.safeParse(raw.video_id);
  if (!vid.success) return bad(vid.error);
  const supabase = await createSupabaseServerClient();
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args);
    return error ? toUserMessage(error) : null;
  };
  const p_video_id = vid.data;
  let err: string | null = null;
  let message = "Đã lưu.";

  switch (raw.op) {
    case "save_content":
    case "handover": {
      const s = z.object({
        real_footage: itemStatus, ai_video: itemStatus, script_vo: itemStatus, edit_map: itemStatus,
        resource_url: text(2000), content_note: text(),
      }).safeParse(raw);
      if (!s.success) return bad(s.error);
      err = await rpc("update_content", {
        p_video_id, p_real_footage: s.data.real_footage, p_ai_video: s.data.ai_video, p_script_vo: s.data.script_vo,
        p_edit_map: s.data.edit_map, p_resource_url: s.data.resource_url, p_content_note: s.data.content_note,
      });
      if (!err && raw.op === "handover") {
        err = await rpc("submit_handover", { p_video_id, p_note: null });
        message = "Đã bàn giao cho Editor.";
      } else message = "Đã lưu phần Content.";
      break;
    }
    case "received":
    case "needs_more": {
      err = await rpc("confirm_handover", { p_video_id, p_decision: raw.op, p_note: raw.note ?? "" });
      message = raw.op === "received" ? "Đã xác nhận nhận đủ — chuyển sang Đang dựng." : "Đã gửi yêu cầu bổ sung cho Content.";
      break;
    }
    case "save_edit":
    case "submit_review": {
      const s = z.object({ progress: z.coerce.number().int().min(0, "Tiến độ 0–100").max(100, "Tiến độ 0–100"), draft_url: text(2000), note: text() }).safeParse(raw);
      if (!s.success) return bad(s.error);
      err = await rpc("update_edit", { p_video_id, p_progress: s.data.progress, p_draft_url: s.data.draft_url, p_note: s.data.note });
      if (!err && raw.op === "submit_review") {
        err = await rpc("submit_for_review", { p_video_id, p_note: s.data.note });
        message = "Đã nộp bản dựng chờ duyệt.";
      } else message = "Đã cập nhật tiến độ dựng.";
      break;
    }
    case "approve":
    case "revise": {
      err = await rpc("review_video", { p_video_id, p_decision: raw.op, p_note: raw.note ?? "" });
      message = raw.op === "approve" ? "Đã duyệt — video chuyển sang Chờ đăng." : "Đã gửi yêu cầu sửa cho Editor.";
      break;
    }
    case "publish": {
      const s = z.object({ published_url: z.string().trim().min(1, "Nhập link video đã đăng"), published_at: date, channel_id: optId }).safeParse(raw);
      if (!s.success) return bad(s.error);
      err = await rpc("publish_video", { p_video_id, p_published_url: s.data.published_url, p_published_at: s.data.published_at, p_channel_id: s.data.channel_id });
      message = "Đã ghi nhận video đã đăng.";
      break;
    }
    case "assign": {
      const s = z.object({ content_owner_id: optId, editor_id: optId }).safeParse(raw);
      if (!s.success) return bad(s.error);
      err = await rpc("assign_video", { p_video_id, p_content_owner_id: s.data.content_owner_id, p_editor_id: s.data.editor_id });
      message = "Đã cập nhật phân công.";
      break;
    }
    case "info": {
      const s = z.object({ title: z.string().trim().min(1, "Nhập tên video").max(300), brief: text(), channel_id: optId, due_date: date, priority }).safeParse(raw);
      if (!s.success) return bad(s.error);
      err = await rpc("update_video_info", { p_video_id, p_title: s.data.title, p_brief: s.data.brief, p_channel_id: s.data.channel_id, p_due_date: s.data.due_date, p_priority: s.data.priority });
      message = "Đã cập nhật thông tin video.";
      break;
    }
    case "hold":
    case "resume":
    case "cancel": {
      err = await rpc("set_video_hold", { p_video_id, p_action: raw.op, p_reason: raw.reason ?? "" });
      message = raw.op === "hold" ? "Đã tạm dừng video." : raw.op === "resume" ? "Đã tiếp tục video." : "Đã hủy video.";
      break;
    }
    case "comment": {
      const body = (raw.body ?? "").trim();
      if (!body) return { ok: false, error: "Nhập nội dung bình luận." };
      err = await rpc("add_video_comment", { p_video_id, p_body: body });
      message = "Đã gửi bình luận.";
      break;
    }
    default:
      return { ok: false, error: "Thao tác không hợp lệ." };
  }
  if (err) return { ok: false, error: err };
  revalidatePath(`/video/${p_video_id}`);
  revalidatePath("/video");
  revalidatePath("/");
  return { ok: true, message };
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Nhập tên video").max(300),
  brief: text(),
  channel_id: optId,
  content_owner_id: optId,
  editor_id: optId,
  due_date: date,
  priority,
});

export async function createVideoAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = createSchema.safeParse(Object.fromEntries(fd));
  if (!s.success) return bad(s.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_video", {
    p_title: s.data.title, p_brief: s.data.brief, p_channel_id: s.data.channel_id,
    p_content_owner_id: s.data.content_owner_id, p_editor_id: s.data.editor_id,
    p_due_date: s.data.due_date, p_priority: s.data.priority,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/video");
  redirect(`/video/${(data as { id: string }).id}`);
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/thong-bao");
  revalidatePath("/", "layout");
}
