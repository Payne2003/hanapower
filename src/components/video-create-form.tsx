"use client";
import { useActionState } from "react";
import { createVideoAction } from "@/app/(app)/video/actions";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";

type Opt = { id: string; name: string };

export function VideoCreateForm({ isManager, selfId, contents, editors, channels }: {
  isManager: boolean; selfId: string; contents: Opt[]; editors: Opt[]; channels: Opt[];
}) {
  const [state, action] = useActionState(createVideoAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6" aria-label="Tạo video mới">
      <Field label="Tên video / chủ đề" htmlFor="nv-title" className="sm:col-span-4">
        <Input id="nv-title" name="title" required maxLength={300} placeholder="vd. linh cẩu và đàn sư tử" />
      </Field>
      <Field label="Kênh" htmlFor="nv-channel" className="sm:col-span-2">
        <Select id="nv-channel" name="channel_id" defaultValue={channels[0]?.id ?? ""}>
          <option value="">— Chưa chọn —</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Ý tưởng / yêu cầu" htmlFor="nv-brief" className="sm:col-span-6">
        <Textarea id="nv-brief" name="brief" rows={2} placeholder="Góc kể chuyện, video tham khảo, lưu ý…" />
      </Field>
      <Field label="Content phụ trách" htmlFor="nv-owner" className="sm:col-span-2">
        {isManager ? (
          <Select id="nv-owner" name="content_owner_id" defaultValue="">
            <option value="">— Chưa giao —</option>
            {contents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        ) : (
          <>
            <input type="hidden" name="content_owner_id" value={selfId} />
            <Input id="nv-owner" value="Tôi" disabled />
          </>
        )}
      </Field>
      <Field label="Editor tiếp nhận" htmlFor="nv-editor" className="sm:col-span-2">
        <Select id="nv-editor" name="editor_id" defaultValue="">
          <option value="">— Chọn sau —</option>
          {editors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Hạn đăng" htmlFor="nv-due" className="sm:col-span-1">
        <Input id="nv-due" name="due_date" type="date" />
      </Field>
      <Field label="Ưu tiên" htmlFor="nv-pri" className="sm:col-span-1">
        <Select id="nv-pri" name="priority" defaultValue="medium">
          <option value="low">Thấp</option>
          <option value="medium">Bình thường</option>
          <option value="high">Cao</option>
          <option value="urgent">Gấp</option>
        </Select>
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-6">
        <FormMessage state={state} />
        <div><SubmitButton pendingText="Đang tạo…">Tạo video (cấp mã tự động)</SubmitButton></div>
      </div>
    </form>
  );
}
