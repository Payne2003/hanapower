import Link from "next/link";
import { HandoverBadge, ItemBadge, OverdueBadge, StageBadge } from "@/components/status";
import { ITEM_KINDS, ITEM_KIND_LABEL, STAGE } from "@/lib/labels";
import { contentStatus, isOverdue, itemsDone } from "@/lib/pipeline";
import { formatDate } from "@/lib/dates";
import type { Video } from "@/lib/types";

/** Bảng video giống bảng báo cáo gốc (mỗi video một dòng); trên điện thoại hiện dạng thẻ. */
export function VideoTable({ videos, names, today }: { videos: Video[]; names: Map<string, string>; today: string }) {
  const name = (id: string | null) => (id ? names.get(id) ?? "—" : "—");
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full min-w-[1100px] text-sm" data-testid="video-table">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">STT</th>
              <th className="px-2 py-2 font-medium">Ngày báo cáo</th>
              <th className="px-2 py-2 font-medium">Mã</th>
              <th className="px-2 py-2 font-medium">Tên video</th>
              <th className="px-2 py-2 font-medium">Content</th>
              {ITEM_KINDS.map((k) => <th key={k} className="px-2 py-2 font-medium">{ITEM_KIND_LABEL[k]}</th>)}
              <th className="px-2 py-2 font-medium">Tài nguyên</th>
              <th className="px-2 py-2 font-medium">Trạng thái Content</th>
              <th className="px-2 py-2 font-medium">Editor</th>
              <th className="px-2 py-2 font-medium">Xác nhận bàn giao</th>
              <th className="px-2 py-2 font-medium">Ngày xác nhận</th>
              <th className="px-2 py-2 font-medium">Ghi chú Edit</th>
              <th className="px-2 py-2 font-medium">Giai đoạn</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={v.id} className="border-t align-top hover:bg-muted/40" data-testid="video-row" data-code={v.code}>
                <td className="px-2 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatDate(v.report_date)}</td>
                <td className="px-2 py-2 font-mono text-xs"><Link className="text-primary underline" href={`/video/${v.id}`}>{v.code}</Link></td>
                <td className="px-2 py-2 min-w-48"><Link href={`/video/${v.id}`} className="font-medium hover:underline">{v.title}</Link></td>
                <td className="px-2 py-2 whitespace-nowrap">{name(v.content_owner_id)}</td>
                {ITEM_KINDS.map((k) => <td key={k} className="px-2 py-2"><ItemBadge status={v.items[k]} /></td>)}
                <td className="px-2 py-2">{v.resource_url ? <a className="text-primary underline" href={v.resource_url} target="_blank" rel="noreferrer">Mở</a> : "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{contentStatus(v.stage)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{name(v.editor_id)}</td>
                <td className="px-2 py-2"><HandoverBadge status={v.handover_status} /></td>
                <td className="px-2 py-2 whitespace-nowrap">{formatDate(v.handover_confirmed_at)}</td>
                <td className="px-2 py-2 min-w-40 text-xs">{v.editor_note ?? ""}</td>
                <td className="px-2 py-2"><div className="flex flex-col items-start gap-1"><StageBadge stage={v.stage} />{isOverdue(v, today) ? <OverdueBadge /> : null}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {videos.map((v) => (
          <li key={v.id}>
            <Link href={`/video/${v.id}`} className="block rounded-lg border bg-card p-3" data-testid="video-card" data-code={v.code}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{v.code} · {formatDate(v.report_date)}</p>
                  <p className="font-medium">{v.title}</p>
                </div>
                <StageBadge stage={v.stage} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Content: {name(v.content_owner_id)} · Editor: {name(v.editor_id)} · Hạng mục {itemsDone(v.items)}/4
                {v.handover_status ? ` · ${v.handover_status === "received" ? "Đã nhận đủ" : v.handover_status === "pending" ? "Chờ xác nhận" : "Yêu cầu bổ sung"}` : ""}
              </p>
              {isOverdue(v, today) ? <div className="mt-1"><OverdueBadge /></div> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function VideoKanban({ videos, names, today, stages }: { videos: Video[]; names: Map<string, string>; today: string; stages: Video["stage"][] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" data-testid="video-kanban">
      {stages.map((s) => {
        const col = videos.filter((v) => v.stage === s);
        return (
          <section key={s} aria-label={`Cột ${STAGE[s].label}`} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted p-2">
            <h3 className="px-1 text-sm font-semibold">{STAGE[s].label} <span className="text-muted-foreground">({col.length})</span></h3>
            {col.map((v) => (
              <Link key={v.id} href={`/video/${v.id}`} className="rounded-md border bg-card p-2 text-sm hover:shadow-sm">
                <p className="font-mono text-xs text-muted-foreground">{v.code}</p>
                <p className="font-medium">{v.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s === "idea" || s === "preparing" ? `Content: ${v.content_owner_id ? names.get(v.content_owner_id) : "—"} · ${itemsDone(v.items)}/4` : `Editor: ${v.editor_id ? names.get(v.editor_id) : "—"}`}
                  {s === "editing" ? ` · ${v.edit_progress}%` : ""}
                </p>
                {isOverdue(v, today) ? <div className="mt-1"><OverdueBadge /></div> : null}
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
