"use client";
import { useActionState, useEffect, useRef } from "react";
import { createAccountAction, resetPasswordAction } from "@/app/(app)/nhan-su/actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { ROLE_LABEL } from "@/lib/labels";
import type { AppRole } from "@/lib/types";

export function AccountCreateForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createAccountAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2" aria-label="Tạo tài khoản nhân viên">
      <Field label="Họ tên" htmlFor="ac-name"><Input id="ac-name" name="full_name" required maxLength={120} /></Field>
      <Field label="Email đăng nhập" htmlFor="ac-email"><Input id="ac-email" name="email" type="email" required autoComplete="off" /></Field>
      <Field label="Mật khẩu ban đầu" htmlFor="ac-pw" hint="Tối thiểu 8 ký tự; nhân viên tự đổi sau">
        <Input id="ac-pw" name="password" type="text" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Chức danh" htmlFor="ac-title"><Input id="ac-title" name="job_title" placeholder="vd. Content, Editor" /></Field>
      <Field label="Bộ phận" htmlFor="ac-dept">
        <Select id="ac-dept" name="department_id" defaultValue="">
          <option value="">— Không chọn —</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Vai trò</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="roles" value={r} defaultChecked={r === "content"} className="accent-[var(--primary)]" /> {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={state} />
        <div><SubmitButton pendingText="Đang tạo…">Tạo tài khoản</SubmitButton></div>
      </div>
    </form>
  );
}

export function PasswordResetForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex gap-2">
        <Input name="password" type="text" minLength={8} required placeholder="Mật khẩu mới" aria-label="Mật khẩu mới" className="h-8 w-40 text-xs" autoComplete="new-password" />
        <SubmitButton size="sm" variant="outline" pendingText="…">Đặt lại mật khẩu</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
