import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireContext, can, hasRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleEditor } from "@/components/role-editor";
import { AccountCreateForm, PasswordResetForm } from "@/components/account-forms";
import { Disclosure } from "@/components/disclosure";
import { PageHeader, Avatar } from "@/components/ui/page-header";
import { UserPlus } from "lucide-react";
import { ROLE_LABEL } from "@/lib/labels";
import type { AppRole } from "@/lib/types";

export const metadata: Metadata = { title: "Nhân sự" };

export default async function PeoplePage() {
  const ctx = await requireContext();
  const isAdmin = can(ctx, "users.manage");
  if (!isAdmin && !hasRole(ctx, "manager")) redirect("/");
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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="Nhân sự"
        description={`${(profiles.data ?? []).length} người · ${isAdmin ? "Quản lý tài khoản, vai trò và mật khẩu. Mọi thay đổi quyền được ghi nhật ký." : "Danh sách nhân sự trong doanh nghiệp."}`}
      />
      {isAdmin ? (
        <Disclosure summary="Tạo tài khoản nhân viên" icon={<UserPlus className="size-4" aria-hidden />}>
          <AccountCreateForm departments={(departments.data ?? []).map((d) => ({ id: d.id as string, name: d.name as string }))} />
        </Disclosure>
      ) : null}
      <ul className="grid gap-3">
        {(profiles.data ?? []).map((p) => (
          <li key={p.id}>
            <Card className={!p.is_active ? "opacity-70" : undefined}>
              <CardContent className="flex flex-col gap-4 pt-5 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={p.full_name} className="size-10 text-sm" />
                  <div className="min-w-0">
                  <p className="font-medium">
                    {p.full_name} {!p.is_active ? <Badge className="ml-1 bg-neutral-100 text-neutral-600 ring-neutral-300">Đã khóa</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.email} · {p.job_title ?? "—"} · {p.department_id ? deptName.get(p.department_id) : "Chưa có phòng ban"}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {(roleMap.get(p.id) ?? []).map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}
                  </p>
                  </div>
                </div>
                {isAdmin ? (
                  <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3 md:max-w-md">
                    <RoleEditor userId={p.id} roles={roleMap.get(p.id) ?? []} active={p.is_active} self={p.id === ctx.user_id} />
                    <PasswordResetForm userId={p.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
