"use server";
// Hồ sơ tự phục vụ. Mọi thao tác xác định nhân viên từ PHIÊN ĐĂNG NHẬP (không nhận mã nhân viên từ biểu mẫu) và chỉ nhận các trường được phép sửa.
// Quyền và quy tắc nghiệp vụ được kiểm tra lại trong hàm CSDL; lớp này kiểm tra thêm chữ ký tệp / dung lượng trước khi gửi.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContext, hasRole } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { AVATAR_MAX, AVATAR_MIME, checkFile, sniff } from "@/lib/files";
import type { ActionResult } from "@/lib/types";

const refresh = () => { revalidatePath("/", "layout"); };

export async function uploadAvatarAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireContext();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn một ảnh để tải lên." };
  if (file.size > AVATAR_MAX) return { ok: false, error: "Ảnh tối đa 2 MB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniff(bytes);
  const mime = AVATAR_MIME[kind];
  if (!mime) return { ok: false, error: "Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_avatar", { p_mime: mime, p_content_base64: bytes.toString("base64") });
  if (error) return { ok: false, error: toUserMessage(error, "Tải ảnh thất bại, ảnh hiện tại vẫn được giữ. Vui lòng thử lại.") };
  refresh();
  return { ok: true, message: "Đã cập nhật ảnh đại diện." };
}

export async function removeAvatarAction(): Promise<ActionResult> {
  await requireContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_my_avatar");
  if (error) return { ok: false, error: toUserMessage(error, "Không gỡ được ảnh, vui lòng thử lại.") };
  refresh();
  return { ok: true, message: "Đã gỡ ảnh đại diện." };
}

export async function saveMyAddressAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireContext();
  const parsed = z.string().trim().max(300, "Địa chỉ tối đa 300 ký tự").safeParse(String(fd.get("address") ?? ""));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Địa chỉ không hợp lệ" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_my_profile", { p_address: parsed.data });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/cai-dat/ho-so");
  return { ok: true, message: "Đã lưu thông tin." };
}

const OPS = ["add_email", "edit_email", "set_primary_email", "delete_email", "add_phone", "set_primary_phone", "delete_phone"] as const;

/** Liên hệ cá nhân của CHÍNH MÌNH. Với thao tác theo mã dòng, kiểm tra dòng đó thuộc về người đang đăng nhập (kể cả khi người dùng là HR). */
export async function myContactAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  const op = String(fd.get("op") ?? "");
  if (!(OPS as readonly string[]).includes(op)) return { ok: false, error: "Thao tác không hợp lệ." };
  const supabase = await createSupabaseServerClient();
  const idParsed = z.guid().safeParse(fd.get("id"));
  if (op !== "add_email" && op !== "add_phone") {
    if (!idParsed.success) return { ok: false, error: "Mã liên hệ không hợp lệ." };
    const table = op.endsWith("email") ? "user_emails" : "user_phones";
    const { data } = await supabase.from(table).select("user_id").eq("id", idParsed.data).maybeSingle();
    if (!data || data.user_id !== ctx.user_id) return { ok: false, error: "Không tìm thấy liên hệ của bạn." };
  }
  const primary = fd.get("primary") === "on";
  let res;
  switch (op) {
    case "add_email": res = await supabase.rpc("save_user_email", { p_id: null, p_user: ctx.user_id, p_email: String(fd.get("email") ?? ""), p_primary: primary }); break;
    case "edit_email": res = await supabase.rpc("save_user_email", { p_id: idParsed.data, p_user: ctx.user_id, p_email: String(fd.get("email") ?? ""), p_primary: false }); break;
    case "set_primary_email": res = await supabase.rpc("set_primary_user_email", { p_id: idParsed.data }); break;
    case "delete_email": res = await supabase.rpc("delete_user_email", { p_id: idParsed.data }); break;
    case "add_phone": res = await supabase.rpc("save_user_phone", { p_id: null, p_user: ctx.user_id, p_country: String(fd.get("country") ?? "+84"), p_phone: String(fd.get("phone") ?? ""), p_primary: primary }); break;
    case "set_primary_phone": res = await supabase.rpc("set_primary_user_phone", { p_id: idParsed.data }); break;
    default: res = await supabase.rpc("delete_user_phone", { p_id: idParsed.data });
  }
  if (res.error) return { ok: false, error: toUserMessage(res.error) };
  revalidatePath("/cai-dat/ho-so");
  return { ok: true, message: "Đã lưu liên hệ." };
}

/** Nộp / thay tệp cho một yêu cầu tài liệu của CHÍNH MÌNH. */
export async function submitRequestDocumentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return { ok: false, error: "Tài khoản cộng tác viên không có yêu cầu tài liệu nhân sự." };
  const reqId = z.guid().safeParse(fd.get("request_id"));
  if (!reqId.success) return { ok: false, error: "Mã yêu cầu không hợp lệ." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn một tệp để nộp." };
  const supabase = await createSupabaseServerClient();
  const { data: req } = await supabase.from("document_requests").select("id, user_id, status, type_id").eq("id", reqId.data).maybeSingle();
  if (!req || req.user_id !== ctx.user_id) return { ok: false, error: "Không tìm thấy yêu cầu tài liệu của bạn." };
  if (req.status === "approved") return { ok: false, error: "Tài liệu đã được duyệt — liên hệ HR nếu cần thay bản khác." };
  const { data: type } = await supabase.from("document_types").select("allowed_exts, max_mb").eq("id", req.type_id).maybeSingle();
  if (!type) return { ok: false, error: "Không tìm thấy loại tài liệu." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const bad = checkFile(file.name, bytes, type.allowed_exts as string[], type.max_mb as number);
  if (bad) return { ok: false, error: bad };
  const { error } = await supabase.rpc("submit_my_document", { p_request: reqId.data, p_name: file.name, p_mime: file.type || "application/octet-stream", p_content_base64: bytes.toString("base64") });
  if (error) return { ok: false, error: toUserMessage(error, "Nộp tệp thất bại, tệp đã nộp trước đó (nếu có) vẫn được giữ. Vui lòng thử lại.") };
  revalidatePath("/cai-dat/ho-so");
  revalidatePath("/nhan-su", "layout");
  return { ok: true, message: "Đã nộp tài liệu — chờ HR duyệt." };
}
