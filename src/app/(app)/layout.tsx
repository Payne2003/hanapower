import { AppNav, type NavGroup, type NavItem } from "@/components/app-nav";
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

  const crm = can(ctx, "crm.view");
  const staff = !hasRole(ctx, "collaborator");
  const groups: NavGroup[] = [];
  if (!staff) {
    groups.push({ items: [
      { href: "/", label: "Việc của tôi", icon: "work" },
      { href: "/thong-bao", label: "Thông báo", icon: "bell", badge: unread ?? undefined },
    ] });
  } else {
    groups.push({ items: [{ href: "/", label: "Tổng quan", icon: "dashboard" }, { href: "/cong-viec", label: "Công việc", icon: "task" }] });
    groups.push({ label: "Sản xuất video", items: [
      { href: "/video", label: "Video", icon: "videos" }, { href: "/bao-cao", label: "Báo cáo", icon: "reports" },
      { href: "/du-an", label: "Dự án", icon: "project" },
      ...(can(ctx, "freelancers.manage") || can(ctx, "projects.create") ? [{ href: "/cong-tac-vien", label: "Cộng tác viên", icon: "freelancer" as const }] : []),
    ] });
    if (crm) {
      groups.push({ label: "Bán hàng (CRM)", items: [
        { href: "/lead", label: "Lead", icon: "lead" }, { href: "/tai-khoan", label: "Tài khoản", icon: "account" }, { href: "/lien-he", label: "Liên hệ", icon: "contact" },
        { href: "/co-hoi", label: "Cơ hội", icon: "opportunity" }, { href: "/bao-gia", label: "Báo giá", icon: "quote" },
        { href: "/hop-dong", label: "Hợp đồng", icon: "contract" }, { href: "/don-hang", label: "Đơn hàng", icon: "order" },
        { href: "/bao-cao-ban-hang", label: "Báo cáo bán hàng", icon: "chart" },
      ] });
      groups.push({ label: "Sản phẩm", items: [
        { href: "/san-pham", label: "Sản phẩm / dịch vụ", icon: "product" }, { href: "/danh-muc", label: "Danh mục", icon: "category" },
        { href: "/don-vi", label: "Đơn vị tính", icon: "unit" }, { href: "/bang-gia", label: "Bảng giá", icon: "pricebook" },
        { href: "/nguon-lead", label: "Nguồn lead", icon: "source" }, { href: "/nganh-nghe", label: "Ngành nghề", icon: "industry" },
      ] });
    }
    groups.push({ label: "Tài chính", items: [{ href: "/thu-chi", label: "Thu chi & công nợ", icon: "finance" }] });
    const hr: NavItem[] = [{ href: "/cham-cong", label: "Chấm công", icon: "attendance" }, { href: "/luong", label: "Bảng lương", icon: "payroll" }];
    hr.unshift({ href: "/nhan-su", label: "Nhân viên", icon: "people" });
    hr.push({ href: "/phong-ban", label: "Phòng ban", icon: "department" }, { href: "/chuc-vu", label: "Chức vụ", icon: "position" });
    groups.push({ label: "Nhân sự", items: hr });
    groups.push({ label: "Hệ thống", items: [
      { href: "/thong-bao", label: "Thông báo", icon: "bell", badge: unread ?? undefined }, { href: "/tro-chuyen", label: "Trò chuyện", icon: "chat" },
      { href: "/cai-dat", label: "Cài đặt", icon: "settings" },
    ] });
  }

  const roleLabel = ctx.roles.map((r) => ROLE_LABEL[r]).join(", ");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav searchable={staff} groups={groups} orgName={ctx.org_name} userName={ctx.full_name} userId={ctx.user_id} avatarVersion={ctx.avatar_updated_at ?? null} roleLabel={roleLabel} logoutAction={signOut} />
      <main id="noi-dung" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
