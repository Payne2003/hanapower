"use client";
import { useActionState, useEffect, useRef } from "react";
import { uploadDocumentAction } from "@/app/(app)/nhan-su/doc-actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function DocumentUploadForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(uploadDocumentAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2" aria-label="Tải tài liệu lên hồ sơ">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" required aria-label="Chọn tệp" className="max-w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-card file:px-3 file:py-2 file:text-sm" />
        <SubmitButton size="sm" pendingText="Đang tải lên…">Tải lên</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">Tối đa 5 MB mỗi tệp. Chỉ quản trị và nhân sự được tải lên.</p>
      <FormMessage state={state} />
    </form>
  );
}
