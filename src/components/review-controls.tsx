"use client";
import { useActionState, useState } from "react";
import { reviewTaskAction } from "@/app/(app)/task-actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

/** Nút duyệt / trả lại cho quản lý (chỉ hiển thị với việc đang chờ duyệt). */
export function ReviewControls({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [state, action] = useActionState(reviewTaskAction, null);
  const [returning, setReturning] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {!returning ? (
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="decision" value="approve" />
          <SubmitButton size="sm" pendingText="Đang duyệt…">Duyệt hoàn tất</SubmitButton>
          <Button type="button" size="sm" variant="outline" onClick={() => setReturning(true)}>Trả lại…</Button>
        </form>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-md border bg-muted/50 p-3">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="decision" value="return" />
          <Label htmlFor={`r-${taskId}`}>Lý do trả lại (bắt buộc)</Label>
          <Textarea id={`r-${taskId}`} name="reason" required rows={2} />
          <div className="flex items-center gap-2">
            <Label htmlFor={`rp-${taskId}`} className="text-xs">Đặt lại tiến độ</Label>
            <Input id={`rp-${taskId}`} name="progress" type="number" min={0} max={99} defaultValue={90} className="w-20" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className="flex gap-2">
            <SubmitButton size="sm" variant="destructive" pendingText="Đang gửi…">Xác nhận trả lại</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReturning(false)}>Hủy</Button>
          </div>
        </form>
      )}
      <FormMessage state={state} />
    </div>
  );
}
