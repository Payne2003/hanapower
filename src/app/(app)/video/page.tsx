import type { Metadata } from "next";
import Link from "next/link";
import { requireContext, can } from "@/lib/auth";
import { getChannels, getPeople, getVideos } from "@/lib/queries";
import { monthRange, shiftMonth } from "@/lib/pipeline";
import { PIPELINE, STAGE } from "@/lib/labels";
import { EmptyState } from "@/components/ui/alert";
import { Select } from "@/components/ui/form";
import { Disclosure } from "@/components/disclosure";
import { VideoCreateForm } from "@/components/video-create-form";
import { VideoKanban, VideoTable } from "@/components/video-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Video" };

type SP = { thang?: string; giai_doan?: string; nguoi?: string; xem?: string };

export default async function VideosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const all = sp.thang === "tat-ca";
  const month = !all && sp.thang && /^\d{4}-\d{2}$/.test(sp.thang) ? sp.thang : ctx.today.slice(0, 7);
  const range = all ? {} : monthRange(month);
  const person = sp.nguoi === "toi" ? ctx.user_id : sp.nguoi;
  const stage = sp.giai_doan && sp.giai_doan in STAGE ? sp.giai_doan : undefined;
  const [videos, people, channels] = await Promise.all([
    getVideos({ ...range, stage, person }),
    getPeople(),
    getChannels(),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const kanban = sp.xem === "kanban";
  const isManager = can(ctx, "videos.manage_all");
  const opt = (role: "content" | "editor") => people.filter((p) => p.is_active && p.roles.includes(role)).map((p) => ({ id: p.id, name: p.full_name }));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/video?${p.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Video</h1>
          <p className="text-sm text-muted-foreground">Mỗi video một dòng — như bảng báo cáo & bàn giao Content.</p>
        </div>
        <div role="tablist" aria-label="Kiểu hiển thị" className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          <Link role="tab" aria-selected={!kanban} href={qs({ xem: undefined })} className={cn("rounded px-3 py-1", !kanban && "bg-primary-soft font-medium text-primary")}>Bảng</Link>
          <Link role="tab" aria-selected={kanban} href={qs({ xem: "kanban" })} className={cn("rounded px-3 py-1", kanban && "bg-primary-soft font-medium text-primary")}>Kanban</Link>
        </div>
      </header>

      {can(ctx, "videos.create") ? (
        <Disclosure summary="+ Tạo video mới">
          <VideoCreateForm isManager={isManager} selfId={ctx.user_id} contents={opt("content")} editors={opt("editor")} channels={channels.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))} />
        </Disclosure>
      ) : null}

      <form className="flex flex-wrap items-end gap-2 text-sm" aria-label="Bộ lọc">
        {kanban ? <input type="hidden" name="xem" value="kanban" /> : null}
        <div className="flex items-center gap-1">
          {!all ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ thang: shiftMonth(month, -1) })} aria-label="Tháng trước">‹</Link> : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tháng</span>
            <Select name="thang" defaultValue={all ? "tat-ca" : month} className="w-36">
              <option value="tat-ca">Tất cả</option>
              {Array.from({ length: 12 }, (_, i) => shiftMonth(ctx.today.slice(0, 7), -i)).map((m) => (
                <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>
              ))}
              {!all && !Array.from({ length: 12 }, (_, i) => shiftMonth(ctx.today.slice(0, 7), -i)).includes(month) ? <option value={month}>Tháng {month.slice(5)}/{month.slice(0, 4)}</option> : null}
            </Select>
          </label>
          {!all ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ thang: shiftMonth(month, 1) })} aria-label="Tháng sau">›</Link> : null}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Giai đoạn</span>
          <Select name="giai_doan" defaultValue={stage ?? ""} className="w-40">
            <option value="">Tất cả</option>
            {[...PIPELINE, "on_hold", "cancelled"].map((s) => <option key={s} value={s}>{STAGE[s as keyof typeof STAGE].label}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Người</span>
          <Select name="nguoi" defaultValue={sp.nguoi ?? ""} className="w-40">
            <option value="">Mọi người</option>
            <option value="toi">Của tôi</option>
            {people.filter((p) => p.roles.includes("content") || p.roles.includes("editor")).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </label>
        <button type="submit" className={buttonVariants({ size: "sm" })}>Lọc</button>
      </form>

      {videos.length === 0 ? (
        <EmptyState title="Không có video nào" description={all ? "Chưa có video. Tạo video đầu tiên để bắt đầu." : `Không có video có ngày báo cáo trong tháng ${month.slice(5)}/${month.slice(0, 4)} khớp bộ lọc.`} />
      ) : kanban ? (
        <VideoKanban videos={videos} names={names} today={ctx.today} stages={stage ? [stage as never] : [...PIPELINE, "on_hold"]} />
      ) : (
        <VideoTable videos={videos} names={names} today={ctx.today} />
      )}
      <p className="text-xs text-muted-foreground">{videos.length} video</p>
    </div>
  );
}
