"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_NAME, type PublicEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/** Client trình duyệt (dùng cho Realtime). Cấu hình nhận từ máy chủ lúc chạy. */
export function getSupabaseBrowserClient(env: PublicEnv) {
  if (!client) {
    const url = env.supabaseUrl.startsWith("/") ? `${window.location.origin}${env.supabaseUrl}` : env.supabaseUrl;
    client = createBrowserClient(url, env.supabaseAnonKey, {
      cookieOptions: { name: AUTH_COOKIE_NAME, sameSite: "lax", secure: window.location.protocol === "https:" },
    });
  }
  return client;
}
