import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DocRequest = {
  id: string; user_id: string; type_id: string; name: string; instructions: string | null; exts: string[]; max_mb: number;
  is_required: boolean; due_date: string | null; note: string | null; status: "pending" | "submitted" | "approved" | "rejected";
  reject_reason: string | null; submitted_at: string | null; reviewed_at: string | null; reviewer: string | null;
  file: { id: string; name: string; size_bytes: number } | null;
};
export type DocType = { id: string; name: string; instructions: string | null; is_required: boolean; allowed_exts: string[]; max_mb: number; is_active: boolean };

type Rel<T> = T | T[] | null;
const one = <T,>(x: Rel<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x);

/** Yêu cầu tài liệu của một nhân viên (RLS: chỉ chính chủ và quản trị / nhân sự đọc được). */
export async function getRequests(userId: string): Promise<DocRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("document_requests")
    .select("id, user_id, type_id, is_required, due_date, note, status, reject_reason, submitted_at, reviewed_at, reviewed_by, document_types(name, instructions, allowed_exts, max_mb), file:user_documents!document_requests_doc_fk(id, name, size_bytes)")
    .eq("user_id", userId).order("created_at");
  if (error) throw new Error(`Không tải được yêu cầu tài liệu: ${error.message}`);
  const reviewerIds = [...new Set((data ?? []).map((r) => r.reviewed_by as string | null).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (reviewerIds.length) for (const p of (await supabase.from("profiles").select("id, full_name").in("id", reviewerIds)).data ?? []) names.set(p.id as string, p.full_name as string);
  return (data ?? []).map((r) => {
    const t = one((r as unknown as { document_types: Rel<{ name: string; instructions: string | null; allowed_exts: string[]; max_mb: number }> }).document_types);
    return {
      id: r.id as string, user_id: r.user_id as string, type_id: r.type_id as string, name: t?.name ?? "Tài liệu", instructions: t?.instructions ?? null, exts: t?.allowed_exts ?? ["pdf"], max_mb: t?.max_mb ?? 5,
      is_required: r.is_required as boolean, due_date: r.due_date as string | null, note: r.note as string | null, status: r.status as DocRequest["status"], reject_reason: r.reject_reason as string | null,
      submitted_at: r.submitted_at as string | null, reviewed_at: r.reviewed_at as string | null, reviewer: r.reviewed_by ? names.get(r.reviewed_by as string) ?? null : null,
      file: one((r as unknown as { file: Rel<{ id: string; name: string; size_bytes: number }> }).file),
    };
  });
}

export async function getDocTypes(): Promise<DocType[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("document_types").select("id, name, instructions, is_required, allowed_exts, max_mb, is_active").order("name");
  if (error) throw new Error(`Không tải được loại tài liệu: ${error.message}`);
  return (data ?? []) as DocType[];
}

export type DocStatusRow = { id: string; code: string; name: string; depts: string[]; required: number; approved: number; submitted: number; rejected: number; pending: number; state: "complete" | "incomplete" | "none" };
export type DocStatusResult = { total: number; rows: DocStatusRow[]; summary: { total: number; complete: number; incomplete: number; none: number; review: number; rejected: number; missing: number } };

export async function getDocStatus(q: { q?: string; dept?: string; status?: string; page: number; size: number }): Promise<DocStatusResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("doc_status_list", { p_q: q.q || null, p_dept: q.dept ?? null, p_status: q.status ?? null, p_limit: q.size, p_offset: (q.page - 1) * q.size });
  if (error) throw new Error(`Không tải được tình trạng hồ sơ: ${error.message}`);
  return data as DocStatusResult;
}
