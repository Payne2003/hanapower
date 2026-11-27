"use client";
import { useActionState, useEffect, useRef } from "react";
import { submitRequestDocumentAction } from "@/app/(app)/cai-dat/ho-so-actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

/** Nộp / thay tệp cho một yêu cầu tài liệu. Chỉ gửi mã yêu cầu + tệp; người nộp lấy từ phiên đăng nhập. */
export function RequestUpload({ requestId, exts, maxMb, replace }: { requestId: string; exts: string[]; maxMb: number; replace: boolean }) {
  const [state, action] = useActionState(submitRequestDocumentAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-1.5" aria-label={replace ? "Nộp bản thay thế" : "Nộp tài liệu"}>
      <input type="hidden" name="request_id" value={requestId} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" required accept={exts.map((e) => `.${e}`).join(",")} aria-label="Chọn tệp" className="max-w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-card file:px-3 file:py-1.5 file:text-sm" />
        <SubmitButton size="sm" pendingText="Đang tải lên…">{replace ? "Nộp bản thay thế" : "Nộp tài liệu"}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">Định dạng: {exts.join(", ")} · tối đa {maxMb} MB.</p>
      <FormMessage state={state} />
    </form>
  );
}
