"use client";
import { useActionState, useState } from "react";
import { videoAction } from "@/app/(app)/video/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div aria-live="polite" className="empty:hidden">
        {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
        {state && state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      </div>

      {/* ---------------- Bước Content ---------------- */}
      <Card data-testid="panel-content">
        <CardHeader>
          <CardTitle>1. Chuẩn bị Content</CardTitle>
          <CardDescription>4 hạng mục + link tài nguyên. Bàn giao khi cả 4 hạng mục Hoàn thành.</CardDescription>
        </CardHeader>
        <CardContent>
          {v.handover_status === "needs_more" && (v.stage === "preparing" || v.stage === "idea") ? (
            <Alert tone="warning" className="mb-3">Editor yêu cầu bổ sung: {v.editor_note}</Alert>
          ) : null}
          {canContent ? (
            <form action={action} className="flex flex-col gap-3">
              <Hidden />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ITEM_KINDS.map((k) => (
                  <Field key={k} label={ITEM_KIND_LABEL[k]} htmlFor={`it-${k}`}>
                    <Select id={`it-${k}`} name={k} defaultValue={v.items[k]}>
                      {(["todo", "doing", "done"] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS[s].label}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
              <Field label="Link tài nguyên (Google Drive…)" htmlFor="res-url">
                <Input id="res-url" name="resource_url" type="url" defaultValue={v.resource_url ?? ""} placeholder="https://drive.google.com/…" />
              </Field>
              <Field label="Ghi chú Content" htmlFor="c-note">
                <Textarea id="c-note" name="content_note" rows={2} defaultValue={v.content_note ?? ""} />
              </Field>
              {blockers.length ? (
                <p className="text-xs text-muted-foreground">Để bàn giao: {blockers.join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="op" value="save_content" variant="outline" pendingText="Đang lưu…">Lưu</SubmitButton>
                <SubmitButton name="op" value="handover" pendingText="Đang bàn giao…">Lưu & bàn giao cho Editor</SubmitButton>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ITEM_KINDS.map((k) => (
                  <div key={k} className="rounded-md bg-muted px-2 py-1.5">
                    <dt className="text-xs text-muted-foreground">{ITEM_KIND_LABEL[k]}</dt>
                    <dd className="font-medium">{ITEM_STATUS[v.items[k]].label}</dd>
                  </div>
                ))}
              </dl>
              <p>Link tài nguyên: {v.resource_url ? <a className="break-all text-primary underline" href={v.resource_url} target="_blank" rel="noreferrer">{v.resource_url}</a> : "—"}</p>
              {v.content_note ? <p>Ghi chú Content: {v.content_note}</p> : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Bàn giao ---------------- */}
      <Card data-testid="panel-handover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">2. Bàn giao cho Editor <HandoverBadge status={v.handover_status} /></CardTitle>
          <CardDescription>Editor kiểm tra tài nguyên, xác nhận đã nhận đủ hoặc yêu cầu bổ sung.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {v.editor_note && v.handover_status !== "needs_more" ? <p>Ghi chú Edit: {v.editor_note}</p> : null}
          {v.supplement_count > 0 ? <p className="text-xs text-muted-foreground">Đã yêu cầu bổ sung {v.supplement_count} lần.</p> : null}
          {canConfirm ? (
            <ConfirmHandover action={action} videoId={v.id} />
          ) : v.stage === "handover" ? (
            <p className="text-muted-foreground">Đang chờ Editor xác nhận.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- Dựng ---------------- */}
      <Card data-testid="panel-edit">
        <CardHeader>
          <CardTitle>3. Dựng video</CardTitle>
          <CardDescription>Editor cập nhật tiến độ, gắn link bản dựng và nộp duyệt.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
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
        </CardContent>
      </Card>

      {/* ---------------- Duyệt & đăng ---------------- */}
      <Card data-testid="panel-review">
        <CardHeader>
          <CardTitle>4. Duyệt & đăng kênh</CardTitle>
          <CardDescription>Leader duyệt bản dựng hoặc yêu cầu sửa; sau khi duyệt, ghi nhận link video đã đăng.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
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
        </CardContent>
      </Card>

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
