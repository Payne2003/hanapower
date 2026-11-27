// Bảng công việc: gộp việc độc lập (tasks) với đầu việc tự đồng bộ từ video, và tính sẵn nhãn / luật kéo thẻ.
// Thuần logic (không gọi CSDL) để kiểm thử đơn vị được; việc tải dữ liệu nằm ở work-board-data.ts.
import { ITEM_KINDS } from "./labels";
import { handoverBlockers, itemsDone } from "./pipeline";
import type { Video } from "./types";

export type TaskStatus = "not_started" | "in_progress" | "completed" | "deferred" | "cancelled";
export type ColumnId = "not_started" | "in_progress" | "completed";
export const COLUMNS: { id: ColumnId; label: string; color: string }[] = [
  { id: "not_started", label: "Việc cần làm", color: "#64748b" },
  { id: "in_progress", label: "Đang tiến hành", color: "#2563eb" },
  { id: "completed", label: "Xong", color: "#16a34a" },
];

export type TaskRow = {
  id: string; title: string; task_type: string; status: TaskStatus; priority: string;
  scheduled_at: string | null; start_date: string | null; content: string | null;
  related_type: string | null; related_id: string | null; video_id: string | null; kind: "content" | "edit" | null;
  created_by: string | null; created_at: string; updated_at: string; group_id: string | null;
};
export type ProjectRef = { id: string; code: string; name: string };

export type Viewer = { userId: string; today: string; timezone: string; canApprove: boolean; canPublish: boolean; canManage: boolean; canCrm: boolean };

/** Điều gì xảy ra khi thả thẻ vào một cột. */
export type MoveRule =
  | { t: "rpc" }
  | { t: "open"; href: string; label: string }
  | { t: "block"; msg: string };

export type Flags = { overdue: boolean; dueToday: boolean; review: boolean; supplement: boolean; revision: boolean };

export type Card = {
  id: string;
  title: string; // tiêu đề hiển thị theo bước hiện tại
  baseTitle: string; // tiêu đề lưu trong CSDL
  status: TaskStatus;
  priority: string;
  taskType: string;
  assignees: { id: string; name: string }[];
  start: string | null; // YYYY-MM-DD
  due: string | null; // YYYY-MM-DD theo múi giờ doanh nghiệp
  dueAt: string | null;
  content: string | null;
  createdBy: string | null;
  groupId: string | null;
  project: ProjectRef | null;
  related: { type: string; id: string } | null;
  video: { id: string; code: string; title: string; stage: Video["stage"]; resourceUrl: string | null; draftUrl: string | null } | null;
  kind: "content" | "edit" | null;
  step: string | null; // "3/4 hạng mục", "65%", "Lần 2"…
  next: string | null; // ai xử lý tiếp: "Chờ Content", "Chờ Leader duyệt"…
  note: { label: string; text: string } | null;
  nextActorIds: string[]; // người đang cần xử lý (rỗng = theo quyền)
  needsApprove: boolean;
  needsPublish: boolean;
  flags: Flags;
  move: Record<ColumnId, MoveRule | null>;
  mine: boolean; // được giao cho tôi
  actionable: boolean; // cần tôi xử lý
  actionLabel: string | null;
  searchText: string;
};

const toStatusCol = (s: TaskStatus): ColumnId | null => (s === "not_started" || s === "in_progress" || s === "completed" ? s : null);
export { toStatusCol };

/** Ngày YYYY-MM-DD của một thời điểm theo múi giờ doanh nghiệp. */
export function dayIn(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return p;
}

const blockedBack = "Việc đã hoàn thành ở bước trước — không kéo lùi. Dùng yêu cầu bổ sung / sửa ở trang Video.";

