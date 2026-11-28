"use client";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CircleDashed, ExternalLink, X } from "lucide-react";
import { videoAction } from "@/app/(app)/video/actions";
import { OverdueBadge, STAGE_DOT, StageBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/page-header";
import { Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/dates";
import { HANDOVER, ITEM_STATUS, STAGE } from "@/lib/labels";
import { checklistDetail, handoverBlockers, handoverInfo, isOverdue, itemsDone, nextStep } from "@/lib/pipeline";
import { avatarSrc } from "@/lib/avatar";
import type { ActionResult, Video } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PersonInfo = { name: string; avatarVersion: string | null };
type Opt = { id: string; name: string };
export type BoardPerms = { userId: string; isManager: boolean };

type Ctx = {
  people: Record<string, PersonInfo>; today: string; perms: BoardPerms; contents: Opt[]; editors: Opt[];
  selectedId: string | null; select: (id: string, from: HTMLElement | null) => void; openChecklist: string | null; setOpenChecklist: (id: string | null) => void;
};

function PersonCell({ id, people, role }: { id: string | null; people: Record<string, PersonInfo>; role: "Content" | "Editor" }) {
  if (!id) {
    return role === "Editor"
      ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-300" data-testid="no-editor"><AlertTriangle className="size-3.5" aria-hidden />Chưa phân công</span>
      : <span className="text-xs text-muted-foreground">Chưa phân công</span>;
  }
  const p = people[id];
  const n = p?.name ?? "—";
  return <span className="inline-flex items-center gap-2"><Avatar name={n} src={avatarSrc(id, p?.avatarVersion)} className="size-7" /><span className="min-w-0 break-words text-sm">{n}</span></span>;
}

/** Hạng mục Content: "4/4" bấm xem hạng mục nào xong, hạng mục nào còn thiếu. */
function ChecklistButton({ v, c, variant }: { v: Video; c: Ctx; variant: "table" | "card" }) {
  const done = itemsDone(v.items);
  const key = `${v.id}:${variant}`; // bảng và thẻ cùng có trong DOM (ẩn theo kích thước) nên khóa mở phải khác nhau
  const open = c.openChecklist === key;
  const items = checklistDetail(v.items);
  return (
    <span className="relative inline-block">
      <button type="button" aria-expanded={open} aria-label={`Hạng mục ${done}/4 — xem chi tiết`} data-testid="checklist-btn"
        onClick={(e) => { e.stopPropagation(); c.setOpenChecklist(open ? null : key); }}
        className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums hover:bg-muted", done === 4 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : done === 0 ? "border-slate-300 bg-slate-50 text-slate-700" : "border-amber-300 bg-amber-50 text-amber-800")}>
        {done}/4 <span className="font-normal">hoàn tất</span>
      </button>
      {open ? (
        <div role="group" aria-label={`Hạng mục của ${v.code}`} data-testid="checklist-popover" onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border bg-card p-2.5 text-xs shadow-[var(--shadow-pop)]">
          <ul className="flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={i.kind} className="flex items-center justify-between gap-2" data-item={i.kind} data-status={i.status}>
                <span className="flex items-center gap-1.5">{i.status === "done" ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <CircleDashed className="size-3.5 text-slate-400" aria-hidden />}{i.label}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 font-medium", ITEM_STATUS[i.status].tone)}>{i.status === "done" ? "Xong" : i.status === "doing" ? "Đang làm" : "Còn thiếu"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}

function HandoverCell({ v }: { v: Video }) {
  const h = handoverInfo(v);
  return (
    <div className="flex flex-col items-start gap-0.5">
      {h.key === "not_sent" ? <span className="rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300">{h.label}</span> : <Badge className={HANDOVER[h.key].tone} data-handover={h.key}>{h.label}</Badge>}
      {h.at && h.atLabel ? <span className="text-[11px] text-muted-foreground">{h.atLabel} {formatDate(h.at.slice(0, 10))}</span> : null}
    </div>
  );
}

function StageCell({ v, c }: { v: Video; c: Ctx }) {
  const step = nextStep(v, { editor: v.editor_id ? c.people[v.editor_id]?.name : null });
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5"><StageBadge stage={v.stage} />{isOverdue(v, c.today) ? <OverdueBadge /> : null}</div>
      <span className={cn("text-xs", step.tone === "action" ? "font-medium text-foreground" : "text-muted-foreground")} data-testid="next-step-cell">{step.text}</span>
    </div>
  );
}

function TitleCell({ v, c }: { v: Video; c: Ctx }) {
  return (
    <div className="min-w-0">
      <button type="button" onClick={(e) => c.select(v.id, e.currentTarget.closest("[data-row]") as HTMLElement | null)} data-testid="select-video"
        className="block max-w-full text-left text-[15px] font-semibold leading-snug text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{v.title}</button>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <Link href={`/video/${v.id}`} onClick={(e) => e.stopPropagation()} className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground/80 hover:text-primary" aria-label={v.code}>{v.code}</Link>
        <span title="Ngày báo cáo">Báo cáo {formatDate(v.report_date)}</span>
        {v.due_date ? <span title="Hạn đăng">· Hạn đăng {formatDate(v.due_date)}</span> : null}
      </span>
    </div>
  );
}

/** Danh sách video: một video một dòng trên laptop, thẻ trên màn hình hẹp. */
function VideoRows({ videos, c }: { videos: Video[]; c: Ctx }) {
  const sel = (v: Video, el: HTMLElement | null) => c.select(v.id, el);
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)] lg:block">
        <div className="scrollbar-thin relative overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm" data-testid="video-table">
            <thead className="border-b bg-muted/60 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Video</th><th className="px-3 py-3 font-medium">Content</th><th className="px-3 py-3 font-medium">Editor</th>
                <th className="px-3 py-3 font-medium">Hạng mục</th><th className="px-3 py-3 font-medium">Bàn giao</th><th className="px-3 py-3 font-medium">Giai đoạn · việc tiếp theo</th>
                <th className="px-3 py-3 font-medium"><span className="sr-only">Tài nguyên</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {videos.map((v) => (
                <tr key={v.id} id={`row-${v.id}`} data-row data-testid="video-row" data-code={v.code} tabIndex={0} aria-selected={c.selectedId === v.id}
                  onClick={(e) => sel(v, e.currentTarget)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); sel(v, e.currentTarget); } }}
                  className={cn("cursor-pointer align-top transition-colors hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", c.selectedId === v.id && "bg-primary-soft/60")}>
                  <td className="max-w-[24rem] px-4 py-3"><TitleCell v={v} c={c} /></td>
                  <td className="px-3 py-3"><PersonCell id={v.content_owner_id} people={c.people} role="Content" /></td>
                  <td className="px-3 py-3"><PersonCell id={v.editor_id} people={c.people} role="Editor" /></td>
                  <td className="px-3 py-3"><ChecklistButton v={v} c={c} variant="table" /></td>
                  <td className="px-3 py-3"><HandoverCell v={v} /></td>
                  <td className="px-3 py-3"><StageCell v={v} c={c} /></td>
                  <td className="px-3 py-3 text-right">{v.resource_url ? <a onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft" href={v.resource_url} target="_blank" rel="noreferrer" data-testid="open-resource">Tài nguyên <ExternalLink className="size-3" aria-hidden /></a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {videos.map((v) => (
          <li key={v.id} id={`card-${v.id}`} data-row data-testid="video-card" data-code={v.code} tabIndex={0} onClick={(e) => sel(v, e.currentTarget)}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); sel(v, e.currentTarget); } }}
            className={cn("flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-ring", c.selectedId === v.id && "ring-2 ring-primary")}>
            <TitleCell v={v} c={c} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"><PersonCell id={v.content_owner_id} people={c.people} role="Content" /><span className="text-muted-foreground">→</span><PersonCell id={v.editor_id} people={c.people} role="Editor" /></div>
            <div className="flex flex-wrap items-start justify-between gap-2 border-t pt-3"><div className="flex items-center gap-3"><ChecklistButton v={v} c={c} variant="card" /><HandoverCell v={v} /></div><StageCell v={v} c={c} /></div>
          </li>
        ))}
      </ul>
    </>
  );
}

