"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/(app)/task-actions";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function ProjectCreateForm({ people, today }: { people: { id: string; full_name: string }[]; today: string }) {
  const [state, action] = useActionState(createProjectAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.data) router.push(`/du-an/${state.data}`);
  }, [state, router]);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Tên dự án" htmlFor="pj-name" className="sm:col-span-2">
        <Input id="pj-name" name="name" required maxLength={200} />
      </Field>
      <Field label="Mô tả" htmlFor="pj-desc" className="sm:col-span-2">
        <Textarea id="pj-desc" name="description" rows={2} />
      </Field>
      <Field label="Ngày bắt đầu" htmlFor="pj-start">
        <Input id="pj-start" name="start_date" type="date" defaultValue={today} />
      </Field>
      <Field label="Hạn hoàn thành" htmlFor="pj-due">
        <Input id="pj-due" name="due_date" type="date" />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Thành viên (bạn là quản lý dự án)</legend>
        <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="member_ids" value={p.id} className="accent-[var(--primary)]" /> {p.full_name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2 flex flex-col gap-2">
        <FormMessage state={state} />
        <div><SubmitButton pendingText="Đang tạo…">Tạo dự án</SubmitButton></div>
      </div>
    </form>
  );
}
