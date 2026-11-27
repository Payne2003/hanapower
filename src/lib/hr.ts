import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Truy vấn Nhân sự: lọc / sắp xếp / phân trang / tổng hợp chạy ở CSDL (hàm staff_list, staff_summary, department_*, position_list).
// Mọi hàm là security invoker nên quyền theo dòng do RLS của người đang xem quyết định.

export type Assignment = { dept_id: string; dept: string; is_manager: boolean; positions: { id: string; name: string }[] };
export type StaffRow = { id: string; code: string; name: string; email: string; status: string; work_form: string; type: string; active: boolean; assignments: Assignment[] };
export type StaffSummary = {
  total: number; unassigned: number;
  by_status: Record<string, number>; by_work_form: Record<string, number>;
  by_department: { id: string; name: string; count: number }[]; by_position: { id: string; name: string; count: number }[];
};
export type DeptRow = { id: string; name: string; active: boolean; member_count: number; position_count: number; managers: { id: string; name: string; position: string | null }[] };
export type DeptOverview = {
  dept: { id: string; name: string; active: boolean };
  managers: { id: string; code: string; name: string; position_id: string | null; position: string | null }[];
  members: { id: string; code: string; name: string; email: string; work_form: string; status: string; type: string; is_manager: boolean; is_primary: boolean; positions: { id: string; name: string }[] }[];
  by_position: { id: string; name: string; count: number }[]; by_work_form: Record<string, number>; by_status: Record<string, number>;
  member_count: number; position_count: number;
};
export type PositionRow = { id: string; name: string; active: boolean; staff_count: number; dept_count: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = ["working", "on_leave", "resigned"];
const FORMS = ["office", "remote", "hybrid"];

export type StaffQuery = { q: string; dept?: string; position?: string; status?: string; form?: string; none: boolean; sort: string; dir: "asc" | "desc"; page: number; size: number };
type SP = Record<string, string | undefined>;

/** Đọc bộ lọc từ URL (đã kiểm tra: mã phải là UUID, trạng thái thuộc danh sách). */
export function parseStaffQuery(sp: SP, size = 20): StaffQuery {
  const page = Math.max(1, Math.floor(Number(sp.trang) || 1));
  return {
    q: (sp.q ?? "").slice(0, 80),
    dept: sp.phong && UUID.test(sp.phong) ? sp.phong : undefined,
    position: sp["chuc-vu"] && UUID.test(sp["chuc-vu"]) ? sp["chuc-vu"] : undefined,
    status: STATUS.includes(sp["trang-thai"] ?? "") ? sp["trang-thai"] : undefined,
    form: FORMS.includes(sp["hinh-thuc"] ?? "") ? sp["hinh-thuc"] : undefined,
    none: sp["chua-phan-phong"] === "1",
    sort: ["name", "code", "status", "work_form"].includes(sp.sx ?? "") ? sp.sx! : "name",
    dir: sp.chieu === "desc" ? "desc" : "asc",
    page, size,
  };
}

/** Dựng chuỗi truy vấn từ bộ lọc (giữ nguyên các tham số khác như chế độ xem, hồ sơ đang mở). */
export function staffParams(q: Partial<StaffQuery>, extra: Record<string, string | undefined> = {}): string {
  const p: Record<string, string | undefined> = {
    q: q.q || undefined, phong: q.dept, "chuc-vu": q.position, "trang-thai": q.status, "hinh-thuc": q.form,
    "chua-phan-phong": q.none ? "1" : undefined, sx: q.sort && q.sort !== "name" ? q.sort : undefined, chieu: q.dir === "desc" ? "desc" : undefined,
    trang: q.page && q.page > 1 ? String(q.page) : undefined, ...extra,
  };
  const e = Object.entries(p).filter(([, v]) => v);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

const rpcArgs = (q: StaffQuery) => ({ p_q: q.q || null, p_dept: q.dept ?? null, p_position: q.position ?? null, p_status: q.status ?? null, p_work_form: q.form ?? null, p_unassigned: q.none });

async function rpc<T>(name: string, args: Record<string, unknown>, what: string): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`Không tải được ${what}: ${error.message}`);
  return data as T;
}

export const getStaffList = (q: StaffQuery) =>
  rpc<{ total: number; rows: StaffRow[] }>("staff_list", { ...rpcArgs(q), p_sort: q.sort, p_dir: q.dir, p_limit: q.size, p_offset: (q.page - 1) * q.size }, "danh sách nhân viên");
export const getStaffSummary = (q: StaffQuery) => rpc<StaffSummary>("staff_summary", rpcArgs(q), "thống kê nhân viên");

export type DeptQuery = { q: string; active?: boolean; sort: string; dir: "asc" | "desc"; page: number; size: number };
export function parseDeptQuery(sp: SP, size = 15): DeptQuery {
  return {
    q: (sp.q ?? "").slice(0, 80), active: sp["trang-thai"] === "dang-hoat-dong" ? true : sp["trang-thai"] === "ngung" ? false : undefined,
    sort: ["name", "members", "positions", "status"].includes(sp.sx ?? "") ? sp.sx! : "name", dir: sp.chieu === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.floor(Number(sp.trang) || 1)), size,
  };
}
export const getDepartments = (q: DeptQuery) =>
  rpc<{ total: number; rows: DeptRow[]; totals: { departments: number; active: number; members: number; unassigned: number } }>(
    "department_list", { p_q: q.q || null, p_active: q.active ?? null, p_sort: q.sort, p_dir: q.dir, p_limit: q.size, p_offset: (q.page - 1) * q.size }, "danh sách phòng ban");
export const getDepartmentOverview = (id: string) => rpc<DeptOverview | null>("department_overview", { p_dept: id }, "phòng ban");
export const getDepartmentTasks = (id: string) =>
  rpc<{ total: number; rows: { id: string; title: string; type: string; status: string; priority: string; scheduled_at: string | null; video_id: string | null; assignees: { id: string; name: string }[] }[] }>(
    "department_tasks", { p_dept: id, p_limit: 100 }, "công việc của phòng");
export const getPositions = () => rpc<PositionRow[]>("position_list", {}, "danh mục chức vụ");

export async function getLookups() {
  const supabase = await createSupabaseServerClient();
  const [d, p] = await Promise.all([
    supabase.from("departments").select("id, name, is_active").order("name"),
    supabase.from("positions").select("id, name").is("deleted_at", null).order("name"),
  ]);
  if (d.error || p.error) throw new Error(`Không tải được danh mục: ${(d.error ?? p.error)!.message}`);
  return { departments: (d.data ?? []) as { id: string; name: string; is_active: boolean }[], positions: (p.data ?? []) as { id: string; name: string }[] };
}

export const money0 = (n: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
