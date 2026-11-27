"use client";
import { useState, useTransition } from "react";
import { rpcCall } from "@/app/(app)/_actions/rpc";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Nút một chạm gọi RPC. `prompt`: hỏi thêm một ghi chú (vd. lý do) và đưa vào tham số `prompt.arg`. */
export function RpcButton({
  rpc, args, label, confirm, prompt, revalidate = [], redirectTo, variant = "outline", size = "sm", className, icon,
}: {
  rpc: string;
  args: Record<string, unknown>;
  label: string;
  confirm?: string;
  prompt?: { text: string; arg: string; required?: boolean };
  revalidate?: string[];
  redirectTo?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const click = () => {
    if (confirm && !window.confirm(confirm)) return;
    const a = { ...args };
    if (prompt) {
      const v = window.prompt(prompt.text);
      if (v === null) return;
      if (prompt.required && !v.trim()) { setErr("Cần nhập nội dung."); return; }
      a[prompt.arg] = v.trim() || null;
    }
    setErr(null);
    start(async () => {
      const r = await rpcCall(rpc, a, revalidate, redirectTo);
      if (r && !r.ok) setErr(r.error);
    });
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} size={size} className={className} onClick={click} disabled={pending} aria-busy={pending}>
        {icon}{pending ? "Đang xử lý…" : label}
      </Button>
      {err ? <span role="alert" className="max-w-xs text-xs text-destructive">{err}</span> : null}
    </span>
  );
}
