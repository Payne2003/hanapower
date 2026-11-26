import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireContext, can } from "@/lib/auth";
import { getChannels, getPeople, getVideos } from "@/lib/queries";
import { monthRange, shiftMonth } from "@/lib/pipeline";
import { PIPELINE, STAGE } from "@/lib/labels";
import { EmptyState } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { VideoCreateForm } from "@/components/video-create-form";
import { VideoKanban, VideoTable } from "@/components/video-table";
import { VideoFilters, ViewSwitch } from "@/components/video-filters";
import type { VideoStage } from "@/lib/types";

export const metadata: Metadata = { title: "Video" };

type SP = { thang?: string; giai_doan?: string; nguoi?: string; xem?: string };

export default async function VideosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const peopleP = getPeople();
  const channelsP = getChannels();
  // Tránh lỗi 'unhandled rejection' nếu trang chuyển hướng trước khi dùng tới (vẫn ném lỗi khi await).
  peopleP.catch(() => undefined);
  channelsP.catch(() => undefined);
  const ctx = await requireContext();
  const all = sp.thang === "tat-ca";
  const month = !all && sp.thang && /^\d{4}-\d{2}$/.test(sp.thang) ? sp.thang : ctx.today.slice(0, 7);
  const range = all ? {} : monthRange(month);
  const person = sp.nguoi === "toi" ? ctx.user_id : sp.nguoi;
  const stage = sp.giai_doan && sp.giai_doan in STAGE ? (sp.giai_doan as VideoStage) : undefined;
  const [videos, people, channels] = await Promise.all([getVideos({ ...range, stage, person }), peopleP, channelsP]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const kanban = sp.xem === "kanban";
  const isManager = can(ctx, "videos.manage_all");
  const opt = (role: "content" | "editor") => people.filter((p) => p.is_active && p.roles.includes(role)).map((p) => ({ id: p.id, name: p.full_name }));
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(ctx.today.slice(0, 7), -i));
  if (!all && !months.includes(month)) months.push(month);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Video"
        description={`${videos.length} video${all ? "" : ` · tháng ${month.slice(5)}/${month.slice(0, 4)}`} — mỗi video một dòng, như bảng báo cáo & bàn giao Content.`}
        actions={
          <>
            {isManager ? (
              <Link href="/video/nhap" className={buttonVariants({ variant: "outline" })}><FileSpreadsheet aria-hidden />Nhập từ Excel</Link>
            ) : null}
            <ViewSwitch kanban={kanban} />
          </>
        }
      />

      {can(ctx, "videos.create") ? (
        <Disclosure summary="Tạo video mới">
          <VideoCreateForm isManager={isManager} selfId={ctx.user_id} contents={opt("content")} editors={opt("editor")} channels={channels.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))} />
        </Disclosure>
      ) : null}

      <VideoFilters
        month={all ? null : month}
        months={months.map((m) => ({ value: m, label: `Tháng ${m.slice(5)}/${m.slice(0, 4)}` }))}
        stages={[...PIPELINE, "on_hold" as const, "cancelled" as const].map((s) => ({ value: s, label: STAGE[s].label }))}
        people={people.filter((p) => p.roles.includes("content") || p.roles.includes("editor")).map((p) => ({ value: p.id, label: p.full_name }))}
      />

      {videos.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title="Không có video nào"
          description={all ? "Chưa có video. Tạo video đầu tiên để bắt đầu." : `Không có video có ngày báo cáo trong tháng ${month.slice(5)}/${month.slice(0, 4)} khớp bộ lọc.`}
        />
      ) : kanban ? (
        <VideoKanban videos={videos} names={names} today={ctx.today} stages={stage ? [stage] : [...PIPELINE, "on_hold"]} />
      ) : (
        <VideoTable videos={videos} names={names} today={ctx.today} />
      )}
    </div>
  );
}
