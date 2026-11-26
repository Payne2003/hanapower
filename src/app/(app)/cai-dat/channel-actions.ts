"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  id: z.union([z.literal(""), z.guid()]).optional().transform((v) => (v ? v : null)),
  name: z.string().trim().min(1, "Nhập tên kênh").max(200),
  platform: z.string().trim().max(50).optional().default("YouTube"),
  url: z.string().trim().max(500).optional().default(""),
  is_active: z.string().optional(),
});

export async function saveChannelAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = schema.safeParse(Object.fromEntries(fd));
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_channel", {
    p_id: s.data.id, p_name: s.data.name, p_platform: s.data.platform || "YouTube", p_url: s.data.url || null,
    p_active: s.data.id ? s.data.is_active === "on" : true,
  });
  if (error) return { ok: false, error: toUserMessage(error) };
  revalidatePath("/cai-dat");
  return { ok: true, message: "Đã lưu kênh." };
}
