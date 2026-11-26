"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function changePasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const pw = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (pw.length < 8) return { ok: false, error: "Mật khẩu tối thiểu 8 ký tự." };
  if (pw !== confirm) return { ok: false, error: "Mật khẩu nhập lại không khớp." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { ok: false, error: "Không đổi được mật khẩu: " + error.message };
  return { ok: true, message: "Đã đổi mật khẩu." };
}
