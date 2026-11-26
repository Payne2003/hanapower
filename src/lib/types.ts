export type AppRole = "system_admin" | "manager" | "content" | "editor";
export type VideoStage = "idea" | "preparing" | "handover" | "editing" | "review" | "ready" | "published" | "on_hold" | "cancelled";
export type ItemStatus = "todo" | "doing" | "done";
export type ItemKind = "real_footage" | "ai_video" | "script_vo" | "edit_map";
export type HandoverStatus = "pending" | "received" | "needs_more";
export type VideoPriority = "low" | "medium" | "high" | "urgent";

export type MyContext = {
  user_id: string;
  org_id: string;
  org_name: string;
  timezone: string;
  full_name: string;
  email: string;
  department_id: string | null;
  is_active: boolean;
  roles: AppRole[];
  permissions: string[];
  today: string; // YYYY-MM-DD theo múi giờ doanh nghiệp
};

export type Person = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department_id: string | null;
  is_active: boolean;
  roles: AppRole[];
};

export type Channel = { id: string; name: string; platform: string; url: string | null; is_active: boolean };

export type VideoItem = { video_id: string; kind: ItemKind; status: ItemStatus };

export type Video = {
  id: string;
  code: string;
  title: string;
  brief: string | null;
  channel_id: string | null;
  priority: VideoPriority;
  stage: VideoStage;
  report_date: string;
  due_date: string | null;
  content_owner_id: string | null;
  resource_url: string | null;
  content_note: string | null;
  editor_id: string | null;
  handover_status: HandoverStatus | null;
  handover_submitted_at: string | null;
  handover_confirmed_at: string | null;
  editor_note: string | null;
  supplement_count: number;
  edit_progress: number;
  draft_url: string | null;
  review_note: string | null;
  revision_count: number;
  approved_at: string | null;
  published_url: string | null;
  published_at: string | null;
  hold_reason: string | null;
  created_at: string;
  updated_at: string;
  items: Record<ItemKind, ItemStatus>;
};

export type VideoEvent = {
  id: number;
  actor_id: string | null;
  event_type: string;
  from_stage: VideoStage | null;
  to_stage: VideoStage | null;
  note: string | null;
  created_at: string;
};

export type VideoComment = { id: string; author_id: string; body: string; created_at: string };

export type Notification = { id: number; video_id: string | null; kind: string; message: string; read_at: string | null; created_at: string };

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
