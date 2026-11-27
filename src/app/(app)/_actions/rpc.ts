"use server";
// Cầu nối chung giữa giao diện và các hàm RPC của CSDL. Quyền, quy tắc nghiệp vụ và kiểm tra dữ liệu
// nằm trong hàm CSDL (SECURITY DEFINER); lớp này chỉ ép kiểu và gọi bằng phiên đăng nhập của chính người dùng.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export type ArgType = "text" | "number" | "date" | "datetime" | "bool" | "uuid" | "uuids" | "tags";
export type ArgSpec = { name: string; type: ArgType };

const RPC_NAME = /^[a-z][a-z0-9_]{2,63}$/;
const BLOCKED = new Set(["get_my_context", "set_user_roles"]);

function cast(type: ArgType, fd: FormData, name: string): unknown {
  if (type === "uuids") return fd.getAll(name).map(String).filter(Boolean);
  const raw = fd.get(name);
  const v = typeof raw === "string" ? raw.trim() : "";
  switch (type) {
    case "bool": return v === "on" || v === "true" || v === "1";
    case "number": return v === "" ? null : Number(v.replace(/[,\s]/g, ""));
    case "date": return v === "" ? null : v;
    case "datetime": return v === "" ? null : (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}${v.length > 16 ? "" : ":00"}+07:00`);
    case "uuid": return v === "" ? null : v;
    case "tags": return v === "" ? [] : v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    default: return v === "" ? null : v;
  }
}

function paths(list: string | undefined): string[] {
  return (list ?? "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("/"));
}

function target(tpl: string | undefined, result: unknown): string | null {
  if (!tpl || !tpl.startsWith("/") || tpl.startsWith("//")) return null;
  const s = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  return tpl.replace(/\{([a-z_]*)\}/g, (_m, k: string) => encodeURIComponent(String(k ? (s?.[k] ?? "") : (typeof result === "string" ? result : ""))));
}

async function run(rpc: string, args: Record<string, unknown>) {
  if (!RPC_NAME.test(rpc) || BLOCKED.has(rpc)) return { error: "Thao tác không hợp lệ." as string | null, data: null as unknown };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpc, args);
  return { error: error ? toUserMessage(error) : null, data: data as unknown };
}

/** Biểu mẫu: __rpc, __spec (JSON [{name,type}]), __fixed (JSON), __revalidate, __redirect, __ok + các trường. */
export async function rpcFormAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const rpc = String(fd.get("__rpc") ?? "");
  let spec: ArgSpec[] = [];
  let fixed: Record<string, unknown> = {};
  try {
    spec = JSON.parse(String(fd.get("__spec") ?? "[]")) as ArgSpec[];
    fixed = JSON.parse(String(fd.get("__fixed") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Biểu mẫu không hợp lệ." };
  }
  const args: Record<string, unknown> = { ...fixed };
  for (const s of spec) args[s.name] = cast(s.type, fd, s.name);
  const { error, data } = await run(rpc, args);
  if (error) return { ok: false, error };
  for (const p of paths(String(fd.get("__revalidate") ?? ""))) revalidatePath(p, "layout");
  const to = target(String(fd.get("__redirect") ?? ""), data);
  if (to) redirect(to);
  return { ok: true, message: String(fd.get("__ok") ?? "") || "Đã lưu." };
}

/** Nút một chạm: gọi RPC với tham số cố định (+ ghi chú tùy chọn). */
export async function rpcCall(rpc: string, args: Record<string, unknown>, revalidate: string[] = [], redirectTo?: string): Promise<ActionResult> {
  const { error, data } = await run(rpc, args);
  if (error) return { ok: false, error };
  for (const p of revalidate) if (p.startsWith("/")) revalidatePath(p, "layout");
  const to = target(redirectTo, data);
  if (to) redirect(to);
  return { ok: true, message: "Đã cập nhật." };
}
