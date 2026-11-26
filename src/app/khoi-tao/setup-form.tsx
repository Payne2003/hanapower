"use client";
import { useActionState } from "react";
import { bootstrapAction } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

export function SetupForm() {
  const [state, action] = useActionState(bootstrapAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Tên doanh nghiệp" htmlFor="org"><Input id="org" name="org" defaultValue="HANA MEDIA" required /></Field>
      <Field label="Họ tên của bạn" htmlFor="fn"><Input id="fn" name="full_name" required /></Field>
      <Field label="Email đăng nhập" htmlFor="em"><Input id="em" name="email" type="email" required autoComplete="username" /></Field>
      <Field label="Mật khẩu" htmlFor="pw"><Input id="pw" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <Field label="Nhập lại mật khẩu" htmlFor="pw2"><Input id="pw2" name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang khởi tạo…" className="w-full">Khởi tạo hệ thống</SubmitButton>
    </form>
  );
}