/** Luật kéo thẻ của đầu việc gắn video: không bao giờ bỏ qua bàn giao / nộp duyệt / duyệt. */
function videoMoves(kind: "content" | "edit", v: Video, vw: Viewer, status: TaskStatus): Record<ColumnId, MoveRule | null> {
  const page = `/video/${v.id}`;
  const open = (anchor: string, label: string): MoveRule => ({ t: "open", href: `${page}#${anchor}`, label });
  const none: Record<ColumnId, MoveRule | null> = { not_started: null, in_progress: null, completed: null };
  const cur = toStatusCol(status);
  if (!cur) return none;
  const r: Record<ColumnId, MoveRule | null> = { not_started: null, in_progress: null, completed: null };
  for (const to of ["not_started", "in_progress", "completed"] as ColumnId[]) {
    if (to === cur) continue;
    if (cur === "completed") { r[to] = { t: "block", msg: blockedBack }; continue; }
    if (kind === "content") {
      if (to === "not_started") r[to] = { t: "block", msg: "Trạng thái Content theo số hạng mục đã làm — cập nhật hạng mục ở trang Video." };
      else if (to === "in_progress") r[to] = open("panel-content", "Cập nhật hạng mục Content");
      else {
        const b = handoverBlockers(v);
        r[to] = v.stage === "idea" || v.stage === "preparing"
          ? (b.length ? { t: "block", msg: `Chưa bàn giao được: ${b.join("; ")}.` } : open("panel-handover", "Bàn giao cho Editor"))
          : { t: "block", msg: "Video không ở bước chuẩn bị Content." };
      }
    } else {
      if (to === "not_started") r[to] = { t: "block", msg: "Không kéo ngược việc dựng — nếu cần sửa, Leader yêu cầu sửa ở bước duyệt." };
      else if (to === "in_progress") {
        r[to] = v.stage === "handover" ? open("panel-handover", "Xác nhận bàn giao")
          : v.stage === "idea" || v.stage === "preparing" ? { t: "block", msg: "Content chưa bàn giao — chưa thể bắt đầu dựng." }
          : open("panel-edit", "Cập nhật tiến độ dựng");
      } else {
        r[to] = v.stage === "editing" ? open("panel-edit", "Nộp duyệt bản dựng")
          : v.stage === "review" ? (vw.canApprove ? open("panel-review", "Duyệt bản dựng") : { t: "block", msg: "Bản dựng đang chờ Leader duyệt — chỉ người có quyền duyệt mới hoàn tất được." })
          : v.stage === "handover" ? open("panel-handover", "Xác nhận bàn giao trước khi dựng")
          : { t: "block", msg: "Content chưa bàn giao — chưa có bản dựng để hoàn thành." };
      }
    }
  }
  return r;
}

function videoLabels(kind: "content" | "edit", v: Video) {
  let title: string; let step: string | null = null; let next: string | null = null; let note: Card["note"] = null; let action: string | null = null;
  let actors: string[] = []; let needsApprove = false; let needsPublish = false;
  const done = itemsDone(v.items);
  const items = `${done}/${ITEM_KINDS.length} hạng mục`;
  if (v.stage === "cancelled") return { title: `${kind === "content" ? "Chuẩn bị nội dung" : "Dựng bản nháp"} ${v.title}`, step: "Đã hủy", next: null, note, action, actors, needsApprove, needsPublish };
  if (kind === "content") {
    title = `Chuẩn bị nội dung ${v.title}`;
    if (v.stage === "idea" || v.stage === "preparing") {
      if (v.handover_status === "needs_more") {
        step = `Bổ sung lần ${v.supplement_count}`; next = "Chờ Content bổ sung"; action = "Bổ sung theo yêu cầu của Editor";
        if (v.editor_note) note = { label: "Editor yêu cầu bổ sung", text: v.editor_note };
      } else { step = items; next = "Chờ Content"; action = "Chuẩn bị Content"; }
      if (v.content_owner_id) actors = [v.content_owner_id];
    } else if (v.stage === "handover") { step = "Đã bàn giao"; next = "Chờ Editor xác nhận"; }
    else if (v.stage === "on_hold") { step = items; next = "Tạm dừng"; }
    else { step = "Đã bàn giao"; }
    if (!note && v.content_note) note = { label: "Ghi chú Content", text: v.content_note };
  } else {
    title = `Dựng bản nháp ${v.title}`;
    if (v.stage === "idea" || v.stage === "preparing") { step = "Chưa bàn giao"; next = "Chờ Content bàn giao"; }
    else if (v.stage === "handover") { step = "Chờ nhận bàn giao"; next = "Chờ Editor xác nhận"; action = "Xác nhận bàn giao"; if (v.editor_id) actors = [v.editor_id]; }
    else if (v.stage === "editing") {
      if (v.revision_count > 0 && v.review_note) {
        title = `Sửa bản dựng ${v.title}`; step = `Lần ${v.revision_count}`; next = "Editor đang sửa"; action = "Sửa theo góp ý";
        note = { label: "Leader yêu cầu sửa", text: v.review_note };
      } else { step = `${v.edit_progress}%`; next = "Editor đang dựng"; action = "Dựng video"; if (v.editor_note) note = { label: "Ghi chú Editor", text: v.editor_note }; }
      if (v.editor_id) actors = [v.editor_id];
    } else if (v.stage === "review") {
      title = `Duyệt bản dựng ${v.title}`; step = `${v.edit_progress}%`; next = "Chờ Leader duyệt"; action = "Duyệt bản dựng"; needsApprove = true;
      if (v.review_note && v.revision_count > 0) note = { label: "Góp ý lần trước", text: v.review_note };
    } else if (v.stage === "ready") { step = "Đã duyệt"; next = "Chờ đăng kênh"; action = "Đăng kênh"; needsPublish = true; }
    else if (v.stage === "published") { step = "Đã đăng"; }
    else if (v.stage === "on_hold") { step = `${v.edit_progress}%`; next = "Tạm dừng"; }
  }
  return { title, step, next, note, action, actors, needsApprove, needsPublish };
}

