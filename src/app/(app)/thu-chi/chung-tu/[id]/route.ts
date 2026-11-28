import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inlineMime } from "@/lib/voucher-files";

export const runtime = "nodejs";

// Tải / xem chứng từ thu chi. Quyền kiểm tra ngay ở CSDL (RLS + hàm get_finance_file); người ngoài phạm vi nhận 404 như tệp không tồn tại.
// ?xem=1 mở trực tiếp PDF / ảnh trong trình duyệt; mọi loại khác luôn tải xuống.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Không tìm thấy", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  if (!ctx) return new NextResponse("Chưa đăng nhập", { status: 401 });
  const { data, error } = await supabase.rpc("get_finance_file", { p_id: id });
  if (error || !data) return new NextResponse("Không tìm thấy", { status: 404 });
  const d = data as { name: string; mime: string; content: string };
  const body = Buffer.from(d.content, "base64");
  const inline = req.nextUrl.searchParams.get("xem") === "1" ? inlineMime(d.name) : null;
  return new NextResponse(body, {
    headers: {
      "Content-Type": inline ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
