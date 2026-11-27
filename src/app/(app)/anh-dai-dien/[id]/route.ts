import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Ảnh đại diện. Chỉ người đã đăng nhập; quyền theo RLS của user_avatars (cộng tác viên chỉ thấy ảnh của mình). Không có ảnh → 404 (giao diện dùng chữ cái đầu).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Không tìm thấy", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  if (!ctx) return new NextResponse("Chưa đăng nhập", { status: 401 });
  const { data, error } = await supabase.rpc("get_avatar", { p_user: id });
  const a = data as { mime: string; content: string } | null;
  if (error || !a) return new NextResponse("Không có ảnh", { status: 404 });
  const body = Buffer.from(a.content, "base64");
  return new NextResponse(body, {
    headers: { "Content-Type": a.mime, "Content-Length": String(body.length), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
