"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { myContactAction, saveMyAddressAction } from "@/app/(app)/cai-dat/ho-so-actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Email = { id: string; email: string; is_primary: boolean };
type Phone = { id: string; country_code: string; phone: string; is_primary: boolean };

function RowButton({ op, id, label, confirm, prompt }: { op: string; id: string; label: string; confirm?: string; prompt?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const click = () => {
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData();
    fd.set("op", op); fd.set("id", id);
    if (prompt) { const v = window.prompt(prompt); if (v === null) return; fd.set("email", v); }
    setErr(null);
    start(async () => { const r = await myContactAction(null, fd); if (!r.ok) setErr(r.error); });
  };
  return (<><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={click}>{label}</Button>{err ? <span role="alert" className="basis-full text-xs text-red-700">{err}</span> : null}</>);
}

function AddForm({ op, children, submit, testId }: { op: string; children: React.ReactNode; submit: string; testId: string }) {
  const [state, action] = useActionState(myContactAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3" data-testid={testId}>
      <input type="hidden" name="op" value={op} />
      {children}
      <FormMessage state={state} />
      <div><SubmitButton size="sm" variant="soft" pendingText="Đang lưu…">{submit}</SubmitButton></div>
    </form>
  );
}

export function MyContactForms({ emails, phones }: { emails: Email[]; phones: Phone[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Email cá nhân" className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold">Email cá nhân</h4>
        {emails.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có email cá nhân.</p> : (
          <ul className="flex flex-col gap-2" data-testid="my-emails">{emails.map((e) => (
            <li key={e.id} data-email={e.email} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-all">{e.email}</span>
              {e.is_primary ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Chính</Badge> : <RowButton op="set_primary_email" id={e.id} label="Đặt làm chính" />}
              <RowButton op="edit_email" id={e.id} label="Sửa" prompt="Email mới" />
              <RowButton op="delete_email" id={e.id} label="Xóa" confirm="Xóa email này?" />
            </li>))}</ul>
        )}
        <AddForm op="add_email" submit="Thêm email" testId="add-email">
          <Field label="Email cá nhân" htmlFor="me-email"><Input id="me-email" name="email" type="email" required maxLength={160} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="primary" className="size-4 accent-[var(--primary)]" />Đặt làm email chính</label>
        </AddForm>
      </section>
      <section aria-label="Số điện thoại" className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold">Số điện thoại</h4>
        {phones.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có số điện thoại.</p> : (
          <ul className="flex flex-col gap-2" data-testid="my-phones">{phones.map((x) => (
            <li key={x.id} data-phone={`${x.country_code}${x.phone}`} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">{x.country_code} {x.phone}</span>
              {x.is_primary ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Chính</Badge> : <RowButton op="set_primary_phone" id={x.id} label="Đặt làm chính" />}
              <RowButton op="delete_phone" id={x.id} label="Xóa" confirm="Xóa số điện thoại này?" />
            </li>))}</ul>
        )}
        <AddForm op="add_phone" submit="Thêm số điện thoại" testId="add-phone">
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="Mã QG" htmlFor="me-cc"><Input id="me-cc" name="country" defaultValue="+84" required /></Field>
            <Field label="Số điện thoại" htmlFor="me-ph"><Input id="me-ph" name="phone" inputMode="tel" required /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="primary" className="size-4 accent-[var(--primary)]" />Đặt làm số chính</label>
        </AddForm>
      </section>
    </div>
  );
}

export function MyAddressForm({ address }: { address: string }) {
  const [state, action] = useActionState(saveMyAddressAction, null);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="address-form">
      <Field label="Địa chỉ" htmlFor="me-addr"><Input id="me-addr" name="address" defaultValue={address} maxLength={300} /></Field>
      <FormMessage state={state} />
      <div><SubmitButton size="sm" variant="soft" pendingText="Đang lưu…">Lưu địa chỉ</SubmitButton></div>
    </form>
  );
}