export function buildCard(t: TaskRow, assignees: { id: string; name: string }[], video: Video | null, vw: Viewer, projects: Map<string, ProjectRef> = new Map()): Card {
  const projectId = video ? video.project_id ?? null : t.related_type === "project" ? t.related_id : null;
  const due = dayIn(t.scheduled_at, vw.timezone);
  const open = t.status !== "completed" && t.status !== "cancelled";
  let title = t.title; let step: string | null = null; let next: string | null = null; let note: Card["note"] = null;
  let actors: string[] = []; let needsApprove = false; let needsPublish = false; let action: string | null = null;
  let move: Card["move"] = { not_started: null, in_progress: null, completed: null };
  const cur = toStatusCol(t.status);

  if (video && t.kind) {
    const l = videoLabels(t.kind, video);
    title = l.title; step = l.step; next = l.next; note = l.note; actors = l.actors; needsApprove = l.needsApprove; needsPublish = l.needsPublish; action = l.action;
    move = videoMoves(t.kind, video, vw, t.status);
  } else if (t.video_id) {
    // Người xem không đọc được hàng video: vẫn chặn kéo, chỉ chỉ đường tới trang Video.
    const href = `/video/${t.video_id}`;
    for (const c of COLUMNS) if (c.id !== cur) move[c.id] = { t: "open", href, label: "Mở video" };
  } else if (cur) {
    for (const c of COLUMNS) if (c.id !== cur) move[c.id] = { t: "rpc" };
    if (t.content) note = { label: "Nội dung", text: t.content };
  }

  const isAssignee = assignees.some((a) => a.id === vw.userId);
  const byRole = (needsApprove && vw.canApprove) || (needsPublish && vw.canPublish);
  const actionable = !!video && !!t.kind ? (open || needsPublish) && (actors.includes(vw.userId) || byRole) : open && isAssignee;
  const flags: Flags = {
    overdue: open && !!due && due < vw.today,
    dueToday: open && due === vw.today,
    review: needsApprove,
    supplement: !!video && video.handover_status === "needs_more" && (video.stage === "idea" || video.stage === "preparing"),
    revision: !!video && video.stage === "editing" && video.revision_count > 0 && !!video.review_note,
  };
  const names = assignees.map((a) => a.name).join(" ");
  return {
    id: t.id, title, baseTitle: t.title, status: t.status, priority: t.priority, taskType: t.task_type, assignees,
    start: t.start_date, due, dueAt: t.scheduled_at, content: t.content, createdBy: t.created_by, groupId: t.group_id,
    project: projectId ? projects.get(projectId) ?? null : null,
    related: t.related_type && t.related_id ? { type: t.related_type, id: t.related_id } : null,
    video: video ? { id: video.id, code: video.code, title: video.title, stage: video.stage, resourceUrl: video.resource_url, draftUrl: video.draft_url } : null,
    kind: t.kind, step, next, note, nextActorIds: actors, needsApprove, needsPublish, flags, move,
    mine: isAssignee, actionable, actionLabel: actionable ? (action ?? (t.video_id ? null : "Việc được giao")) : null,
    searchText: `${title} ${t.title} ${video?.code ?? ""} ${video?.title ?? ""} ${names} ${projectId ? projects.get(projectId)?.name ?? "" : ""}`.toLowerCase(),
  };
}

