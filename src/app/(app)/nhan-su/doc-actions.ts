"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const MAX = 5 * 1024 * 1024;

/** Tải tài liệu lên hồ sơ nhân viên. Quyền (quản trị / nhân sự) và giới hạn 5 MB được kiểm tra lại trong hàm CSDL save_user_document. */
export async function uploadDocumentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const userId = z.guid().safeParse(fd.get("user_id"));
  if (!userId.success) return { ok: false, error: "Mã nhân viên không hợp lệ." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn một tệp để tải lên." };
  if (file.size > MAX) return { ok: false, error: "Tệp tối đa 5 MB." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_user_document", {
    p_user: userId.data, p_name: file.name, p_mime: file.type || "application/octet-stream", p_content_base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/nhan-su", "layout");
  return { ok: true, message: `Đã tải lên ${file.name}.` };
}
