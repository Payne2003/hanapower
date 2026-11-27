"use client";
import { useActionState, useTransition, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteEntityAction, saveEntityAction } from "@/app/(app)/_actions/entity";
import type { FormField } from "@/lib/form-spec";
import { Field } from "@/components/ui/form";
import { FieldInput } from "@/components/rpc-form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EntityForm({ entity, id, fields, canWrite = true, submitLabel }: { entity: string; id?: string; fields: FormField[]; canWrite?: boolean; submitLabel?: string }) {
  const [state, action] = useActionState(saveEntityAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="__entity" value={entity} />
      {id ? <input type="hidden" name="__id" value={id} /> : null}
      <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`${entity}-${f.name}`} hint={f.hint} className={cn(f.wide || f.type === "textarea" ? "sm:col-span-full" : undefined)}>
            <FieldInput f={{ ...f, required: f.required }} id={`${entity}-${f.name}`} />
          </Field>
        ))}
      </fieldset>
      <FormMessage state={state} />
      {canWrite ? <div><SubmitButton>{submitLabel ?? (id ? "Lưu thay đổi" : "Thêm mới")}</SubmitButton></div> : <p className="text-sm text-muted-foreground">Bạn chỉ có quyền xem.</p>}
    </form>
  );
}

export function DeleteEntityButton({ entity, id, label = "Xóa" }: { entity: string; id: string; label?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button" variant="outline" size="sm" className="text-destructive" disabled={pending}
        onClick={() => {
          if (!window.confirm("Xóa bản ghi này? Hành động không hoàn tác được từ giao diện.")) return;
          start(async () => { const r = await deleteEntityAction(entity, id); if (r && !r.ok) setErr(r.error); });
        }}
      >
        <Trash2 aria-hidden />{pending ? "Đang xóa…" : label}
      </Button>
      {err ? <span role="alert" className="text-xs text-destructive">{err}</span> : null}
    </span>
  );
}
