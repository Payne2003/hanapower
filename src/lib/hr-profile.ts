import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth";
import { getDocTypes, getRequests, type DocRequest, type DocType } from "@/lib/hr-docs";
import type { AppRole, MyContext } from "@/lib/types";

export type Profile = {
  id: string; code: string; name: string; email: string; active: boolean; job_title: string | null; phone: string | null;
  status: string; work_form: string; type: string; joined_on: string | null; resigned_on: string | null; avatar: string | null;
};
export type ProfileTask = { id: string; title: string; task_type: string; status: string; priority: string; scheduled_at: string | null; remind_before_minutes: number | null; video_id: string | null; assignees: number };
export type PayLine = { id: string; period_id: string; year: number; month: number; status: string; worked_days: number; net_pay: number; tax: number; insurance: number };

export type ProfileData = {
  profile: Profile;
  roles: AppRole[];
  assignments: { dept_id: string; dept: string; is_manager: boolean; manager_position: string | null; positions: { id: string; name: string }[] }[];
  emails: { id: string; email: string; is_primary: boolean }[];
  phones: { id: string; country_code: string; phone: string; is_primary: boolean }[];
  personal: { date_of_birth: string | null; gender: string | null; address: string | null; id_number: string | null; tax_code: string | null } | null;
  documents: { id: string; name: string; mime: string; size_bytes: number; created_at: string }[];
  requests: DocRequest[];
  docTypes: DocType[];
  tasks: ProfileTask[];
  salary: { base_salary: number; insurance_base: number | null; bank_name: string | null; account_tail: string | null; account_name: string | null } | null;
  payLines: PayLine[];
  attendance: Record<string, number>;
  audit: { id: number; action: string; created_at: string; actor_id: string | null }[];
  actors: Map<string, string>;
  perms: { self: boolean; staffAdmin: boolean; admin: boolean; payroll: boolean; audit: boolean };
};

type Rel<T> = T | T[] | null;
const one = <T,>(x: Rel<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x);

