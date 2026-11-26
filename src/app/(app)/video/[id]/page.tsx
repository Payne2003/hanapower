import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext, can } from "@/lib/auth";
import { getChannels, getPeople, getVideo } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OverdueBadge, StageBadge, StageStepper } from "@/components/status";
import { Avatar } from "@/components/ui/page-header";
import { ChevronLeft } from "lucide-react";
import { VideoWorkspace } from "@/components/video-workspace";
import { CommentForm } from "@/components/comment-form";
import { Alert } from "@/components/ui/alert";
import { formatDate, formatDateTime } from "@/lib/dates";
import { EVENT_LABEL, PRIORITY, STAGE } from "@/lib/labels";
import { isOverdue } from "@/lib/pipeline";

export const metadata: Metadata = { title: "Chi tiết video" };

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [ctx, data, people, channels] = await Promise.all([requireContext(), getVideo(id), getPeople(), getChannels()]);
  if (!data) notFound();
  const { video: v, events, comments } = data;
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const name = (uid: string | null) => (uid ? names.get(uid) ?? "—" : "—");
  const opt = (role: "content" | "editor") => people.filter((p) => p.is_active && p.roles.includes(role)).map((p) => ({ id: p.id, name: p.full_name }));
  const channel = channels.find((c) => c.id === v.channel_id);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/video" className="inline-flex items-center gap-1 hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Video</Link>
        <span aria-hidden>/</span> <span className="font-mono text-foreground">{v.code}</span>
      </nav>

      <header className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono rounded-md bg-muted px-2 py-0.5 text-sm font-medium">{v.code}</span>
              <StageBadge stage={v.stage} />
              {isOverdue(v, ctx.today) ? <OverdueBadge /> : null}
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{v.title}</h1>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-right">
            <div><dt className="text-xs text-muted-foreground">Content</dt><dd className="font-medium" data-testid="owner-name">{name(v.content_owner_id)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Editor</dt><dd className="font-medium" data-testid="editor-name">{name(v.editor_id)}</dd></div>
          </dl>
        </div>
        <StageStepper stage={v.stage} />
        {v.stage === "on_hold" || v.stage === "cancelled" ? <Alert tone="warning">{STAGE[v.stage].label}{v.hold_reason ? `: ${v.hold_reason}` : ""}</Alert> : null}
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <VideoWorkspace
          video={v}
          today={ctx.today}
          perms={{
            isOwner: v.content_owner_id === ctx.user_id,
            isEditor: v.editor_id === ctx.user_id,
            isManager: can(ctx, "videos.manage_all"),
            canApprove: can(ctx, "videos.approve"),
            canPublish: can(ctx, "videos.publish"),
          }}
          contents={opt("content")}
          editors={opt("editor")}
          channels={channels.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))}
        />

        <aside className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          <Card>
            <CardHeader><CardTitle>Thông tin</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Ngày báo cáo</dt><dd>{formatDate(v.report_date)}</dd>
                <dt className="text-muted-foreground">Hạn đăng</dt><dd>{formatDate(v.due_date)}</dd>
                <dt className="text-muted-foreground">Ưu tiên</dt><dd className={PRIORITY[v.priority].tone}>{PRIORITY[v.priority].label}</dd>
                <dt className="text-muted-foreground">Kênh</dt><dd>{channel?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Bổ sung</dt><dd>{v.supplement_count} lần</dd>
                <dt className="text-muted-foreground">Sửa bản dựng</dt><dd>{v.revision_count} lần</dd>
              </dl>
              {v.brief ? <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{v.brief}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Trao đổi ({comments.length})</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5"><Avatar name={name(c.author_id)} className="mt-0.5" /><div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2">
                    <p className="text-xs text-muted-foreground">{name(c.author_id)} · {formatDateTime(c.created_at, ctx.timezone)}</p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div></li>
                ))}
              </ul>
              <CommentForm videoId={v.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lịch sử</CardTitle></CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2 text-sm" data-testid="history">
                {events.map((e) => (
                  <li key={e.id} className="relative border-l-2 border-primary/20 pb-1 pl-4 before:absolute before:top-1.5 before:-left-[5px] before:size-2 before:rounded-full before:bg-primary/60">
                    <p className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}{e.to_stage && e.to_stage !== e.from_stage ? ` → ${STAGE[e.to_stage].label}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{name(e.actor_id)} · {formatDateTime(e.created_at, ctx.timezone)}</p>
                    {e.note ? <p className="text-xs">{e.note}</p> : null}
                  </li>
                ))}
                {events.length === 0 ? <li className="text-muted-foreground">Chưa có thao tác.</li> : null}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
