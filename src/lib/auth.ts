import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, MyContext } from "@/lib/types";

/**
 * Ngữ cảnh người dùng hiện tại (vai trò, quyền, ngày theo múi giờ doanh nghiệp). Chuyển về đăng nhập nếu chưa có.
 * Không gọi thêm auth.getUser() ở đây: middleware đã xác minh phiên với máy chủ Auth cho mỗi yêu cầu, và
 * PostgREST tự kiểm tra chữ ký JWT khi chạy get_my_context (token giả/hết hạn → lỗi hoặc null → về trang đăng nhập).
 * Bớt được một lượt gọi mạng cho mỗi trang.
 */
export const requireContext = cache(async (): Promise<MyContext> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_context");
  if (error) {
    if (/jwt|401|PGRST30/i.test(`${error.code} ${error.message}`)) redirect("/dang-nhap");
    throw new Error(`Không tải được thông tin người dùng: ${error.message}`);
  }
  if (!data) redirect("/dang-nhap");
  if (!data || !(data as MyContext).is_active) redirect("/dang-nhap?loi=khong-hoat-dong");
  return data as MyContext;
});

export function hasRole(ctx: MyContext, role: AppRole) {
  return ctx.roles.includes(role);
}

export function can(ctx: MyContext, permission: string) {
  return ctx.permissions.includes(permission);
}
