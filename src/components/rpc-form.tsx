"use client";
import { useActionState } from "react";
import { rpcFormAction } from "@/app/(app)/_actions/rpc";
import { argKind, type FormField } from "@/lib/form-spec";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { cn } from "@/lib/utils";

export function FieldInput({ f, id }: { f: FormField; id: string }) {
  const t = f.type ?? "text";
  const common = { id, name: f.name, required: f.required, placeholder: f.placeholder } as const;
  if (t === "textarea") return <Textarea {...common} defaultValue={(f.defaultValue as string) ?? ""} rows={3} />;
  if (t === "select")
    return (
      <Select {...common} defaultValue={(f.defaultValue as string) ?? ""}>
        {f.required ? null : <option value="">— Không chọn —</option>}
        {(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    );
  if (t === "checkbox")
    return (
      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" id={id} name={f.name} defaultChecked={!!f.defaultValue} className="size-4 accent-[var(--primary)]" /> {f.placeholder ?? "Có"}
      </label>
    );
  if (t === "checks")
    return (
      <div className="flex max-h-44 flex-wrap gap-x-4 gap-y-1.5 overflow-auto rounded-lg border bg-card p-2.5 text-sm">
        {(f.options ?? []).map(([v, l]) => (
          <label key={v} className="flex items-center gap-1.5">
            <input type="checkbox" name={f.name} value={v} defaultChecked={Array.isArray(f.defaultValue) && f.defaultValue.includes(v)} className="size-4 accent-[var(--primary)]" /> {l}
          </label>
        ))}
        {(f.options ?? []).length === 0 ? <span className="text-muted-foreground">Chưa có lựa chọn</span> : null}
      </div>
    );
  const htmlType = t === "tags" ? "text" : t === "datetime" ? "datetime-local" : t;
  return (
    <Input
      {...common}
      type={htmlType}
      defaultValue={Array.isArray(f.defaultValue) ? f.defaultValue.join(", ") : ((f.defaultValue as string | number | null) ?? "")}
      min={f.min}
      step={t === "number" ? (f.step ?? "any") : undefined}
      inputMode={t === "number" ? "decimal" : undefined}
    />
  );
}

/** Biểu mẫu gọi một hàm RPC của CSDL (quyền và quy tắc kiểm tra ở CSDL). */
export function RpcForm({
  rpc, fields, fixed, submitLabel = "Lưu", okMessage, revalidate = [], redirectTo, columns = 2, resetOnSuccess = false, className, variant,
}: {
  rpc: string;
  fields: FormField[];
  fixed?: Record<string, unknown>;
  submitLabel?: string;
  okMessage?: string;
  revalidate?: string[];
  redirectTo?: string;
  columns?: 1 | 2 | 3;
  resetOnSuccess?: boolean;
  className?: string;
  variant?: "default" | "outline" | "soft";
}) {
  const [state, action] = useActionState(rpcFormAction, null);
  const spec = fields.map((f) => ({ name: f.name, type: argKind(f) }));
  return (
    <form
      action={action}
      key={resetOnSuccess && state?.ok ? "ok" : "form"}
      className={cn("flex flex-col gap-4", className)}
    >
      <input type="hidden" name="__rpc" value={rpc} />
      <input type="hidden" name="__spec" value={JSON.stringify(spec)} />
      <input type="hidden" name="__fixed" value={JSON.stringify(fixed ?? {})} />
      <input type="hidden" name="__revalidate" value={revalidate.join(",")} />
      <input type="hidden" name="__redirect" value={redirectTo ?? ""} />
      <input type="hidden" name="__ok" value={okMessage ?? ""} />
      <div className={cn("grid gap-4", columns === 1 ? "grid-cols-1" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {fields.map((f) => (
          <Field key={f.name} label={f.label + (f.required ? " *" : "")} htmlFor={`${rpc}-${f.name}`} hint={f.hint} className={cn(f.wide || f.type === "textarea" || f.type === "checks" ? "sm:col-span-full" : undefined)}>
            <FieldInput f={f} id={`${rpc}-${f.name}`} />
          </Field>
        ))}
      </div>
      <FormMessage state={state} />
      <div><SubmitButton variant={variant}>{submitLabel}</SubmitButton></div>
    </form>
  );
}
