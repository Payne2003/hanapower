"use client";
import { useActionState } from "react";
import { saveChannelAction } from "@/app/(app)/cai-dat/channel-actions";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import type { Channel } from "@/lib/types";

export function ChannelForm({ channel }: { channel?: Channel }) {
  const [state, action] = useActionState(saveChannelAction, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_1fr_auto_auto] sm:items-center">
        <input type="hidden" name="id" value={channel?.id ?? ""} />
        <Input name="name" defaultValue={channel?.name ?? ""} placeholder="Tên kênh" aria-label="Tên kênh" required />
        <Input name="platform" defaultValue={channel?.platform ?? "YouTube"} aria-label="Nền tảng" />
        <Input name="url" defaultValue={channel?.url ?? ""} placeholder="https://www.youtube.com/@…" aria-label="Link kênh" />
        {channel ? (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={channel.is_active} className="accent-[var(--primary)]" /> Đang dùng</label>
        ) : <span />}
        <SubmitButton size="sm" variant={channel ? "outline" : "default"} pendingText="…">{channel ? "Lưu" : "Thêm kênh"}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
