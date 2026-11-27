"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import { norm } from "@/lib/sheet-import";
import { KIND_BY_SLUG, SLUG_BY_KIND, parseCrmFile, planCrmImport, type ImportCtx, type ImportKind, type PlanLine } from "@/lib/crm-import";
import type { ActionResult } from "@/lib/types";

export type CrmPreview = { kind: ImportKind; lines: PlanLine[]; sheet: string; fileName: string; recognized: string[]; unknown: string[] };
export type CrmImportResult = { inserted: number; skipped: number; accounts_created: number };

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;
/** PostgREST trả tối đa 1000 dòng mỗi lần — đọc hết theo trang. */
async function fetchAll(supabase: SB, table: string, cols: string, soft = true): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).order("id").range(from, from + 999);
    if (soft) q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function buildCtx(supabase: SB, kind: ImportKind): Promise<ImportCtx> {
  const [people, industries, sources, accounts] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("is_active", true),
    supabase.from("industries").select("id, name").is("deleted_at", null),
    supabase.from("lead_sources").select("id, name").is("deleted_at", null),
    fetchAll(supabase, "accounts", "id, name, tax_code"),
  ]);
  const ex: ImportCtx["existing"] = { accountNames: new Set(), accountTax: new Set(), contactEmails: new Set(), contactNameAcc: new Set(), leadEmails: new Set(), leadPhones: new Set(), leadNameCompany: new Set() };
  for (const a of accounts) { ex.accountNames.add(norm(a.name)); if (a.tax_code) ex.accountTax.add(String(a.tax_code).replace(/\s/g, "")); }
  if (kind !== "accounts") {
    for (const c of await fetchAll(supabase, "contacts", "id, first_name, last_name, account_id, emails")) {
      for (const e of (c.emails as string[]) ?? []) ex.contactEmails.add(e.toLowerCase());
      ex.contactNameAcc.add(`${norm(`${c.first_name} ${c.last_name}`)}|${c.account_id ?? ""}`);
    }
  }
  if (kind === "leads") {
    for (const l of await fetchAll(supabase, "leads", "id, first_name, last_name, company, emails, phones")) {
      for (const e of (l.emails as string[]) ?? []) ex.leadEmails.add(e.toLowerCase());
      for (const p of (l.phones as string[]) ?? []) ex.leadPhones.add(p);
      ex.leadNameCompany.add(`${norm(`${l.first_name} ${l.last_name}`)}|${norm(String(l.company ?? ""))}`);
    }
  }
  return {
    people: (people.data ?? []) as { id: string; full_name: string }[],
    industries: (industries.data ?? []).map((r) => [r.id as string, r.name as string]),
    sources: (sources.data ?? []).map((r) => [r.id as string, r.name as string]),
    accounts: accounts.map((a) => ({ id: a.id as string, name: a.name as string, tax_code: (a.tax_code as string | null) ?? null })),
    existing: ex,
  };
}

/** Bước 1: đọc tệp, so khớp với dữ liệu hiện có, trả về bản xem trước (chưa ghi gì). */
export async function previewCrmImport(_p: ActionResult<CrmPreview> | null, fd: FormData): Promise<ActionResult<CrmPreview>> {
  const ctx = await requireContext();
  if (!can(ctx, "crm.manage")) return { ok: false, error: "Bạn không có quyền nhập dữ liệu CRM." };
  const kind = KIND_BY_SLUG[String(fd.get("kind") ?? "")];
  if (!kind) return { ok: false, error: "Loại dữ liệu không hợp lệ." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn tệp Excel (.xlsx) hoặc CSV." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Tệp quá lớn (tối đa 10 MB)." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { ok: false, error: "Chỉ nhận tệp .xlsx hoặc .csv." };
  let parsed;
  try { parsed = await parseCrmFile(kind, file.name, await file.arrayBuffer()); } catch { return { ok: false, error: "Không đọc được tệp. Hãy lưu lại dạng .xlsx hoặc .csv rồi thử lại." }; }
  if (!parsed || parsed.rows.length === 0) return { ok: false, error: "Không tìm thấy dòng dữ liệu. Tệp cần có dòng tiêu đề (vd. “Tên công ty”, “Điện thoại”, “Email”). Tải tệp mẫu để xem định dạng." };
  if (parsed.rows.length > 5000) return { ok: false, error: "Tệp có hơn 5.000 dòng — hãy chia nhỏ rồi nhập từng phần." };
  const supabase = await createSupabaseServerClient();
  let c: ImportCtx;
  try { c = await buildCtx(supabase, kind); } catch (e) { return { ok: false, error: `Không tải được dữ liệu hiện có: ${(e as Error).message}` }; }
  return { ok: true, data: { kind, lines: planCrmImport(kind, parsed.rows, c), sheet: parsed.sheet, fileName: file.name, recognized: parsed.recognized, unknown: parsed.unknownHeaders } };
}

const rowSchema = z.record(z.string(), z.unknown());

/** Bước 2: ghi vào cơ sở dữ liệu trong một giao dịch (CSDL kiểm tra lại quyền và bản ghi trùng). */
export async function runCrmImport(_p: ActionResult<CrmImportResult> | null, fd: FormData): Promise<ActionResult<CrmImportResult>> {
  const ctx = await requireContext();
  if (!can(ctx, "crm.manage")) return { ok: false, error: "Bạn không có quyền nhập dữ liệu CRM." };
  const slug = String(fd.get("kind") ?? "");
  const kind = KIND_BY_SLUG[slug];
  if (!kind) return { ok: false, error: "Loại dữ liệu không hợp lệ." };
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("rows") ?? "[]")); } catch { return { ok: false, error: "Dữ liệu nhập không hợp lệ." }; }
  const parsed = z.array(rowSchema).max(5000).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dữ liệu nhập không hợp lệ — hãy đọc lại tệp." };
  if (parsed.data.length === 0) return { ok: false, error: "Không có dòng mới để nhập." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_crm", { p_kind: kind, p_rows: parsed.data, p_create_accounts: fd.get("create_accounts") === "on" });
  if (error) return { ok: false, error: toUserMessage(error) };
  const r = data as CrmImportResult;
  revalidatePath(`/${SLUG_BY_KIND[kind]}`);
  if (r.accounts_created) revalidatePath("/tai-khoan");
  return { ok: true, data: r, message: `Đã nhập ${r.inserted} bản ghi${r.skipped ? `, bỏ qua ${r.skipped} dòng trùng` : ""}${r.accounts_created ? `, tạo mới ${r.accounts_created} tài khoản công ty` : ""}.` };
}
