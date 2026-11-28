import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, FileSpreadsheet, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireContext, can } from "@/lib/auth";
import { getChannels, getPeople, getVideo, getVideos } from "@/lib/queries";
import { inQuickView, monthRange, parsePersonFilter, parseQuickView, quickViewCounts, shiftMonth } from "@/lib/pipeline";
import { PIPELINE, STAGE } from "@/lib/labels";
import { EmptyState } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { VideoCreateForm } from "@/components/video-create-form";
import { VideoBoard, type PersonInfo } from "@/components/video-board";
import { VideoToolbar, ViewToggle } from "@/components/video-toolbar";
import type { VideoStage } from "@/lib/types";

export const metadata: Metadata = { title: "Video" };

type SP = { thang?: string; giai_doan?: string; nguoi?: string; xem?: string; loc?: string; q?: string; chon?: string; tao?: string };

export default async function VideosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const peopleP = getPeople();
  const channelsP = getChannels();
  peopleP.catch(() => undefined);
  channelsP.catch(() => undefined);
  const ctx = await requireContext();
  const all = sp.thang === "tat-ca";
  const month = !all && sp.thang && /^\d{4}-\d{2}$/.test(sp.thang) ? sp.thang : ctx.today.slice(0, 7);
  const range = all ? {} : monthRange(month);
  const who = parsePersonFilter(sp.nguoi, ctx.user_id);
  const stage = sp.giai_doan && sp.giai_doan in STAGE ? (sp.giai_doan as VideoStage) : undefined;
  const view = parseQuickView(sp.loc);
  const q = (sp.q ?? "").slice(0, 80);
  const [byMonth, people, channels] = await Promise.all([getVideos({ ...range, stage, person: who.id, personRole: who.role, q }), peopleP, channelsP]);
  const counts = quickViewCounts(byMonth); // bộ đếm tính trên tập đã lọc tháng / tìm kiếm / người / giai đoạn, trước khi chọn góc nhìn
  const videos = byMonth.filter((v) => inQuickView(v, view));
  const selectedId = sp.chon && /^[0-9a-f-]{36}$/i.test(sp.chon) ? sp.chon : null;
  const selectedVideo = selectedId && !videos.some((v) => v.id === selectedId) ? ((await getVideo(selectedId))?.video ?? null) : null;

  const info: Record<string, PersonInfo> = Object.fromEntries(people.map((p) => [p.id, { name: p.full_name, avatarVersion: p.avatar_updated_at ?? null }]));
  const kanban = sp.xem === "kanban";
  const isManager = can(ctx, "videos.manage_all");
  const opt = (role: "content" | "editor") => people.filter((p) => p.is_active && p.roles.includes(role)).map((p) => ({ id: p.id, name: p.full_name }));
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(ctx.today.slice(0, 7), -i));
  if (!all && !months.includes(month)) months.push(month);
  const personName = who.id ? (info[who.id]?.name ?? null) : null;
  const personRole = who.role === "content" ? "Content" : who.role === "editor" ? "Editor" : "Content hoặc Editor";
  const monthLabel = all ? "tất cả các tháng" : `tháng ${month.slice(5)}/${month.slice(0, 4)}`;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/video${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Quản lý sản xuất video"
        description={<span data-testid="video-count">{videos.length} video · {monthLabel}</span>}
        actions={
          <>
            {isManager ? <Link href="/video/nhap" className={buttonVariants({ variant: "outline" })}><FileSpreadsheet aria-hidden />Nhập từ Excel</Link> : null}
            <ViewToggle kanban={kanban} />
            {can(ctx, "videos.create") ? <Link href={keep({ tao: "1", chon: undefined })} className={buttonVariants({})} data-testid="create-video"><Plus aria-hidden />Tạo video</Link> : null}
          </>
        }
      />

      {can(ctx, "videos.create") && sp.tao === "1" ? (
        <section aria-label="Tạo video mới" className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]" data-testid="create-panel">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Tạo video mới</h2>
            <Link href={keep({ tao: undefined })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted"><X className="size-4" aria-hidden />Đóng</Link></div>
          <VideoCreateForm isManager={isManager} selfId={ctx.user_id} contents={opt("content")} editors={opt("editor")} channels={channels.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))} />
        </section>
      ) : null}

      <VideoToolbar
        month={all ? null : month}
        months={months.map((m) => ({ value: m, label: `Tháng ${m.slice(5)}/${m.slice(0, 4)}` }))}
        stages={[...PIPELINE, "on_hold" as const, "cancelled" as const].map((s) => ({ value: s, label: STAGE[s].label }))}
        contents={opt("content").map((p) => ({ value: p.id, label: p.name }))}
        editors={opt("editor").map((p) => ({ value: p.id, label: p.name }))}
        counts={counts}
        personLabel={personName}
        personRoleLabel={personName ? personRole : null}
      />

      {videos.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title="Không có video nào"
          description={view !== "tat-ca" || q || who.id || stage ? "Không có video khớp tìm kiếm và bộ lọc hiện tại — thử bỏ bớt bộ lọc." : all ? "Chưa có video. Tạo video đầu tiên để bắt đầu." : `Không có video có ngày báo cáo trong ${monthLabel}.`}
        >
          {view !== "tat-ca" || q || who.id || stage ? <Link href="/video"><Button variant="outline">Bỏ lọc</Button></Link> : null}
        </EmptyState>
      ) : null}

      {videos.length > 0 || selectedVideo ? (
        <VideoBoard
          key={`${kanban}`}
          videos={videos}
          selectedVideo={selectedVideo}
          kanban={kanban}
          stages={stage ? [stage] : [...PIPELINE, "on_hold"]}
          people={info}
          today={ctx.today}
          perms={{ userId: ctx.user_id, isManager }}
          contents={opt("content")}
          editors={opt("editor")}
          initialSelected={selectedId}
        />
      ) : null}
    </div>
  );
}
