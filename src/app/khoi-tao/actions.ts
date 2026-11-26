"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  org: z.string().trim().min(1, "Nhập tên doanh nghiệp").max(200),
  full_name: z.string().trim().min(1, "Nhập họ tên").max(120),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72),
  confirm: z.string(),
});

/** Hệ thống còn trống (chưa có doanh nghiệp nào)? */
export async function isSystemEmpty(): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { count, error } = await admin.from("organizations").select("id", { count: "exact", head: true });
    return !error && (count ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Khởi tạo lần đầu: tạo doanh nghiệp + tài khoản quản trị đầu tiên.
 * Chỉ chạy được khi CHƯA có doanh nghiệp nào; sau đó trang này tự đóng lại.
 */
export async function bootstrapAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = schema.safeParse(Object.fromEntries(fd));
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  if (s.data.password !== s.data.confirm) return { ok: false, error: "Mật khẩu nhập lại không khớp." };
  if (!(await isSystemEmpty())) return { ok: false, error: "Hệ thống đã được khởi tạo. Hãy đăng nhập." };

  const admin = createSupabaseAdminClient();
  const { data: created, error: aErr } = await admin.auth.admin.createUser({
    email: s.data.email, password: s.data.password, email_confirm: true, user_metadata: { full_name: s.data.full_name },
  });
  if (aErr || !created.user) return { ok: false, error: "Không tạo được tài khoản: " + (aErr?.message ?? "") };
  const uid = created.user.id;
  const fail = async (msg: string) => {
    await admin.auth.admin.deleteUser(uid);
    return { ok: false as const, error: msg };
  };
  const { data: org, error: oErr } = await admin.from("organizations").insert({ name: s.data.org }).select("id").single();
  if (oErr || !org) return fail("Không tạo được doanh nghiệp: " + oErr?.message);
  // Chặn trường hợp hai người khởi tạo cùng lúc: chỉ giữ doanh nghiệp đầu tiên.
  const { count } = await admin.from("organizations").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 1) {
    await admin.from("organizations").delete().eq("id", org.id);
    return fail("Hệ thống vừa được người khác khởi tạo. Hãy đăng nhập.");
  }
  const orgId = org.id as string;
  const { error: pErr } = await admin.from("profiles").insert({ id: uid, org_id: orgId, full_name: s.data.full_name, email: s.data.email, job_title: "Quản trị hệ thống" });
  if (pErr) return fail("Không tạo được hồ sơ: " + pErr.message);
  await admin.from("user_roles").insert([
    { org_id: orgId, user_id: uid, role: "system_admin" },
    { org_id: orgId, user_id: uid, role: "manager" },
  ]);
  await admin.from("departments").insert([
    { org_id: orgId, name: "Bộ phận Content" },
    { org_id: orgId, name: "Bộ phận Edit" },
  ]);
  await admin.from("audit_logs").insert({ org_id: orgId, actor_id: uid, action: "org.bootstrap", entity_type: "organization", entity_id: orgId, details: { email: s.data.email } });

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email: s.data.email, password: s.data.password });
  redirect("/");
}
