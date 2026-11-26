"use client";
import { useActionState } from "react";
import { signIn } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email công việc" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="ten@congty.vn" />
      </Field>
      <Field label="Mật khẩu" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang đăng nhập…" className="w-full">Đăng nhập</SubmitButton>
    </form>
  );
}
