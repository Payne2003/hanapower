import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OppInfo = { id: string; name: string; account_id: string; account_name: string; stage: string };

/** Tên cơ hội + khách hàng cho một tập id cơ hội (không dùng nhúng quan hệ để tránh phụ thuộc tên khóa ngoại). */
export async function oppInfo(ids: string[]): Promise<Map<string, OppInfo>> {
  const out = new Map<string, OppInfo>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return out;
  const supabase = await createSupabaseServerClient();
  const { data: opps } = await supabase.from("opportunities").select("id, name, account_id, stage").in("id", uniq);
  const accIds = [...new Set((opps ?? []).map((o) => o.account_id as string))];
  const { data: accs } = accIds.length ? await supabase.from("accounts").select("id, name").in("id", accIds) : { data: [] as { id: string; name: string }[] };
  const an = new Map((accs ?? []).map((a) => [a.id as string, a.name as string]));
  for (const o of opps ?? []) out.set(o.id as string, { id: o.id as string, name: o.name as string, account_id: o.account_id as string, account_name: an.get(o.account_id as string) ?? "—", stage: o.stage as string });
  return out;
}
