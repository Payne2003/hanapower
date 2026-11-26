"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const roles = ["system_admin", "department_manager", "project_manager", "employee"] as const;

export async function setRolesAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const userId = z.guid().safeParse(fd.get("user_id"));
  if (!userId.success) return { ok: false, error: "Mã nhân sự không hợp lệ" };
  const selected = fd.getAll("roles").map(String).filter((r): r is (typeof roles)[number] => (roles as readonly string[]).includes(r));
  if (selected.length === 0) return { ok: false, error: "Cần ít nhất một vai trò." };
  const supabase = await createSupabaseServerClient();
  // Quyền được kiểm tra trong hàm CSDL set_user_roles (roles.manage) và được ghi nhật ký.
  const { error } = await supabase.rpc("set_user_roles", { p_user_id: userId.data, p_roles: selected });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/nhan-su");
  return { ok: true, message: "Đã cập nhật vai trò." };
}

export async function setActiveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const userId = z.guid().safeParse(fd.get("user_id"));
  if (!userId.success) return { ok: false, error: "Mã nhân sự không hợp lệ" };
  const active = fd.get("active") === "true";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_user_active", { p_user_id: userId.data, p_active: active });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/nhan-su");
  return { ok: true, message: active ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản." };
}
