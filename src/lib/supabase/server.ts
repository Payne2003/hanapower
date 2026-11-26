import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, getPublicEnv, getServerSupabaseUrl, getServiceRoleKey } from "@/lib/env";

/** Client dùng danh tính người dùng hiện tại (RLS áp dụng). Dùng cho mọi thao tác thông thường. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseAnonKey } = getPublicEnv();
  return createServerClient(getServerSupabaseUrl(), supabaseAnonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Gọi từ Server Component: không ghi được cookie, middleware sẽ làm mới phiên.
        }
      },
    },
  });
}

/**
 * Client quyền service_role — CHỈ dùng ở máy chủ cho thao tác quản trị tài khoản
 * (tạo/khóa người dùng trong Auth), sau khi đã kiểm tra quyền của người gọi.
 */
export function createSupabaseAdminClient() {
  const key = getServiceRoleKey();
  if (!key) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY ở máy chủ.");
  return createClient(getServerSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
