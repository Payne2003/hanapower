import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { HandoverBadge, ItemBadge, ItemDots, OverdueBadge, STAGE_DOT, StageBadge } from "@/components/status";
import { Avatar } from "@/components/ui/page-header";
import { ITEM_KINDS, ITEM_KIND_LABEL, STAGE } from "@/lib/labels";
import { contentStatus, isOverdue, itemsDone } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";
import type { Video } from "@/lib/types";
import { cn } from "@/lib/utils";

type Names = Map<string, string>;

function Person({ id, names }: { id: string | null; names: Names }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  const n = names.get(id) ?? "—";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={n} className="size-6 text-[10px]" />{n}</span>;
}

/**
 * Danh sách video: bảng gọn trên màn hình rộng (≥1024px), thẻ trên máy tính bảng/điện thoại.
 */
export function VideoTable({ videos, names, today }: { videos: Video[]; names: Names; today: string }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)] lg:block">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm" data-testid="video-table">
            <thead className="border-b bg-muted/60 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-3 py-3 font-medium">Content</th>
                <th className="px-3 py-3 font-medium">Hạng mục</th>
                <th className="px-3 py-3 font-medium">Editor</th>
                <th className="px-3 py-3 font-medium">Bàn giao</th>
                <th className="px-3 py-3 font-medium">Giai đoạn</th>
                <th className="px-3 py-3 font-medium"><span className="sr-only">Tài nguyên</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {videos.map((v) => (
                <tr key={v.id} className="group align-middle transition-colors hover:bg-primary-soft/40" data-testid="video-row" data-code={v.code}>
                  <td className="max-w-[22rem] px-4 py-3">
                    <Link href={`/video/${v.id}`} className="block">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground/80 group-hover:bg-card">{v.code}</span>
                        {formatDate(v.report_date)}
                      </span>
                      <span className="mt-1 block font-medium leading-snug group-hover:text-primary">{v.title}</span>
                      {v.editor_note ? <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={v.editor_note}>Ghi chú Edit: {v.editor_note}</span> : null}
                    </Link>
                  </td>
                  <td className="px-3 py-3"><Person id={v.content_owner_id} names={names} /></td>
                  <td className="px-3 py-3"><ItemDots items={v.items} /></td>
                  <td className="px-3 py-3"><Person id={v.editor_id} names={names} /></td>
                  <td className="px-3 py-3"><HandoverBadge status={v.handover_status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1"><StageBadge stage={v.stage} />{isOverdue(v, today) ? <OverdueBadge /> : null}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {v.resource_url ? (
                      <a className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft" href={v.resource_url} target="_blank" rel="noreferrer" title="Mở link tài nguyên">
                        Tài nguyên <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {videos.map((v) => (
          <li key={v.id}>
            <Link href={`/video/${v.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]" data-testid="video-card" data-code={v.code}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground/80">{v.code}</span>
                  {formatDate(v.report_date)}
                </span>
                <StageBadge stage={v.stage} />
              </div>
              <p className="font-medium leading-snug">{v.title}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                <span className="flex items-center gap-3">
                  <Person id={v.content_owner_id} names={names} />
                  <span className="text-muted-foreground">→</span>
                  <Person id={v.editor_id} names={names} />
                </span>
                <span className="flex items-center gap-2">
                  {isOverdue(v, today) ? <OverdueBadge /> : null}
                  <ItemDots items={v.items} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Bảng đầy đủ cột như Google Sheet cũ — dùng ở Báo cáo tháng (cuộn ngang trong khung). */
export function SheetTable({ videos, names, today }: { videos: Video[]; names: Names; today: string }) {
  const name = (id: string | null) => (id ? names.get(id) ?? "—" : "—");
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1150px] text-sm" data-testid="sheet-table">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-3 py-2.5 font-medium">STT</th>
              <th className="px-3 py-2.5 font-medium">Ngày báo cáo</th>
              <th className="px-3 py-2.5 font-medium">Mã</th>
              <th className="px-3 py-2.5 font-medium">Tên video</th>
              <th className="px-3 py-2.5 font-medium">Content</th>
              {ITEM_KINDS.map((k) => <th key={k} className="px-3 py-2.5 font-medium">{ITEM_KIND_LABEL[k]}</th>)}
              <th className="px-3 py-2.5 font-medium">Trạng thái Content</th>
              <th className="px-3 py-2.5 font-medium">Editor</th>
              <th className="px-3 py-2.5 font-medium">Xác nhận bàn giao</th>
              <th className="px-3 py-2.5 font-medium">Ngày xác nhận</th>
              <th className="px-3 py-2.5 font-medium">Ghi chú Edit</th>
              <th className="px-3 py-2.5 font-medium">Giai đoạn</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {videos.map((v, i) => (
              <tr key={v.id} className="align-top hover:bg-primary-soft/40" data-testid="video-row" data-code={v.code}>
                <td className="sticky left-0 bg-card px-3 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(v.report_date)}</td>
                <td className="px-3 py-2.5 font-mono text-xs"><Link className="text-primary hover:underline" href={`/video/${v.id}`}>{v.code}</Link></td>
                <td className="px-3 py-2.5 min-w-48 font-medium">{v.title}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{name(v.content_owner_id)}</td>
                {ITEM_KINDS.map((k) => <td key={k} className="px-3 py-2.5"><ItemBadge status={v.items[k]} /></td>)}
                <td className="px-3 py-2.5 whitespace-nowrap">{contentStatus(v.stage)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{name(v.editor_id)}</td>
                <td className="px-3 py-2.5"><HandoverBadge status={v.handover_status} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(v.handover_confirmed_at)}</td>
                <td className="px-3 py-2.5 min-w-44 text-xs">{v.editor_note ?? ""}</td>
                <td className="px-3 py-2.5"><div className="flex flex-col items-start gap-1"><StageBadge stage={v.stage} />{isOverdue(v, today) ? <OverdueBadge /> : null}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VideoKanban({ videos, names, today, stages }: { videos: Video[]; names: Names; today: string; stages: Video["stage"][] }) {
  return (
    <div className="scrollbar-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" data-testid="video-kanban">
      {stages.map((s) => {
        const col = videos.filter((v) => v.stage === s);
        return (
          <section key={s} aria-label={`Cột ${STAGE[s].label}`} className="flex w-[17rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/70 p-2">
            <h3 className="flex items-center gap-2 px-2 pt-1 pb-0.5 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", STAGE_DOT[s])} aria-hidden />
              {STAGE[s].label}
              <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">{col.length}</span>
            </h3>
            {col.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">Trống</p> : null}
            {col.map((v) => {
              const owner = s === "idea" || s === "preparing" ? v.content_owner_id : v.editor_id;
              return (
                <Link key={v.id} href={`/video/${v.id}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:shadow-[var(--shadow-pop)]">
                  <span className="font-mono text-[11px] text-muted-foreground">{v.code}</span>
                  <span className="font-medium leading-snug">{v.title}</span>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 truncate"><Avatar name={owner ? names.get(owner) : null} className="size-5 text-[9px]" />{owner ? names.get(owner) : "Chưa giao"}</span>
                    {s === "idea" || s === "preparing" ? <span className="text-muted-foreground">{itemsDone(v.items)}/4</span> : s === "editing" ? <span className="text-muted-foreground">{v.edit_progress}%</span> : null}
                  </span>
                  {isOverdue(v, today) ? <OverdueBadge /> : null}
                </Link>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