/** Hồ sơ đầy đủ của một nhân viên. Mỗi truy vấn đi qua RLS nên phần người xem không được phép thấy sẽ rỗng; cờ perms chỉ quyết định hiển thị mục. */
export async function getProfile(ctx: MyContext, id: string): Promise<ProfileData | null> {
  const supabase = await createSupabaseServerClient();
  const self = ctx.user_id === id;
  const staffAdmin = can(ctx, "staff.manage") || can(ctx, "users.manage");
  const priv = self || staffAdmin;
  const payroll = self || can(ctx, "payroll.view");
  const month = ctx.today.slice(0, 7);
  const { data: p } = await supabase.from("profiles").select("id, employee_code, full_name, email, is_active, job_title, phone, employment_status, work_form, employment_type, joined_on, resigned_on, avatar_updated_at").eq("id", id).maybeSingle();
  if (!p) return null;
  const [roles, udp, dm, poss, depts, emails, phones, personal, docs, asg, salary, lines, att, audit] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", id),
    supabase.from("user_departments_positions").select("department_id, position_id, sort_order").eq("user_id", id).order("sort_order"),
    supabase.from("department_managers").select("department_id, position_id").eq("user_id", id),
    supabase.from("positions").select("id, name"),
    supabase.from("departments").select("id, name"),
    priv ? supabase.from("user_emails").select("id, email, is_primary").eq("user_id", id).order("is_primary", { ascending: false }).order("created_at") : Promise.resolve({ data: [] }),
    priv ? supabase.from("user_phones").select("id, country_code, phone, is_primary").eq("user_id", id).order("is_primary", { ascending: false }).order("created_at") : Promise.resolve({ data: [] }),
    priv ? supabase.from("staff_personal").select("date_of_birth, gender, address, id_number, tax_code").eq("user_id", id).maybeSingle() : Promise.resolve({ data: null }),
    priv ? supabase.from("user_documents").select("id, name, mime, size_bytes, created_at").eq("user_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("task_assignees").select("task_id").eq("user_id", id).limit(300),
    payroll ? supabase.from("salary_profiles").select("base_salary, insurance_base, bank_name, account_no, account_name").eq("user_id", id).maybeSingle() : Promise.resolve({ data: null }),
    payroll ? supabase.from("payroll_lines").select("id, period_id, worked_days, net_pay, tax, insurance, payroll_periods(year, month, status)").eq("user_id", id).limit(40) : Promise.resolve({ data: [] }),
    payroll ? supabase.from("attendance_records").select("status").eq("user_id", id).gte("work_date", `${month}-01`).lte("work_date", `${month}-31`) : Promise.resolve({ data: [] }),
    can(ctx, "audit.view") ? supabase.from("audit_logs").select("id, action, created_at, actor_id").or(`entity_id.eq.${id},details->>user.eq.${id}`).order("id", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
  ]);

  const [requests, docTypes] = await Promise.all([priv ? getRequests(id) : Promise.resolve([] as DocRequest[]), staffAdmin ? getDocTypes() : Promise.resolve([] as DocType[])]);
  const posName = new Map((poss.data ?? []).map((x) => [x.id as string, x.name as string]));
  const deptName = new Map((depts.data ?? []).map((x) => [x.id as string, x.name as string]));
  const mgr = new Map((dm.data ?? []).map((x) => [x.department_id as string, x.position_id ? posName.get(x.position_id as string) ?? null : null]));
  const byDept = new Map<string, { id: string; name: string }[]>();
  for (const x of udp.data ?? []) {
    const k = x.department_id as string;
    const list = byDept.get(k) ?? [];
    if (x.position_id) list.push({ id: x.position_id as string, name: posName.get(x.position_id as string) ?? "—" });
    byDept.set(k, list);
  }
  const assignments = [...byDept].map(([dept_id, positions]) => ({ dept_id, dept: deptName.get(dept_id) ?? "—", is_manager: mgr.has(dept_id), manager_position: mgr.get(dept_id) ?? null, positions }))
    .sort((a, b) => a.dept.localeCompare(b.dept, "vi"));

  // Công việc theo task_assignees: mỗi task một dòng dù nhiều người được giao
  const taskIds = [...new Set((asg.data ?? []).map((x) => x.task_id as string))];
  const tasks: ProfileTask[] = [];
  for (let i = 0; i < taskIds.length; i += 80) {
    const { data } = await supabase.from("tasks").select("id, title, task_type, status, priority, scheduled_at, remind_before_minutes, video_id, task_assignees(user_id)").is("deleted_at", null).in("id", taskIds.slice(i, i + 80));
    for (const t of data ?? []) tasks.push({ ...(t as unknown as ProfileTask), assignees: ((t as unknown as { task_assignees: unknown[] }).task_assignees ?? []).length });
  }
  tasks.sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") || a.title.localeCompare(b.title, "vi"));

  const payLines: PayLine[] = (lines.data ?? []).map((l) => {
    const pp = one((l as unknown as { payroll_periods: Rel<{ year: number; month: number; status: string }> }).payroll_periods);
    return { id: l.id as string, period_id: l.period_id as string, year: pp?.year ?? 0, month: pp?.month ?? 0, status: pp?.status ?? "", worked_days: Number(l.worked_days), net_pay: Number(l.net_pay), tax: Number(l.tax), insurance: Number(l.insurance) };
  }).sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 6);
  const attendance: Record<string, number> = {};
  for (const r of att.data ?? []) attendance[r.status as string] = (attendance[r.status as string] ?? 0) + 1;
  const sp = salary.data as { base_salary: number; insurance_base: number | null; bank_name: string | null; account_no: string | null; account_name: string | null } | null;
  const auditRows = (audit.data ?? []) as { id: number; action: string; created_at: string; actor_id: string | null }[];
  const actorIds = [...new Set(auditRows.map((a) => a.actor_id).filter((x): x is string => !!x))];
  const actors = new Map<string, string>();
  if (actorIds.length) for (const a of (await supabase.from("profiles").select("id, full_name").in("id", actorIds)).data ?? []) actors.set(a.id as string, a.full_name as string);

  return {
    profile: { id: p.id as string, code: p.employee_code as string, name: p.full_name as string, email: p.email as string, active: p.is_active as boolean, job_title: p.job_title as string | null, phone: p.phone as string | null,
      status: p.employment_status as string, work_form: p.work_form as string, type: p.employment_type as string, joined_on: p.joined_on as string | null, resigned_on: p.resigned_on as string | null, avatar: p.avatar_updated_at as string | null },
    roles: (roles.data ?? []).map((r) => r.role as AppRole),
    assignments,
    emails: (emails.data ?? []) as ProfileData["emails"],
    phones: (phones.data ?? []) as ProfileData["phones"],
    personal: (personal.data ?? null) as ProfileData["personal"],
    documents: ((docs.data ?? []) as ProfileData["documents"]),
    requests, docTypes: docTypes.filter((t) => t.is_active),
    tasks, payLines, attendance,
    salary: sp ? { base_salary: Number(sp.base_salary), insurance_base: sp.insurance_base === null ? null : Number(sp.insurance_base), bank_name: sp.bank_name, account_tail: sp.account_no ? sp.account_no.slice(-4) : null, account_name: sp.account_name } : null,
    audit: auditRows, actors,
    perms: { self, staffAdmin, admin: can(ctx, "users.manage"), payroll, audit: can(ctx, "audit.view") },
  };
}
