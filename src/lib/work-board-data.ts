import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPeople, getVideosByIds } from "@/lib/queries";
import { buildCard, type Card, type ProjectRef, type TaskRow, type Viewer } from "@/lib/work-board";
import type { MyContext, Person } from "@/lib/types";
import { can } from "@/lib/auth";

export type TaskGroup = { id: string; name: string };
export type BoardData = { cards: Card[]; people: Person[]; groups: TaskGroup[]; projects: ProjectRef[]; updatedAt: Map<string, string>; viewer: Viewer };

const COLS = "id, title, task_type, status, priority, scheduled_at, start_date, content, related_type, related_id, video_id, kind, created_by, created_at, updated_at, group_id";

export function viewerOf(ctx: MyContext): Viewer {
  return {
    userId: ctx.user_id, today: ctx.today, timezone: ctx.timezone,
    canApprove: can(ctx, "videos.approve"), canPublish: can(ctx, "videos.publish"), canManage: can(ctx, "videos.manage_all"),
    canCrm: can(ctx, "crm.manage"),
  };
}

/** Tải mọi công việc người dùng được xem (RLS lọc ở CSDL) cùng video liên kết và người phụ trách. */
export async function loadBoard(ctx: MyContext): Promise<BoardData> {
  const supabase = await createSupabaseServerClient();
  const [t, a, people, g, pr] = await Promise.all([
    supabase.from("tasks").select(COLS).is("deleted_at", null).order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(1500),
    supabase.from("task_assignees").select("task_id, user_id").limit(5000),
    getPeople(),
    supabase.from("task_groups").select("id, name").order("sort_order").order("created_at"),
    supabase.from("projects").select("id, code, name").is("deleted_at", null).order("code").limit(500),
  ]);
  const projects = ((pr.data ?? []) as ProjectRef[]);
  const pmap = new Map(projects.map((x) => [x.id, x]));
  if (t.error) throw new Error(`Không tải được công việc: ${t.error.message}`);
  if (a.error) throw new Error(`Không tải được người phụ trách: ${a.error.message}`);
  const rows = (t.data ?? []) as unknown as TaskRow[];
  const name = new Map(people.map((p) => [p.id, p.full_name]));
  const who = new Map<string, { id: string; name: string }[]>();
  for (const x of a.data ?? []) {
    const k = x.task_id as string; const u = x.user_id as string;
    who.set(k, [...(who.get(k) ?? []), { id: u, name: name.get(u) ?? "—" }]);
  }
  const vids = await getVideosByIds([...new Set(rows.map((r) => r.video_id).filter((x): x is string => !!x))]);
  const vmap = new Map(vids.map((v) => [v.id, v]));
  const viewer = viewerOf(ctx);
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue; // không bao giờ hiện trùng thẻ
    seen.add(r.id);
    cards.push(buildCard(r, who.get(r.id) ?? [], r.video_id ? vmap.get(r.video_id) ?? null : null, viewer, pmap));
  }
  return { cards, people, groups: (g.data ?? []) as TaskGroup[], projects, updatedAt: new Map(rows.map((r) => [r.id, r.updated_at])), viewer };
}
