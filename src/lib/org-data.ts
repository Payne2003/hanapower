import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export type Member = { id: string; full_name: string; email: string; job_title: string | null; phone: string | null; department_id: string | null; roles: AppRole[]; positions: Record<string, string | null> };
export type Dept = { id: string; name: string; manager_id: string | null };

/** Nhân viên đang hoạt động (không gồm cộng tác viên) kèm vai trò và chức vụ theo từng phòng ban. */
export async function getOrgStructure() {
  const supabase = await createSupabaseServerClient();
  const [d, p, r, u, pos] = await Promise.all([
    supabase.from("departments").select("id, name, manager_id").order("name"),
    supabase.from("profiles").select("id, full_name, email, job_title, phone, department_id").eq("is_active", true).order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("user_departments_positions").select("user_id, department_id, position_id"),
    supabase.from("positions").select("id, name").is("deleted_at", null).order("name"),
  ]);
  for (const x of [d, p, r, u, pos]) if (x.error) throw new Error(`Không tải được cơ cấu tổ chức: ${x.error.message}`);
  const roles = new Map<string, AppRole[]>();
  for (const x of r.data ?? []) roles.set(x.user_id as string, [...(roles.get(x.user_id as string) ?? []), x.role as AppRole]);
  const posName = new Map((pos.data ?? []).map((x) => [x.id as string, x.name as string]));
  const positions = new Map<string, Record<string, string | null>>();
  const links = new Map<string, Set<string>>(); // phòng ban → người dùng (qua bảng chức vụ)
  for (const x of u.data ?? []) {
    const m = positions.get(x.user_id as string) ?? {};
    m[x.department_id as string] = x.position_id ? posName.get(x.position_id as string) ?? null : null;
    positions.set(x.user_id as string, m);
    links.set(x.department_id as string, (links.get(x.department_id as string) ?? new Set()).add(x.user_id as string));
  }
  const staff: Member[] = (p.data ?? [])
    .map((x) => ({ ...(x as Omit<Member, "roles" | "positions">), roles: roles.get(x.id as string) ?? [], positions: positions.get(x.id as string) ?? {} }))
    .filter((x) => !x.roles.includes("collaborator"));
  const membersOf = (deptId: string): Member[] => staff.filter((s) => s.department_id === deptId || links.get(deptId)?.has(s.id));
  return { departments: (d.data ?? []) as Dept[], staff, positions: (pos.data ?? []).map((x) => [x.id as string, x.name as string] as [string, string]), membersOf };
}
