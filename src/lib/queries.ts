import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, Channel, ItemKind, ItemStatus, Notification, Person, Video, VideoComment, VideoEvent } from "@/lib/types";

const VIDEO_COLS =
  "id, code, title, brief, channel_id, priority, stage, report_date, due_date, content_owner_id, resource_url, content_note, editor_id, handover_status, handover_submitted_at, handover_confirmed_at, editor_note, supplement_count, edit_progress, draft_url, review_note, revision_count, approved_at, published_url, published_at, hold_reason, created_at, updated_at, video_items(kind, status)";

type Raw = Omit<Video, "items"> & { video_items: { kind: ItemKind; status: ItemStatus }[] };

function toVideo(r: Raw): Video {
  const items = { real_footage: "todo", ai_video: "todo", script_vo: "todo", edit_map: "todo" } as Record<ItemKind, ItemStatus>;
  for (const i of r.video_items ?? []) items[i.kind] = i.status;
  const { video_items: _ignored, ...rest } = r;
  void _ignored;
  return { ...rest, items };
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Không tải được ${what}: ${error.message}`);
}

export async function getPeople(): Promise<Person[]> {
  const supabase = await createSupabaseServerClient();
  const [p, r] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, job_title, department_id, is_active").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (p.error) fail("nhân sự", p.error);
  if (r.error) fail("vai trò", r.error);
  const roles = new Map<string, AppRole[]>();
  for (const x of r.data ?? []) roles.set(x.user_id as string, [...(roles.get(x.user_id as string) ?? []), x.role as AppRole]);
  return (p.data ?? []).map((x) => ({ ...(x as Omit<Person, "roles">), roles: roles.get(x.id as string) ?? [] }));
}

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("channels").select("id, name, platform, url, is_active").order("name");
  if (error) fail("kênh", error);
  return (data ?? []) as Channel[];
}

export type VideoFilter = { from?: string; to?: string; stage?: string; person?: string };

export async function getVideos(f: VideoFilter = {}): Promise<Video[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("videos").select(VIDEO_COLS).order("report_date", { ascending: true }).order("code", { ascending: true });
  if (f.from) q = q.gte("report_date", f.from);
  if (f.to) q = q.lte("report_date", f.to);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.person && /^[0-9a-f-]{36}$/i.test(f.person)) q = q.or(`content_owner_id.eq.${f.person},editor_id.eq.${f.person}`);
  const { data, error } = await q;
  if (error) fail("danh sách video", error);
  return ((data ?? []) as unknown as Raw[]).map(toVideo);
}

/** Video đang chạy (chưa đăng/hủy), không giới hạn tháng — cho Tổng quan. */
export async function getOpenVideos(): Promise<Video[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("videos").select(VIDEO_COLS).not("stage", "in", "(published,cancelled)").order("report_date");
  if (error) fail("video đang chạy", error);
  return ((data ?? []) as unknown as Raw[]).map(toVideo);
}

export async function getVideo(id: string) {
  const supabase = await createSupabaseServerClient();
  const [v, ev, cm] = await Promise.all([
    supabase.from("videos").select(VIDEO_COLS).eq("id", id).maybeSingle(),
    supabase.from("video_events").select("id, actor_id, event_type, from_stage, to_stage, note, created_at").eq("video_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("video_comments").select("id, author_id, body, created_at").eq("video_id", id).order("created_at"),
  ]);
  if (v.error) fail("video", v.error);
  if (!v.data) return null;
  return {
    video: toVideo(v.data as unknown as Raw),
    events: (ev.data ?? []) as VideoEvent[],
    comments: (cm.data ?? []) as VideoComment[],
  };
}

export async function getNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("notifications").select("id, video_id, kind, message, read_at, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) fail("thông báo", error);
  return (data ?? []) as Notification[];
}
