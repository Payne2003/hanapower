"use client";
import { useActionState } from "react";
import { setActiveAction, setRolesAction } from "@/app/(app)/nhan-su/actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { ROLE_LABEL } from "@/lib/labels";
import type { AppRole } from "@/lib/types";

export function RoleEditor({ userId, roles, active, self }: { userId: string; roles: AppRole[]; active: boolean; self: boolean }) {
  const [state, action] = useActionState(setRolesAction, null);
  const [stateA, actionA] = useActionState(setActiveAction, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input type="hidden" name="user_id" value={userId} />
        {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="roles" value={r} defaultChecked={roles.includes(r)} className="accent-[var(--primary)]" />
            {ROLE_LABEL[r]}
          </label>
        ))}
        <SubmitButton size="sm" variant="outline" pendingText="Đang lưu…">Lưu vai trò</SubmitButton>
      </form>
      {!self ? (
        <form action={actionA}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <SubmitButton size="sm" variant={active ? "ghost" : "outline"} pendingText="Đang xử lý…">{active ? "Khóa tài khoản" : "Mở khóa"}</SubmitButton>
        </form>
      ) : null}
      <FormMessage state={state} />
      <FormMessage state={stateA} />
    </div>
  );
}
