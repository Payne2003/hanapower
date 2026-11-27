"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { removeAvatarAction, uploadAvatarAction } from "@/app/(app)/cai-dat/ho-so-actions";
import { Avatar } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const OK = ["image/jpeg", "image/png", "image/webp"];
const MAX = 2 * 1024 * 1024;

/** Chọn ảnh → xem trước → lưu; thay hoặc gỡ ảnh. Lỗi (tệp sai, tải thất bại) giữ nguyên ảnh đang dùng. */
export function AvatarUploader({ name, src }: { name: string; src?: string }) {
  const [state, action] = useActionState(uploadAvatarAction, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [rmMsg, setRmMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (state?.ok) { setPreview(null); if (input.current) input.current.value = ""; } }, [state]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    setLocalErr(null); setRmMsg(null);
    if (!f) { setPreview(null); return; }
    if (!OK.includes(f.type)) { setLocalErr("Chỉ nhận ảnh JPEG, PNG hoặc WebP."); setPreview(null); if (input.current) input.current.value = ""; return; }
    if (f.size > MAX) { setLocalErr("Ảnh tối đa 2 MB."); setPreview(null); if (input.current) input.current.value = ""; return; }
    setPreview(URL.createObjectURL(f));
  };

  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="avatar-uploader">
      {preview ? (
        <span className="relative inline-grid size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-primary" data-testid="avatar-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Xem trước ảnh đại diện" className="size-full object-cover" />
        </span>
      ) : <Avatar name={name} src={src} className="size-20 text-2xl" />}
      <div className="flex min-w-0 flex-col gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2" aria-label="Tải ảnh đại diện">
          <input ref={input} type="file" name="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh đại diện" onChange={(e) => pick(e.target.files?.[0])}
            className="max-w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-card file:px-3 file:py-2 file:text-sm" />
          {preview ? <SubmitButton size="sm" pendingText="Đang lưu…">Lưu ảnh</SubmitButton> : null}
          {preview ? <Button type="button" size="sm" variant="ghost" onClick={() => { setPreview(null); if (input.current) input.current.value = ""; }}>Hủy</Button> : null}
        </form>
        <p className="text-xs text-muted-foreground">JPEG, PNG hoặc WebP, tối đa 2 MB.</p>
        {localErr ? <Alert tone="error">{localErr}</Alert> : null}
        <FormMessage state={state} />
        {src && !preview ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={removing} onClick={() => startRemove(async () => { const r = await removeAvatarAction(); setRmMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" }); })}>Gỡ ảnh</Button>
            {rmMsg ? <span className={rmMsg.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"} role={rmMsg.ok ? "status" : "alert"}>{rmMsg.text}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
