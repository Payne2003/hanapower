import { AppNav, type NavItem } from "@/components/app-nav";
import { requireContext, can, hasRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "../dang-nhap/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const { count: myOpen } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_id", ctx.user_id)
    .in("status", ["todo", "in_progress"]);

  const items: NavItem[] = [
    { href: "/", label: "Tổng quan", icon: "dashboard" },
    { href: "/viec-cua-toi", label: "Việc của tôi", icon: "tasks", badge: myOpen ?? undefined },
    { href: "/du-an", label: "Dự án", icon: "projects" },
    { href: "/bao-cao", label: "Báo cáo", icon: "reports" },
    { href: "/tro-chuyen", label: "Trò chuyện", icon: "chat" },
  ];
  // Hiển thị theo quyền: Nhân sự cho quản trị/quản lý phòng ban.
  if (can(ctx, "users.manage") || hasRole(ctx, "department_manager")) {
    items.push({ href: "/nhan-su", label: "Nhân sự", icon: "people" });
  }
  items.push({ href: "/cai-dat", label: "Cài đặt", icon: "settings" });

  const topRole = (["system_admin", "department_manager", "project_manager", "employee"] as const).find((r) => hasRole(ctx, r));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppNav
        items={items}
        orgName={ctx.org_name}
        userName={ctx.full_name}
        roleLabel={topRole ? ROLE_LABEL[topRole] : ""}
        logoutAction={signOut}
      />
      <main id="noi-dung" className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
    </div>
  );
}
