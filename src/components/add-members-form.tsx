"use client";
import { useActionState } from "react";
import { addMembersAction } from "@/app/(app)/task-actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function AddMembersForm({ projectId, candidates }: { projectId: string; candidates: { id: string; full_name: string }[] }) {
  const [state, action] = useActionState(addMembersAction, null);
  if (candidates.length === 0) return <p className="text-xs text-muted-foreground">Tất cả nhân sự đã là thành viên.</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2">
        {candidates.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="user_ids" value={c.id} className="accent-[var(--primary)]" /> {c.full_name}
          </label>
        ))}
      </div>
      <FormMessage state={state} />
      <div><SubmitButton size="sm" variant="outline" pendingText="Đang thêm…">Thêm thành viên</SubmitButton></div>
    </form>
  );
}
