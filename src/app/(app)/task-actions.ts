"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const uuid = z.guid("Mã không hợp lệ");

function done(message: string, paths: string[]): ActionResult {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

const progressSchema = z.object({
  task_id: uuid,
  progress: z.coerce.number().int("Tiến độ là số nguyên").min(0).max(100, "Tiến độ tối đa 100%"),
  note: z.string().max(2000).optional().default(""),
  blocker: z.string().max(2000).optional().default(""),
});

/** Người phụ trách cập nhật nhanh tiến độ (và vướng mắc). */
export async function updateProgressAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = progressSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_task_progress", {
    p_task_id: parsed.data.task_id,
    p_progress: parsed.data.progress,
    p_note: parsed.data.note || null,
    p_blocker: parsed.data.blocker || null,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  return done(data === "in_review" ? "Đã báo 100% — công việc chuyển sang Chờ duyệt." : "Đã cập nhật tiến độ.", ["/", "/viec-cua-toi", "/du-an"]);
}

const createTaskSchema = z.object({
  project_id: uuid,
  title: z.string().trim().min(1, "Nhập tên công việc").max(300),
  assignee_id: uuid,
  description: z.string().max(5000).optional().default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: z.string().optional().default(""),
  weight: z.coerce.number().positive("Trọng số phải lớn hơn 0").max(1000).default(1),
});

export async function createTaskAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_task", {
    p_project_id: d.project_id,
    p_title: d.title,
    p_assignee_id: d.assignee_id,
    p_description: d.description || null,
    p_priority: d.priority,
    p_due_date: d.due_date || null,
    p_weight: d.weight,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  return done(`Đã giao việc “${d.title}”.`, [`/du-an/${d.project_id}`, "/du-an", "/"]);
}

const reviewSchema = z.object({
  task_id: uuid,
  project_id: uuid,
  decision: z.enum(["approve", "return"]),
  reason: z.string().max(2000).optional().default(""),
  progress: z.coerce.number().int().min(0).max(99).optional(),
});

/** Quản lý duyệt hoặc trả lại công việc đang chờ duyệt. */
export async function reviewTaskAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (d.decision === "approve") {
    const { error } = await supabase.rpc("approve_task", { p_task_id: d.task_id, p_note: d.reason || null });
    if (error) return { ok: false, error: toUserMessage(error) };
    return done("Đã duyệt — công việc Hoàn tất.", [`/du-an/${d.project_id}`, "/du-an", "/"]);
  }
  if (!d.reason.trim()) return { ok: false, error: "Cần nhập lý do trả lại." };
  const { error } = await supabase.rpc("return_task", { p_task_id: d.task_id, p_reason: d.reason, p_progress: d.progress ?? 90 });
  if (error) return { ok: false, error: toUserMessage(error) };
  return done("Đã trả lại công việc kèm lý do.", [`/du-an/${d.project_id}`, "/du-an", "/"]);
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên dự án").max(200),
  description: z.string().max(5000).optional().default(""),
  start_date: z.string().optional().default(""),
  due_date: z.string().optional().default(""),
});

export async function createProjectAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const parsed = createProjectSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;
  if (d.start_date && d.due_date && d.due_date < d.start_date) return { ok: false, error: "Hạn dự án phải sau ngày bắt đầu." };
  const members = fd.getAll("member_ids").map(String).filter((x) => uuid.safeParse(x).success);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_project", {
    p_name: d.name,
    p_description: d.description || null,
    p_start_date: d.start_date || null,
    p_due_date: d.due_date || null,
    p_manager_id: null,
    p_department_id: null,
    p_member_ids: members,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/du-an");
  return { ok: true, data: data as string, message: `Đã tạo dự án “${d.name}”.` };
}

export async function addMembersAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const projectId = String(fd.get("project_id") ?? "");
  const ids = fd.getAll("user_ids").map(String).filter((x) => uuid.safeParse(x).success);
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Mã dự án không hợp lệ" };
  if (ids.length === 0) return { ok: false, error: "Chọn ít nhất một nhân sự." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_project_members", { p_project_id: projectId, p_user_ids: ids });
  if (error) return { ok: false, error: toUserMessage(error) };
  return done("Đã thêm thành viên.", [`/du-an/${projectId}`]);
}
