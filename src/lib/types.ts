export type AppRole = "system_admin" | "department_manager" | "project_manager" | "employee";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type ReportStatus = "draft" | "submitted";

export type MyContext = {
  user_id: string;
  org_id: string;
  org_name: string;
  timezone: string;
  full_name: string;
  email: string;
  department_id: string | null;
  is_active: boolean;
  roles: AppRole[];
  permissions: string[];
  today: string; // YYYY-MM-DD theo múi giờ doanh nghiệp
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department_id: string | null;
  is_active: boolean;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  manager_id: string;
  department_id: string | null;
  start_date: string;
  due_date: string | null;
  status: ProjectStatus;
};

export type ProjectStats = {
  project_id: string;
  progress: number | null;
  total_tasks: number;
  done_tasks: number;
  review_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  progress: number;
  weight: number;
  is_blocked: boolean;
  blocker_note: string | null;
  return_reason: string | null;
  updated_at: string;
};

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
