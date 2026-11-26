import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireContext, can, hasRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleEditor } from "@/components/role-editor";
import { ROLE_LABEL } from "@/lib/labels";
import type { AppRole } from "@/lib/types";

export const metadata: Metadata = { title: "Nhân sự" };

export default async function PeoplePage() {
  const ctx = await requireContext();
  const isAdmin = can(ctx, "users.manage");
  if (!isAdmin && !hasRole(ctx, "department_manager")) redirect("/");
  const supabase = await createSupabaseServerClient();
  const [profiles, roles, departments] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, job_title, department_id, is_active").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("departments").select("id, name, manager_id").order("name"),
  ]);
  const roleMap = new Map<string, AppRole[]>();
  for (const r of roles.data ?? []) roleMap.set(r.user_id as string, [...(roleMap.get(r.user_id as string) ?? []), r.role as AppRole]);
  const deptName = new Map((departments.data ?? []).map((d) => [d.id as string, d.name as string]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Nhân sự</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Quản lý vai trò và trạng thái tài khoản. Mọi thay đổi quyền được ghi nhật ký." : "Danh sách nhân sự trong doanh nghiệp."}
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {(profiles.data ?? []).map((p) => (
          <li key={p.id}>
            <Card>
              <CardContent className="flex flex-col gap-2 pt-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.full_name} {!p.is_active ? <Badge className="ml-1 bg-neutral-100 text-neutral-600 ring-neutral-300">Đã khóa</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.email} · {p.job_title ?? "—"} · {p.department_id ? deptName.get(p.department_id) : "Chưa có phòng ban"}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {(roleMap.get(p.id) ?? []).map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}
                  </p>
                </div>
                {isAdmin ? <RoleEditor userId={p.id} roles={roleMap.get(p.id) ?? []} active={p.is_active} self={p.id === ctx.user_id} /> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
