import { AppNav, type NavItem } from "@/components/app-nav";
import { requireContext, can, hasRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../dang-nhap/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  // Chạy song song: ngữ cảnh người dùng và số thông báo chưa đọc
  const [ctx, { count: unread }] = await Promise.all([
    requireContext(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  const items: NavItem[] = [
    { href: "/", label: "Tổng quan", icon: "dashboard" },
    { href: "/video", label: "Video", icon: "videos" },
    { href: "/bao-cao", label: "Báo cáo", icon: "reports" },
    { href: "/thong-bao", label: "Thông báo", icon: "bell", badge: unread ?? undefined },
    { href: "/tro-chuyen", label: "Trò chuyện", icon: "chat" },
  ];
  // Hiển thị theo quyền
  if (can(ctx, "users.manage") || hasRole(ctx, "manager")) items.push({ href: "/nhan-su", label: "Nhân sự", icon: "people" });
  items.push({ href: "/cai-dat", label: "Cài đặt", icon: "settings" });

  const roleLabel = ctx.roles.map((r) => ROLE_LABEL[r]).join(", ");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav items={items} orgName={ctx.org_name} userName={ctx.full_name} roleLabel={roleLabel} logoutAction={signOut} />
      <main id="noi-dung" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
