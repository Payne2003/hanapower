import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, MyContext } from "@/lib/types";

/** Ngữ cảnh người dùng hiện tại (vai trò, quyền, ngày theo múi giờ doanh nghiệp). Chuyển về đăng nhập nếu chưa có. */
export const requireContext = cache(async (): Promise<MyContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dang-nhap");
  const { data, error } = await supabase.rpc("get_my_context");
  if (error) throw new Error(`Không tải được thông tin người dùng: ${error.message}`);
  if (!data || !(data as MyContext).is_active) redirect("/dang-nhap?loi=khong-hoat-dong");
  return data as MyContext;
});

export function hasRole(ctx: MyContext, role: AppRole) {
  return ctx.roles.includes(role);
}

export function can(ctx: MyContext, permission: string) {
  return ctx.permissions.includes(permission);
}
