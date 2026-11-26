"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContext, can } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const roles = ["system_admin", "manager", "content", "editor"] as const;

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

// ---------------------------------------------------------------------------
// Quản trị tài khoản (chỉ quản trị hệ thống). Dùng khóa service_role ở MÁY CHỦ
// sau khi đã kiểm tra quyền của người gọi; mọi thay đổi ghi nhật ký kiểm toán.
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  full_name: z.string().trim().min(1, "Nhập họ tên").max(120),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72),
  job_title: z.string().trim().max(120).optional().default(""),
  department_id: z.union([z.literal(""), z.guid()]).optional().transform((v) => (v ? v : null)),
});

export async function createAccountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!can(ctx, "users.manage")) return { ok: false, error: "Chỉ quản trị hệ thống được tạo tài khoản." };
  const parsed = accountSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const selected = fd.getAll("roles").map(String).filter((r): r is (typeof roles)[number] => (roles as readonly string[]).includes(r));
  if (selected.length === 0) return { ok: false, error: "Chọn ít nhất một vai trò." };
  const d = parsed.data;

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Máy chủ chưa cấu hình khóa quản trị (SUPABASE_SERVICE_ROLE_KEY)." };
  }
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.full_name },
  });
  if (authError || !created.user) {
    const msg = authError?.message ?? "";
    return { ok: false, error: /already|registered|exists/i.test(msg) ? "Email này đã có tài khoản." : "Không tạo được tài khoản: " + msg };
  }
  const uid = created.user.id;
  const { error: pErr } = await admin.from("profiles").insert({
    id: uid, org_id: ctx.org_id, full_name: d.full_name, email: d.email, job_title: d.job_title || null, department_id: d.department_id,
  });
  const { error: rErr } = pErr ? { error: pErr } : await admin.from("user_roles").insert(selected.map((role) => ({ org_id: ctx.org_id, user_id: uid, role, granted_by: ctx.user_id })));
  if (pErr || rErr) {
    await admin.auth.admin.deleteUser(uid); // hoàn tác để không để lại tài khoản dở dang
    return { ok: false, error: "Không lưu được hồ sơ nhân sự: " + (pErr ?? rErr)!.message };
  }
  await admin.from("audit_logs").insert({
    org_id: ctx.org_id, actor_id: ctx.user_id, action: "user.create", entity_type: "profile", entity_id: uid,
    details: { email: d.email, roles: selected },
  });
  revalidatePath("/nhan-su");
  return { ok: true, message: `Đã tạo tài khoản ${d.email}. Gửi email và mật khẩu cho nhân viên; họ nên đổi mật khẩu ở mục Cài đặt.` };
}

export async function resetPasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!can(ctx, "users.manage")) return { ok: false, error: "Chỉ quản trị hệ thống được đặt lại mật khẩu." };
  const userId = z.guid().safeParse(fd.get("user_id"));
  const password = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72).safeParse(fd.get("password"));
  if (!userId.success) return { ok: false, error: "Mã nhân sự không hợp lệ" };
  if (!password.success) return { ok: false, error: password.error.issues[0]?.message ?? "Mật khẩu không hợp lệ" };
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Máy chủ chưa cấu hình khóa quản trị (SUPABASE_SERVICE_ROLE_KEY)." };
  }
  // Chỉ người cùng doanh nghiệp
  const { data: target } = await admin.from("profiles").select("id, email").eq("id", userId.data).eq("org_id", ctx.org_id).maybeSingle();
  if (!target) return { ok: false, error: "Không tìm thấy nhân sự." };
  const { error } = await admin.auth.admin.updateUserById(userId.data, { password: password.data });
  if (error) return { ok: false, error: "Không đặt lại được mật khẩu: " + error.message };
  await admin.from("audit_logs").insert({
    org_id: ctx.org_id, actor_id: ctx.user_id, action: "user.password_reset", entity_type: "profile", entity_id: userId.data, details: {},
  });
  return { ok: true, message: `Đã đặt mật khẩu mới cho ${target.email}.` };
}