export type BoardFilter = { q?: string; person?: string; project?: string; flag?: "overdue" | "today" | "review" | "supplement" };

export function applyFilter(cards: Card[], f: BoardFilter): Card[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return cards.filter((c) => {
    if (q && !c.searchText.includes(q)) return false;
    if (f.person && !c.assignees.some((a) => a.id === f.person)) return false;
    if (f.project && c.project?.id !== f.project) return false;
    if (f.flag === "overdue" && !c.flags.overdue) return false;
    if (f.flag === "today" && !c.flags.dueToday) return false;
    if (f.flag === "review" && !c.flags.review) return false;
    if (f.flag === "supplement" && !c.flags.supplement) return false;
    return true;
  });
}

/** Cột Xong chỉ giữ việc hoàn thành gần đây để bảng không phình mãi; phần còn lại xem ở Danh sách. */
export function recentDone(cards: Card[], updatedAt: Map<string, string>, limit = 20): Card[] {
  const done = cards.filter((c) => c.status === "completed").sort((a, b) => (updatedAt.get(b.id) ?? "").localeCompare(updatedAt.get(a.id) ?? "")).slice(0, limit);
  const keep = new Set(done.map((c) => c.id));
  return cards.filter((c) => c.status !== "completed" || keep.has(c.id));
}

// ---- Lịch ----
export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** Thứ Hai của tuần chứa ngày d. */
export function weekStart(d: string): string {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = CN
  return addDays(d, -((dow + 6) % 7));
}
export function monthGrid(anchor: string): { weeks: string[][]; month: string } {
  const first = `${anchor.slice(0, 7)}-01`;
  let s = weekStart(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(s, i)));
    s = addDays(s, 7);
    if (s.slice(0, 7) > anchor.slice(0, 7)) break;
  }
  return { weeks, month: anchor.slice(0, 7) };
}

export type CalItem = { card: Card; from: string; to: string; milestone: boolean };
export function calendarItems(cards: Card[]): { items: CalItem[]; unscheduled: Card[] } {
  const items: CalItem[] = []; const unscheduled: Card[] = [];
  for (const c of cards) {
    if (c.status === "cancelled") continue;
    if (c.start && c.due) items.push({ card: c, from: c.start <= c.due ? c.start : c.due, to: c.start <= c.due ? c.due : c.start, milestone: false });
    else if (c.due) items.push({ card: c, from: c.due, to: c.due, milestone: true });
    else if (c.start) items.push({ card: c, from: c.start, to: c.start, milestone: true });
    else if (c.status !== "completed") unscheduled.push(c);
  }
  return { items, unscheduled };
}

/** Xếp các thanh vào một tuần (7 cột): trả về mỗi mục với cột bắt đầu/kết thúc (1–7) và làn. */
export function layoutWeek(days: string[], items: CalItem[]): { item: CalItem; col: number; span: number; lane: number; clipL: boolean; clipR: boolean }[] {
  const first = days[0]!; const last = days[6]!;
  const hit = items.filter((i) => i.from <= last && i.to >= first).sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to));
  const lanes: number[] = [];
  const out: { item: CalItem; col: number; span: number; lane: number; clipL: boolean; clipR: boolean }[] = [];
  for (const item of hit) {
    const s = item.from < first ? 0 : days.indexOf(item.from);
    const e = item.to > last ? 6 : days.indexOf(item.to);
    let lane = lanes.findIndex((end) => end < s);
    if (lane < 0) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
    out.push({ item, col: s + 1, span: e - s + 1, lane, clipL: item.from < first, clipR: item.to > last });
  }
  return out;
}

/** Phần của trang Video ứng với bước hiện tại của video. */
export function stepAnchor(stage: Video["stage"]): { anchor: string; label: string } | null {
  switch (stage) {
    case "idea": case "preparing": return { anchor: "panel-content", label: "Mở bước chuẩn bị Content" };
    case "handover": return { anchor: "panel-handover", label: "Mở bước bàn giao" };
    case "editing": return { anchor: "panel-edit", label: "Mở bước dựng" };
    case "review": return { anchor: "panel-review", label: "Mở bước duyệt" };
    case "ready": return { anchor: "panel-review", label: "Mở bước đăng kênh" };
    default: return null;
  }
}
