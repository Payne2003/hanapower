import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Tải tài liệu hồ sơ. Quyền kiểm tra ngay ở hàm CSDL get_user_document (chính chủ hoặc quản trị / nhân sự);
// người ngoài phạm vi nhận 404 như tệp không tồn tại (không lộ sự tồn tại).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Không tìm thấy", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  if (!ctx) return new NextResponse("Chưa đăng nhập", { status: 401 });
  const { data, error } = await supabase.rpc("get_user_document", { p_id: id });
  if (error || !data) return new NextResponse("Không tìm thấy", { status: 404 });
  const d = data as { name: string; mime: string; content: string };
  const body = Buffer.from(d.content, "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": d.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
