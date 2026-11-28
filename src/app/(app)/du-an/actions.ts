"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { readFiles } from "@/lib/voucher-files";
import type { ActionResult } from "@/lib/types";

/** Tải tài liệu lên dự án (kế hoạch, báo cáo, báo giá, hợp đồng…). Quyền kiểm tra lại trong hàm CSDL add_project_file. */
export async function uploadProjectFileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const project = z.guid().safeParse(fd.get("project"));
  const kind = z.enum(["project", "plan", "report", "quote", "contract", "other"]).safeParse(fd.get("kind") ?? "project");
  if (!project.success || !kind.success) return { ok: false, error: "Thông tin tài liệu không hợp lệ." };
  const { files, error: fileErr } = await readFiles(fd);
  if (fileErr) return { ok: false, error: fileErr };
  if (!files.length) return { ok: false, error: "Chọn ít nhất một tệp." };
  const supabase = await createSupabaseServerClient();
  for (const f of files) {
    const { error } = await supabase.rpc("add_project_file", { p_project: project.data, p_kind: kind.data, p_name: f.name, p_mime: f.mime, p_content_base64: f.base64 });
    if (error) { revalidatePath(`/du-an/${project.data}`); return { ok: false, error: `${f.name}: ${toUserMessage(error)}` }; }
  }
  revalidatePath(`/du-an/${project.data}`);
  return { ok: true, message: `Đã tải lên ${files.length} tài liệu.` };
}