function VideoColumns({ videos, stages, c }: { videos: Video[]; stages: Video["stage"][]; c: Ctx }) {
  return (
    <div className="scrollbar-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" data-testid="video-kanban">
      {stages.map((s) => {
        const col = videos.filter((v) => v.stage === s);
        return (
          <section key={s} aria-label={`Cột ${STAGE[s].label}`} className="flex w-[17.5rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/70 p-2">
            <h3 className="flex items-center gap-2 px-2 pt-1 pb-0.5 text-sm font-semibold"><span className={cn("size-2 rounded-full", STAGE_DOT[s])} aria-hidden />{STAGE[s].label}<span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">{col.length}</span></h3>
            {col.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">Trống</p> : null}
            {col.map((v) => (
              <button key={v.id} type="button" id={`row-${v.id}`} data-row data-testid="video-kanban-card" data-code={v.code} onClick={(e) => c.select(v.id, e.currentTarget)} aria-pressed={c.selectedId === v.id}
                className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-ring", c.selectedId === v.id && "ring-2 ring-primary")}>
                <span className="font-semibold leading-snug">{v.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{v.code} · Báo cáo {formatDate(v.report_date)}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><PersonCell id={v.content_owner_id} people={c.people} role="Content" /><PersonCell id={v.editor_id} people={c.people} role="Editor" /></span>
                <span className="flex items-center justify-between gap-2 text-xs"><span className="tabular-nums text-muted-foreground">Hạng mục {itemsDone(v.items)}/4</span>{isOverdue(v, c.today) ? <OverdueBadge /> : null}</span>
                <span className="text-xs text-muted-foreground">{nextStep(v, { editor: v.editor_id ? c.people[v.editor_id]?.name : null }).text}</span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Khung chi tiết
function Panel({ v, c, onClose, closeRef }: { v: Video; c: Ctx; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(videoAction, null);
  const isOwner = v.content_owner_id === c.perms.userId;
  const isEditor = v.editor_id === c.perms.userId;
  const { isManager } = c.perms;
  const h = handoverInfo(v);
  const step = nextStep(v, { editor: v.editor_id ? c.people[v.editor_id]?.name : null, content: v.content_owner_id ? c.people[v.content_owner_id]?.name : null });
  const done = itemsDone(v.items);
  const preparing = v.stage === "idea" || v.stage === "preparing";
  const blockers = handoverBlockers(v);
  const canSend = (isOwner || isManager) && preparing && blockers.length === 0;
  const canConfirm = (isEditor || isManager) && v.stage === "handover";
  const canAssign = v.stage !== "published" && v.stage !== "cancelled" && (isManager || (isOwner && preparing));
  const Hidden = () => <input type="hidden" name="video_id" value={v.id} />;
  const stepTone = { action: "border-primary/40 bg-primary-soft text-primary", wait: "border-violet-300 bg-violet-50 text-violet-900", done: "border-emerald-300 bg-emerald-50 text-emerald-900", paused: "border-orange-300 bg-orange-50 text-orange-900" }[step.tone];

  return (
    <div className="flex h-full flex-col" data-testid="video-panel" data-video={v.code}>
      <header className="flex items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-medium" data-testid="panel-code">{v.code}</span><StageBadge stage={v.stage} />{isOverdue(v, c.today) ? <OverdueBadge /> : null}</div>
          <h2 id="video-panel-title" className="mt-2 text-lg font-semibold leading-snug" data-testid="panel-title">{v.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Báo cáo {formatDate(v.report_date)}{v.due_date ? ` · Hạn đăng ${formatDate(v.due_date)}` : ""}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng chi tiết (Esc)" data-testid="panel-close" className="grid size-9 shrink-0 place-items-center rounded-lg border hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden /></button>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        <p className={cn("rounded-lg border px-3 py-2.5 text-sm font-medium", stepTone)} role="status" data-testid="panel-next-step"><span className="block text-[11px] font-normal uppercase tracking-wide opacity-70">Việc tiếp theo</span>{step.text}</p>
        <div aria-live="polite" className="empty:hidden">
          {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
          {state && state.ok && state.message ? <Alert tone="success" data-testid="panel-message">{state.message}</Alert> : null}
        </div>

        <section aria-label="Người phụ trách" className="grid grid-cols-2 gap-3">
          <div><p className="mb-1 text-xs text-muted-foreground">Content</p><PersonCell id={v.content_owner_id} people={c.people} role="Content" /></div>
          <div><p className="mb-1 text-xs text-muted-foreground">Editor</p><PersonCell id={v.editor_id} people={c.people} role="Editor" /></div>
        </section>

        <section aria-label="Checklist Content" data-testid="panel-checklist">
          <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold">Hạng mục Content <span className="text-xs font-normal tabular-nums text-muted-foreground">{done}/4 hoàn tất</span></h3>
          <ul className="divide-y rounded-lg border text-sm">
            {checklistDetail(v.items).map((i) => (
              <li key={i.kind} className="flex items-center justify-between gap-2 px-3 py-2" data-item={i.kind} data-status={i.status}>
                <span className="flex items-center gap-2">{i.status === "done" ? <Check className="size-4 text-emerald-600" aria-hidden /> : <CircleDashed className="size-4 text-slate-400" aria-hidden />}{i.label}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", ITEM_STATUS[i.status].tone)}>{ITEM_STATUS[i.status].label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Bàn giao" data-testid="panel-handover">
          <h3 className="mb-2 text-sm font-semibold">Bàn giao tài nguyên</h3>
          <div className="flex flex-col gap-1.5 text-sm">
            <HandoverCell v={v} />
            <p className="text-xs text-muted-foreground">Hoàn tất checklist và xác nhận bàn giao là hai sự kiện riêng: Content gửi → Editor xác nhận đã nhận.</p>
            {h.key === "needs_more" && v.editor_note ? <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-900">Editor yêu cầu: {v.editor_note}</p> : null}
            {v.supplement_count > 0 ? <p className="text-xs text-muted-foreground">Đã yêu cầu bổ sung {v.supplement_count} lần.</p> : null}
          </div>
        </section>

        <section aria-label="Tài nguyên" data-testid="panel-resources">
          <h3 className="mb-2 text-sm font-semibold">Tài nguyên</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {v.resource_url ? <li><a className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" href={v.resource_url} target="_blank" rel="noreferrer" data-testid="panel-open-resource">Mở link tài nguyên Content <ExternalLink className="size-3.5" aria-hidden /></a></li> : <li className="text-muted-foreground">Content chưa thêm link tài nguyên.</li>}
            {v.draft_url ? <li><a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={v.draft_url} target="_blank" rel="noreferrer">Bản dựng <ExternalLink className="size-3.5" aria-hidden /></a></li> : null}
            {v.published_url ? <li><a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={v.published_url} target="_blank" rel="noreferrer">Video đã đăng <ExternalLink className="size-3.5" aria-hidden /></a></li> : null}
          </ul>
        </section>

        {(canSend || canConfirm || canAssign || (preparing && (isOwner || isManager) && blockers.length)) ? (
          <section aria-label="Hành động" className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4" data-testid="panel-actions">
            <h3 className="text-sm font-semibold">Hành động</h3>
            {canSend ? (
              <form action={action}><Hidden /><SubmitButton name="op" value="send_handover" pendingText="Đang gửi…" className="w-full" data-testid="act-send-handover">Gửi bàn giao cho Editor</SubmitButton></form>
            ) : preparing && (isOwner || isManager) && blockers.length ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="handover-blockers">Để gửi bàn giao: {blockers.join(" · ")}. <Link className="font-medium text-primary underline" href={`/video/${v.id}`}>Mở trang video để cập nhật Content</Link></p>
            ) : null}
            {canConfirm ? (
              <div className="flex flex-col gap-3">
                <form action={action}><Hidden /><SubmitButton name="op" value="received" pendingText="Đang xác nhận…" className="w-full" data-testid="act-confirm-received">Xác nhận đã nhận đủ</SubmitButton></form>
                <form action={action} className="flex flex-col gap-2"><Hidden />
                  <label className="text-xs font-medium" htmlFor={`nm-${v.id}`}>Yêu cầu Content bổ sung (ghi rõ thiếu gì)</label>
                  <textarea id={`nm-${v.id}`} name="note" rows={2} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                  <SubmitButton name="op" value="needs_more" variant="outline" pendingText="Đang gửi…" data-testid="act-needs-more">Gửi yêu cầu bổ sung</SubmitButton>
                </form>
              </div>
            ) : null}
            {canAssign ? (
              <form action={action} className="flex flex-col gap-2"><Hidden />
                <label className="text-xs font-medium" htmlFor={`as-ed-${v.id}`}>{v.editor_id ? "Đổi Editor" : "Chọn Editor"}</label>
                <Select id={`as-ed-${v.id}`} name="editor_id" defaultValue={v.editor_id ?? ""} data-testid="assign-editor"><option value="">— Chưa phân công —</option>{c.editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
                {isManager ? (<><label className="text-xs font-medium" htmlFor={`as-ct-${v.id}`}>Content phụ trách</label>
                  <Select id={`as-ct-${v.id}`} name="content_owner_id" defaultValue={v.content_owner_id ?? ""}><option value="">— Chưa phân công —</option>{c.contents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></>) : <input type="hidden" name="content_owner_id" value={v.content_owner_id ?? ""} />}
                <SubmitButton name="op" value="assign" variant="outline" pendingText="Đang lưu…" data-testid="act-assign">Lưu phân công</SubmitButton>
              </form>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="border-t p-4"><Link href={`/video/${v.id}`} className="inline-flex h-10 w-full items-center justify-center rounded-lg border bg-card text-sm font-medium hover:bg-muted" data-testid="open-detail-page">Mở trang chi tiết video</Link></footer>
    </div>
  );
}

/**
 * Bảng / Kanban + khung chi tiết bên phải (ngăn trượt). Chọn video không điều hướng trang: URL cập nhật (chon=…) để chia sẻ / tải lại,
 * Esc đóng khung và trả focus về đúng dòng. Sau thao tác thành công, máy chủ làm mới dữ liệu → dòng, khung và bộ đếm đổi đồng thời.
 */
export function VideoBoard({ videos, selectedVideo, kanban, stages, people, today, perms, contents, editors, initialSelected }: {
  videos: Video[]; selectedVideo: Video | null; kanban: boolean; stages: Video["stage"][]; people: Record<string, PersonInfo>; today: string; perms: BoardPerms;
  contents: Opt[]; editors: Opt[]; initialSelected: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);
  const lastRow = useRef<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const syncUrl = (id: string | null) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("chon", id); else u.searchParams.delete("chon");
    window.history.replaceState(null, "", u.pathname + u.search); // null: để Next đồng bộ URL (tải lại / làm mới máy chủ thấy chon=…)
  };
  const select = useCallback((id: string, el: HTMLElement | null) => {
    void el;
    lastRow.current = id;
    setSelectedId(id); setOpenChecklist(null); syncUrl(id);
  }, []);
  const close = useCallback(() => {
    const id = selectedId ?? lastRow.current;
    setSelectedId(null); syncUrl(null);
    // trả focus về dòng vừa chọn (sau khi khung đã gỡ)
    setTimeout(() => {
      if (!id) return;
      // bảng, thẻ và Kanban cùng có thể có trong DOM — focus phần tử đang hiển thị
      const el = [`row-${id}`, `card-${id}`].map((x) => document.getElementById(x)).find((e) => e && e.offsetParent !== null);
      el?.focus();
    }, 30);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openChecklist) { setOpenChecklist(null); return; }
      if (selectedId) { e.preventDefault(); close(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, openChecklist, close]);
  useEffect(() => {
    if (!openChecklist) return;
    const off = () => setOpenChecklist(null);
    window.addEventListener("click", off);
    return () => window.removeEventListener("click", off);
  }, [openChecklist]);
  useEffect(() => { if (selectedId) closeRef.current?.focus(); }, [selectedId]);

  const current = selectedId ? (videos.find((v) => v.id === selectedId) ?? (selectedVideo?.id === selectedId ? selectedVideo : null)) : null;
  const c: Ctx = { people, today, perms, contents, editors, selectedId, select, openChecklist, setOpenChecklist };

  return (
    <>
      {kanban ? <VideoColumns videos={videos} stages={stages} c={c} /> : <VideoRows videos={videos} c={c} />}
      {current ? (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={close} aria-hidden data-testid="panel-overlay" />
          <aside role="dialog" aria-modal="false" aria-labelledby="video-panel-title" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[28rem] flex-col border-l bg-card shadow-xl sm:w-[28rem]" data-testid="video-panel-shell">
            <Panel key={current.id} v={current} c={c} onClose={close} closeRef={closeRef} />
          </aside>
        </>
      ) : null}
    </>
  );
}
