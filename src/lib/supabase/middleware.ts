import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, cookieSecure, getPublicEnv, getServerSupabaseUrl } from "@/lib/env";

const PUBLIC_PATHS = ["/dang-nhap", "/khoi-tao", "/offline", "/manifest.webmanifest", "/sw.js", "/icons"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { supabaseAnonKey } = getPublicEnv();
  const supabase = createServerClient(getServerSupabaseUrl(), supabaseAnonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME, sameSite: "lax", secure: cookieSecure() },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() xác minh token với máy chủ Auth (không chỉ đọc cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/dang-nhap";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (user && path === "/dang-nhap") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
