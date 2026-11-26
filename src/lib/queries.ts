import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, Project, ProjectStats, Task } from "@/lib/types";

const TASK_COLS =
  "id, project_id, title, description, assignee_id, priority, status, due_date, progress, weight, is_blocked, blocker_note, return_reason, updated_at";

/** Kết quả danh sách: lỗi → ném; null → mảng rỗng. */
function must<T>(res: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new Error(`Không tải được ${what}: ${res.error.message}`);
  return res.data ?? [];
}

/** Kết quả một bản ghi (maybeSingle): lỗi → ném; không có/không có quyền → null. */
function one<T>(res: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (res.error) throw new Error(`Không tải được ${what}: ${res.error.message}`);
  return res.data ?? null;
}

export async function getProfilesMap() {
  const supabase = await createSupabaseServerClient();
  const rows = must<Profile>(
    await supabase.from("profiles").select("id, full_name, email, job_title, department_id, is_active").order("full_name"),
    "nhân sự",
  );
  return new Map(rows.map((p) => [p.id, p]));
}

export async function getMyTasks(userId: string) {
  const supabase = await createSupabaseServerClient();
  return must<Task>(
    await supabase
      .from("tasks")
      .select(TASK_COLS)
      .eq("assignee_id", userId)
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false }),
    "công việc",
  );
}

export async function getProjects() {
  const supabase = await createSupabaseServerClient();
  const [projects, stats] = await Promise.all([
    supabase.from("projects").select("id, name, description, manager_id, department_id, start_date, due_date, status").order("created_at", { ascending: false }),
    supabase.from("project_stats").select("project_id, progress, total_tasks, done_tasks, review_tasks, blocked_tasks, overdue_tasks"),
  ]);
  const p = must<Project>(projects, "dự án");
  const s = must<ProjectStats>(stats, "tiến độ dự án");
  const byId = new Map(s.map((x) => [x.project_id, { ...x, progress: x.progress === null ? null : Number(x.progress) }]));
  return p.map((proj) => ({ ...proj, stats: byId.get(proj.id) ?? null }));
}

export async function getProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const [project, stats, tasks, members] = await Promise.all([
    supabase.from("projects").select("id, name, description, manager_id, department_id, start_date, due_date, status").eq("id", id).maybeSingle(),
    supabase.from("project_stats").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("tasks").select(TASK_COLS).eq("project_id", id).order("created_at"),
    supabase.from("project_members").select("user_id, member_role").eq("project_id", id),
  ]);
  const proj = one<Project>(project, "dự án");
  if (!proj) return null;
  const st = one<ProjectStats>(stats, "tiến độ");
  return {
    project: proj,
    stats: st ? { ...st, progress: st.progress === null ? null : Number(st.progress) } : null,
    tasks: must<Task>(tasks, "công việc").map((t) => ({ ...t, weight: Number(t.weight) })),
    members: must<{ user_id: string; member_role: "manager" | "member" }>(members, "thành viên"),
  };
}

/** Việc đang chờ duyệt trong các dự án người dùng quản lý. */
export async function getTasksAwaitingMyApproval(userId: string, isOrgWideManager: boolean) {
  const supabase = await createSupabaseServerClient();
  let projectIds: string[] | null = null;
  if (!isOrgWideManager) {
    const { data: managed } = await supabase.from("project_members").select("project_id").eq("user_id", userId).eq("member_role", "manager");
    projectIds = (managed ?? []).map((m) => m.project_id as string);
    if (projectIds.length === 0) return [];
  }
  let q = supabase.from("tasks").select(TASK_COLS).eq("status", "in_review").order("updated_at");
  if (projectIds) q = q.in("project_id", projectIds);
  return must<Task>(await q, "việc chờ duyệt");
}
