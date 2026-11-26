// Cấu hình đọc lúc chạy (runtime), để CÙNG một bản build dùng được cho cloud và tại văn phòng.
// Không dùng NEXT_PUBLIC_* cho địa chỉ Supabase vì chúng bị "đóng băng" lúc build.

export type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function first(...values: (string | undefined)[]) {
  return values.find((v) => v && v.trim().length > 0)?.trim();
}

/** Địa chỉ Supabase mà TRÌNH DUYỆT dùng. Có thể là "same-origin" (gateway LAN định tuyến /auth, /rest...). */
export function getPublicEnv(): PublicEnv {
  const supabaseUrl = first(process.env.SUPABASE_PUBLIC_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = first(process.env.SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Thiếu SUPABASE_PUBLIC_URL / SUPABASE_ANON_KEY. Xem .env.example.");
  }
  return { supabaseUrl, supabaseAnonKey };
}

/** Địa chỉ Supabase mà MÁY CHỦ Next.js dùng (có thể là địa chỉ nội bộ Docker). */
export function getServerSupabaseUrl(): string {
  return first(process.env.SUPABASE_INTERNAL_URL) ?? getPublicEnv().supabaseUrl;
}

export function getServiceRoleKey(): string | undefined {
  return first(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Tên cookie phiên cố định: không phụ thuộc tên miền Supabase (nội bộ/công khai khác nhau vẫn dùng chung phiên). */
export const AUTH_COOKIE_NAME = "sb-hanapower-auth-token";
