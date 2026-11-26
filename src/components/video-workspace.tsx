"use client";
import { useActionState, useState } from "react";
import { videoAction } from "@/app/(app)/video/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VideoStage } from "@/lib/types";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { ProgressBar } from "@/components/ui/progress";
import { HandoverBadge } from "@/components/status";
import { ITEM_KINDS, ITEM_KIND_LABEL, ITEM_STATUS } from "@/lib/labels";
import { handoverBlockers } from "@/lib/pipeline";
import type { ActionResult, Video } from "@/lib/types";

type Opt = { id: string; name: string };
export type Perms = { isOwner: boolean; isEditor: boolean; isManager: boolean; canApprove: boolean; canPublish: boolean };

/**
 * Khu làm việc của một video: mỗi bước hiện đúng biểu mẫu cho đúng người.
 * Dùng chung một trạng thái kết quả để thông báo không mất khi video chuyển bước.
 */
export function VideoWorkspace({ video: v, perms, contents, editors, channels, today }: {
  video: Video; perms: Perms; contents: Opt[]; editors: Opt[]; channels: Opt[]; today: string;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(videoAction, null);
  const canContent = (perms.isOwner || perms.isManager) && (v.stage === "idea" || v.stage === "preparing");
  const canConfirm = (perms.isEditor || perms.isManager) && v.stage === "handover";
  const canEdit = (perms.isEditor || perms.isManager) && v.stage === "editing";
  const canReview = perms.canApprove && v.stage === "review";
  const canPub = perms.canPublish && v.stage === "ready";
  const blockers = handoverBlockers(v);

  const Hidden = () => <input type="hidden" name="video_id" value={v.id} />;

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sticky top-16 z-10 empty:hidden lg:top-4">
        {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
        {state && state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      </div>

      {/* ---------------- Bước Content ---------------- */}
      <StepCard testId="panel-content" n={1} title="Chuẩn bị Content" description="4 hạng mục + link tài nguyên. Bàn giao khi cả 4 hạng mục Hoàn thành."
        state={stepState(v.stage, ["idea", "preparing"], "preparing")}>
          {v.handover_status === "needs_more" && (v.stage === "preparing" || v.stage === "idea") ? (
            <Alert tone="warning" className="mb-3">Editor yêu cầu bổ sung: {v.editor_note}</Alert>
          ) : null}
          {canContent ? (
            <form action={action} className="flex flex-col gap-3">
              <Hidden />
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {ITEM_KINDS.map((k) => <ItemPicker key={k} kind={k} label={ITEM_KIND_LABEL[k]} value={v.items[k]} />)}
              </div>
              <Field label="Link tài nguyên (Google Drive…)" htmlFor="res-url">
                <Input id="res-url" name="resource_url" type="url" defaultValue={v.resource_url ?? ""} placeholder="https://drive.google.com/…" />
              </Field>
              <Field label="Ghi chú Content" htmlFor="c-note">
                <Textarea id="c-note" name="content_note" rows={2} defaultValue={v.content_note ?? ""} />
              </Field>
              {blockers.length ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Để bàn giao: {blockers.join(" · ")}</p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <SubmitButton name="op" value="save_content" variant="outline" pendingText="Đang lưu…">Lưu</SubmitButton>
                <SubmitButton name="op" value="handover" pendingText="Đang bàn giao…">Lưu & bàn giao cho Editor</SubmitButton>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ITEM_KINDS.map((k) => (
                  <div key={k} className="rounded-lg bg-muted px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{ITEM_KIND_LABEL[k]}</dt>
                    <dd className="font-medium">{ITEM_STATUS[v.items[k]].label}</dd>
                  </div>
                ))}
              </dl>
              <p>Link tài nguyên: {v.resource_url ? <a className="break-all text-primary underline" href={v.resource_url} target="_blank" rel="noreferrer">{v.resource_url}</a> : "—"}</p>
              {v.content_note ? <p>Ghi chú Content: {v.content_note}</p> : null}
            </div>
          )}
      </StepCard>

      {/* ---------------- Bàn giao ---------------- */}
      <StepCard testId="panel-handover" n={2} title="Bàn giao cho Editor" description="Editor kiểm tra tài nguyên, xác nhận đã nhận đủ hoặc yêu cầu bổ sung."
        state={stepState(v.stage, ["handover"], "handover")} badge={v.handover_status ? <HandoverBadge status={v.handover_status} /> : undefined}>
        <div className="flex flex-col gap-2 text-sm">
          {v.editor_note && v.handover_status !== "needs_more" ? <p>Ghi chú Edit: {v.editor_note}</p> : null}
          {v.supplement_count > 0 ? <p className="text-xs text-muted-foreground">Đã yêu cầu bổ sung {v.supplement_count} lần.</p> : null}
          {canConfirm ? (
            <ConfirmHandover action={action} videoId={v.id} />
          ) : v.stage === "handover" ? (
            <p className="text-muted-foreground">Đang chờ Editor xác nhận.</p>
          ) : null}
        </div>
      </StepCard>

      {/* ---------------- Dựng ---------------- */}
      <StepCard testId="panel-edit" n={3} title="Dựng video" description="Editor cập nhật tiến độ, gắn link bản dựng và nộp duyệt."
        state={stepState(v.stage, ["editing"], "editing")}>
        <div className="flex flex-col gap-3 text-sm">
          {v.review_note && v.stage === "editing" && v.revision_count > 0 ? (
            <Alert tone="warning">Leader yêu cầu sửa (lần {v.revision_count}): {v.review_note}</Alert>
          ) : null}
          <div className="flex items-center gap-2">
            <ProgressBar value={v.edit_progress} className="flex-1" label="Tiến độ dựng" />
            <span className="w-10 text-right tabular-nums">{v.edit_progress}%</span>
          </div>
          {canEdit ? (
            <form action={action} className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <Hidden />
              <Field label="Tiến độ (%)" htmlFor="ed-p">
                <Input id="ed-p" name="progress" type="number" min={0} max={100} defaultValue={v.edit_progress} />
              </Field>
              <Field label="Link bản dựng" htmlFor="ed-url">
                <Input id="ed-url" name="draft_url" type="url" defaultValue={v.draft_url ?? ""} placeholder="https://drive.google.com/file/…" />
              </Field>
              <Field label="Ghi chú" htmlFor="ed-note" className="sm:col-span-2">
                <Textarea id="ed-note" name="note" rows={2} />
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <SubmitButton name="op" value="save_edit" variant="outline" pendingText="Đang lưu…">Cập nhật tiến độ</SubmitButton>
                <SubmitButton name="op" value="submit_review" pendingText="Đang nộp…">Nộp duyệt</SubmitButton>
              </div>
            </form>
          ) : v.draft_url ? (
            <p>Link bản dựng: <a className="break-all text-primary underline" href={v.draft_url} target="_blank" rel="noreferrer">{v.draft_url}</a></p>
          ) : null}
        </div>
      </StepCard>

      {/* ---------------- Duyệt & đăng ---------------- */}
      <StepCard testId="panel-review" n={4} title="Duyệt & đăng kênh" description="Leader duyệt bản dựng hoặc yêu cầu sửa; sau khi duyệt, ghi nhận link video đã đăng."
        state={stepState(v.stage, ["review", "ready"], "ready")}>
        <div className="flex flex-col gap-3 text-sm">
          {v.revision_count > 0 ? <p className="text-xs text-muted-foreground">Số lần yêu cầu sửa: {v.revision_count}</p> : null}
          {canReview ? <ReviewForm action={action} videoId={v.id} /> : v.stage === "review" ? <p className="text-muted-foreground">Đang chờ Leader duyệt.</p> : null}
          {canPub ? (
            <form action={action} className="grid gap-3 sm:grid-cols-3">
              <Hidden />
              <Field label="Link video đã đăng" htmlFor="pub-url" className="sm:col-span-3">
                <Input id="pub-url" name="published_url" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
              </Field>
              <Field label="Ngày đăng" htmlFor="pub-date">
                <Input id="pub-date" name="published_at" type="date" defaultValue={today} />
              </Field>
              <Field label="Kênh" htmlFor="pub-ch" className="sm:col-span-2">
                <Select id="pub-ch" name="channel_id" defaultValue={v.channel_id ?? ""}>
                  <option value="">— Giữ nguyên —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-3"><SubmitButton name="op" value="publish" pendingText="Đang lưu…">Xác nhận đã đăng</SubmitButton></div>
            </form>
          ) : null}
          {v.stage === "published" && v.published_url ? (
            <p>Đã đăng ngày {v.published_at?.split("-").reverse().join("/")}: <a className="break-all text-primary underline" href={v.published_url} target="_blank" rel="noreferrer">{v.published_url}</a></p>
          ) : null}
        </div>
      </StepCard>

      {/* ---------------- Quản lý ---------------- */}
      {(perms.isManager || perms.isOwner) && v.stage !== "published" && v.stage !== "cancelled" ? (
        <Card>
          <CardHeader><CardTitle>Phân công {perms.isManager ? "& điều phối" : ""}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form action={action} className="grid gap-3 sm:grid-cols-3">
              <Hidden />
              <Field label="Content phụ trách" htmlFor="as-c">
                <Select id="as-c" name="content_owner_id" defaultValue={v.content_owner_id ?? ""} disabled={!perms.isManager}>
                  <option value="">— Chưa giao —</option>
                  {contents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                {!perms.isManager ? <input type="hidden" name="content_owner_id" value={v.content_owner_id ?? ""} /> : null}
              </Field>
              <Field label="Editor tiếp nhận" htmlFor="as-e">
                <Select id="as-e" name="editor_id" defaultValue={v.editor_id ?? ""}>
                  <option value="">— Chưa chọn —</option>
                  {editors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="flex items-end"><SubmitButton name="op" value="assign" variant="outline" pendingText="Đang lưu…">Lưu phân công</SubmitButton></div>
            </form>
            {perms.isManager ? <HoldControls action={action} videoId={v.id} onHold={v.stage === "on_hold"} /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}


const ORDER: VideoStage[] = ["idea", "preparing", "handover", "editing", "review", "ready", "published"];
type StepState = "done" | "current" | "todo";
function stepState(stage: VideoStage, from: VideoStage[], doneAfter: VideoStage): StepState {
  if (stage === "on_hold" || stage === "cancelled") return "todo";
  if (from.includes(stage)) return "current";
  return ORDER.indexOf(stage) > ORDER.indexOf(doneAfter) ? "done" : "todo";
}

function StepCard({ n, title, description, state, badge, children, testId }: {
  n: number; title: string; description: string; state: StepState; badge?: React.ReactNode; children?: React.ReactNode; testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        "rounded-xl border bg-card shadow-[var(--shadow-card)] transition-colors",
        state === "current" && "border-primary/40 ring-4 ring-primary/5",
        state === "todo" && "bg-card/60",
      )}
    >
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
            state === "done" ? "bg-primary-soft text-primary" : state === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {state === "done" ? <Check className="size-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn("flex flex-wrap items-center gap-2 text-[15px] font-semibold", state === "todo" && "text-muted-foreground")}>
            {n}. {title} {badge}
            {state === "current" ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">Đang ở bước này</span> : null}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {state === "todo" ? <Lock className="mt-1 size-4 shrink-0 text-muted-foreground/60" aria-label="Chưa tới bước này" /> : null}
      </header>
      {children ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

/** Chọn trạng thái hạng mục bằng 3 nút liền nhau (radio, dùng được bằng bàn phím). */
function ItemPicker({ kind, label, value }: { kind: string; label: string; value: string }) {
  const opts = [["todo", "Chưa làm"], ["doing", "Đang làm"], ["done", "Hoàn thành"]] as const;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium">{label}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {opts.map(([v, l]) => (
          <label key={v} className="relative">
            <input type="radio" name={kind} value={v} defaultChecked={value === v} className="peer sr-only" />
            <span className={cn(
              "block cursor-pointer rounded-md px-1.5 py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
              v === "done" ? "peer-checked:bg-emerald-600 peer-checked:text-white" : v === "doing" ? "peer-checked:bg-amber-400 peer-checked:text-amber-950" : "peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-xs",
            )}>{l}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type FormAction = (fd: FormData) => void;

function ConfirmHandover({ action, videoId }: { action: FormAction; videoId: string }) {
  const [more, setMore] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="video_id" value={videoId} />
      <Label htmlFor="ho-note">{more ? "Cần bổ sung gì? (bắt buộc)" : "Ghi chú Edit (tùy chọn)"}</Label>
      <Textarea id="ho-note" name="note" rows={2} required={more} placeholder={more ? "vd. thiếu cảnh rượt đuổi cận cảnh" : "vd. bổ sung thêm cảnh kịch tính khi dựng"} />
      <div className="flex flex-wrap gap-2">
        {!more ? (
          <>
            <SubmitButton name="op" value="received" pendingText="Đang xác nhận…">Đã nhận đủ</SubmitButton>
            <Button type="button" variant="outline" onClick={() => setMore(true)}>Yêu cầu bổ sung…</Button>
          </>
        ) : (
          <>
            <SubmitButton name="op" value="needs_more" variant="destructive" pendingText="Đang gửi…">Gửi yêu cầu bổ sung</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setMore(false)}>Hủy</Button>
          </>
        )}
      </div>
    </form>
  );
}

function ReviewForm({ action, videoId }: { action: FormAction; videoId: string }) {
  const [revise, setRevise] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="video_id" value={videoId} />
      <Label htmlFor="rv-note">{revise ? "Cần sửa gì? (bắt buộc)" : "Nhận xét (tùy chọn)"}</Label>
      <Textarea id="rv-note" name="note" rows={2} required={revise} />
      <div className="flex flex-wrap gap-2">
        {!revise ? (
          <>
            <SubmitButton name="op" value="approve" pendingText="Đang duyệt…">Duyệt</SubmitButton>
            <Button type="button" variant="outline" onClick={() => setRevise(true)}>Yêu cầu sửa…</Button>
          </>
        ) : (
          <>
            <SubmitButton name="op" value="revise" variant="destructive" pendingText="Đang gửi…">Gửi yêu cầu sửa</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setRevise(false)}>Hủy</Button>
          </>
        )}
      </div>
    </form>
  );
}

function HoldControls({ action, videoId, onHold }: { action: FormAction; videoId: string; onHold: boolean }) {
  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="video_id" value={videoId} />
      <Label htmlFor="hold-r">Lý do tạm dừng / hủy</Label>
      <Input id="hold-r" name="reason" placeholder="vd. chờ bản quyền nguồn" />
      <div className="flex flex-wrap gap-2">
        {onHold ? (
          <SubmitButton name="op" value="resume" variant="outline" size="sm" pendingText="…">Tiếp tục</SubmitButton>
        ) : (
          <SubmitButton name="op" value="hold" variant="outline" size="sm" pendingText="…">Tạm dừng</SubmitButton>
        )}
        <SubmitButton name="op" value="cancel" variant="ghost" size="sm" pendingText="…">Hủy video</SubmitButton>
      </div>
    </form>
  );
}
