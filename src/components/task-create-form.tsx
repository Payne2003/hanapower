"use client";
import { useActionState, useEffect, useRef } from "react";
import { createTaskAction } from "@/app/(app)/task-actions";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function TaskCreateForm({ projectId, members }: { projectId: string; members: { id: string; full_name: string }[] }) {
  const [state, action] = useActionState(createTaskAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-6" aria-label="Giao việc mới">
      <input type="hidden" name="project_id" value={projectId} />
      <Field label="Tên công việc" htmlFor="t-title" className="sm:col-span-6">
        <Input id="t-title" name="title" required maxLength={300} />
      </Field>
      <Field label="Người phụ trách" htmlFor="t-assignee" className="sm:col-span-2">
        <Select id="t-assignee" name="assignee_id" required defaultValue="">
          <option value="" disabled>Chọn thành viên…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
      </Field>
      <Field label="Ưu tiên" htmlFor="t-priority" className="sm:col-span-1">
        <Select id="t-priority" name="priority" defaultValue="medium">
          <option value="low">Thấp</option>
          <option value="medium">Trung bình</option>
          <option value="high">Cao</option>
          <option value="urgent">Khẩn</option>
        </Select>
      </Field>
      <Field label="Hạn" htmlFor="t-due" className="sm:col-span-2">
        <Input id="t-due" name="due_date" type="date" />
      </Field>
      <Field label="Trọng số" htmlFor="t-weight" className="sm:col-span-1" hint="> 0, mặc định 1">
        <Input id="t-weight" name="weight" type="number" min={0.01} step={0.01} defaultValue={1} required />
      </Field>
      <Field label="Mô tả" htmlFor="t-desc" className="sm:col-span-6">
        <Textarea id="t-desc" name="description" rows={2} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-6">
        <FormMessage state={state} />
        <div><SubmitButton pendingText="Đang giao…">Giao việc</SubmitButton></div>
      </div>
    </form>
  );
}
