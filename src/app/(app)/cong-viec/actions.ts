"use server";
// Thêm nhanh một việc vào đúng cột của bảng (nút "+"): tạo bằng save_task rồi đặt trạng thái cột bằng set_task_status.
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function quickAddTask(title: string, status: "not_started" | "in_progress" | "completed", groupId?: string | null): Promise<ActionResult> {
  const t = title.trim();
  if (!t) return { ok: false, error: "Nhập tên công việc." };
  if (t.length > 200) return { ok: false, error: "Tên công việc tối đa 200 ký tự." };
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_task", { p_id: null, p_title: t, p_assignees: [ctx.user_id] });
  if (error) return { ok: false, error: toUserMessage(error) };
  if (status !== "not_started" && typeof data === "string") {
    const r = await supabase.rpc("set_task_status", { p_id: data, p_status: status });
    if (r.error) { revalidatePath("/cong-viec", "layout"); return { ok: false, error: `Đã tạo việc nhưng chưa đặt được cột: ${toUserMessage(r.error)}` }; }
  }
  if (groupId && typeof data === "string") {
    const r = await supabase.rpc("set_task_group", { p_id: data, p_group: groupId });
    if (r.error) { revalidatePath("/cong-viec", "layout"); return { ok: false, error: `Đã tạo việc nhưng chưa xếp được vào nhóm: ${toUserMessage(r.error)}` }; }
  }
  revalidatePath("/cong-viec", "layout");
  return { ok: true, message: "Đã thêm công việc." };
}
