"use client";
import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import type { ActionResult } from "@/lib/types";

/** Biểu mẫu tải tệp (nhiều tệp) dùng cho tài liệu dự án và chứng từ thu chi. */
export function FileUpload({ action, hidden, kinds, label = "Tải tệp lên", id }: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>; kinds?: [string, string][]; label?: string; id: string;
}) {
  const [state, act] = useActionState(action, null);
  return (
    <form action={act} className="flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="file-upload">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {kinds ? <Field label="Loại" htmlFor={`${id}-kind`}><Select id={`${id}-kind`} name="kind" defaultValue={kinds[0]?.[0]}>{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field> : null}
      <Field label={label} htmlFor={`${id}-file`} hint="Tối đa 5 MB mỗi tệp" className="flex-1"><Input id={`${id}-file`} name="file" type="file" multiple required className="h-auto py-1.5" /></Field>
      <div><SubmitButton variant="outline" pendingText="Đang tải…">Tải lên</SubmitButton></div>
      <div className="sm:basis-full"><FormMessage state={state} /></div>
    </form>
  );
}
