"use client";
import { useActionState, useEffect, useRef } from "react";
import { videoAction } from "@/app/(app)/video/actions";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function CommentForm({ videoId }: { videoId: string }) {
  const [state, action] = useActionState(videoAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="video_id" value={videoId} />
      <Textarea name="body" rows={2} aria-label="Bình luận" placeholder="Trao đổi về video này…"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit(); }} />
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <div><SubmitButton name="op" value="comment" size="sm" variant="outline" pendingText="Đang gửi…">Gửi (Ctrl+Enter)</SubmitButton></div>
    </form>
  );
}
