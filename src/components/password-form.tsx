"use client";
import { useActionState } from "react";
import { changePasswordAction } from "@/app/(app)/cai-dat/actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <Field label="Mật khẩu mới" htmlFor="pw"><Input id="pw" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <Field label="Nhập lại" htmlFor="pw2"><Input id="pw2" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <FormMessage state={state} />
      <div><SubmitButton pendingText="Đang lưu…">Đổi mật khẩu</SubmitButton></div>
    </form>
  );
}
