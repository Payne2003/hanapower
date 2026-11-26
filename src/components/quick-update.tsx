"use client";
import { useActionState, useId, useState } from "react";
import { updateProgressAction } from "@/app/(app)/task-actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Input, Label, Textarea } from "@/components/ui/form";
import type { TaskStatus } from "@/lib/types";

/** Biểu mẫu cập nhật nhanh tiến độ cho người phụ trách. */
export function QuickUpdate({ taskId, progress, status, blocker }: {
  taskId: string; progress: number; status: TaskStatus; blocker: string | null;
}) {
  const [state, action] = useActionState(updateProgressAction, null);
  const [value, setValue] = useState(progress);
  const id = useId();
  const locked = status === "in_review" || status === "done";
  if (locked) {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "in_review" ? "Đang chờ quản lý duyệt — chưa thể đổi tiến độ." : "Công việc đã hoàn tất."}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Cập nhật nhanh tiến độ">
      <input type="hidden" name="task_id" value={taskId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-p`}>Tiến độ: <span className="tabular-nums">{value}%</span></Label>
        <div className="flex items-center gap-3">
          <input
            id={`${id}-p`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="h-2 flex-1 accent-[var(--primary)]"
            aria-describedby={`${id}-hint`}
          />
          <Input name="progress" type="number" min={0} max={100} value={value}
            onChange={(e) => setValue(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-20 tabular-nums" aria-label="Tiến độ (%)" />
        </div>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">Báo 100% sẽ chuyển công việc sang “Chờ duyệt”.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-n`}>Ghi chú kết quả</Label>
          <Textarea id={`${id}-n`} name="note" rows={2} placeholder="Đã làm được gì?" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-b`}>Vướng mắc (nếu có)</Label>
          <Textarea id={`${id}-b`} name="blocker" rows={2} defaultValue={blocker ?? ""} placeholder="Để trống nếu không có" />
        </div>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton size="sm" pendingText="Đang lưu…">Cập nhật</SubmitButton></div>
    </form>
  );
}
