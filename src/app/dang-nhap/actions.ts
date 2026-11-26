"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
  next: z.string().optional(),
});

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return { ok: false, error: "Email hoặc mật khẩu không đúng." };
    if (/fetch failed|ECONNREFUSED/i.test(error.message)) return { ok: false, error: "Không kết nối được máy chủ đăng nhập." };
    return { ok: false, error: "Không đăng nhập được: " + error.message };
  }
  const next = parsed.data.next;
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/dang-nhap");
}
