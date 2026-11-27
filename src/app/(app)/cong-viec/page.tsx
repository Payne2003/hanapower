import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { loadBoard } from "@/lib/work-board-data";
import { applyFilter, recentDone, stepAnchor, type BoardFilter, type Card } from "@/lib/work-board";
import { opts, badge, TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from "@/lib/status-maps";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/ui/alert";
import { WorkBoard } from "@/components/work-board";
import { WorkCalendar } from "@/components/work-calendar";
import { WorkCardBody } from "@/components/work-card";
import { WorkDrawer } from "@/components/work-drawer";

export const metadata: Metadata = { title: "Công việc" };

const TABS = [["cho", "Danh sách chờ"], ["bang", "Bảng công việc"], ["lich", "Lịch sản xuất"], ["toi", "Việc của tôi"]] as const;
type Tab = (typeof TABS)[number][0];
const VIEWS: [string, string][] = [["dang-lam", "Đang làm"], ["xong", "Hoàn thành / hủy"], ["tat-ca", "Tất cả"]];
const FLAGS: [string, string][] = [["", "Tất cả việc"], ["overdue", "Quá hạn"], ["today", "Đến hạn hôm nay"], ["review", "Chờ duyệt"], ["supplement", "Cần bổ sung"]];

type SP = { tab?: string; q?: string; nguoi?: string; duan?: string; xem?: string; loc?: string; v?: string; lich?: string; ngay?: string; the?: string };

function qs(p: Record<string, string | undefined>) {
  const e = Object.entries(p).filter(([, v]) => v);
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "bang";
  const flag = FLAGS.some(([k]) => k === sp.loc) && sp.loc ? (sp.loc as BoardFilter["flag"]) : undefined;
  const person = sp.nguoi && /^[0-9a-f-]{36}$/i.test(sp.nguoi) ? sp.nguoi : undefined;
  const project = sp.duan && /^[0-9a-f-]{36}$/i.test(sp.duan) ? sp.duan : undefined;
  const grouped = sp.xem === "nhom";
  const q = (sp.q ?? "").slice(0, 100);
  const view = VIEWS.some(([k]) => k === sp.v) ? String(sp.v) : "dang-lam";
  const mode = sp.lich === "thang" ? "thang" : "tuan";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? "") ? String(sp.ngay) : ctx.today;

  const data = await loadBoard(ctx);
  const filter: BoardFilter = { q, person, project, flag };
  const all = data.cards;
  const cards = applyFilter(all, filter);
  const keep = { tab, q: q || undefined, nguoi: person, duan: project, xem: grouped ? "nhom" : undefined, loc: flag, v: tab === "cho" ? view : undefined, lich: tab === "lich" ? mode : undefined, ngay: tab === "lich" ? anchor : undefined };
  const base = `/cong-viec${qs({ tab, q: q || undefined, nguoi: person, duan: project, xem: grouped ? "nhom" : undefined, loc: flag, v: tab === "cho" ? view : undefined, lich: tab === "lich" ? mode : undefined, ngay: tab === "lich" && sp.ngay ? anchor : undefined })}`;
  const selected = sp.the ? all.find((c) => c.id === sp.the) ?? null : null;
  const rev = ["/cong-viec"];
  const cardHref = (id: string) => `${base}${base.includes("?") ? "&" : "?"}the=${id}`;

  const mine = cards.filter((c) => c.mine && c.status !== "cancelled");
  const mineOpen = mine.filter((c) => c.status !== "completed");
  const act = cards.filter((c) => c.actionable);
  const counts: Record<Tab, number> = {
    cho: all.filter((c) => c.status === "deferred" || c.status === "cancelled" || c.status === "not_started").length,
    bang: all.filter((c) => c.status === "not_started" || c.status === "in_progress").length,
    lich: all.filter((c) => c.due || c.start).length,
    toi: all.filter((c) => c.actionable).length,
  };

  const board = recentDone(cards.filter((c) => c.status === "not_started" || c.status === "in_progress" || c.status === "completed"), data.updatedAt, 20);

  const listRows = cards.filter((c) => (view === "dang-lam" ? ["not_started", "in_progress", "deferred"].includes(c.status) : view === "xong" ? ["completed", "cancelled"].includes(c.status) : true));

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title="Công việc" description="Một bảng cho cả đội: mỗi video đang ở bước nào, tiến độ bao nhiêu, ai xử lý tiếp và việc nào sắp trễ hạn." />

      <Disclosure summary="Thêm công việc" icon={<Plus className="size-4" aria-hidden />}>
        <RpcForm rpc="save_task" fixed={{ p_id: null, p_related_type: "project" }} submitLabel="Thêm công việc" revalidate={rev} resetOnSuccess columns={3}
          fields={[
            { name: "p_title", label: "Tiêu đề", required: true, wide: true },
            { name: "p_type", label: "Loại", type: "select", required: true, defaultValue: "to_do", options: opts(TASK_TYPE) },
            { name: "p_priority", label: "Ưu tiên", type: "select", required: true, defaultValue: "normal", options: opts(TASK_PRIORITY) },
            { name: "p_start_date", label: "Ngày bắt đầu", type: "date" },
            { name: "p_scheduled_at", label: "Thời hạn / giờ hẹn", type: "datetime" },
            { name: "p_remind_before", label: "Nhắc trước (phút)", type: "number", as: "number", min: 0 },
            { name: "p_related_id", label: "Dự án liên quan", type: "select", as: "uuid", options: data.projects.map((x) => [x.id, `${x.code} · ${x.name}`] as [string, string]) },
            { name: "p_content", label: "Nội dung", type: "textarea" },
            { name: "p_assignees", label: "Giao cho", type: "checks", options: data.people.filter((p) => p.is_active).map((p) => [p.id, p.full_name] as [string, string]), defaultValue: [ctx.user_id] },
          ]} />
      </Disclosure>

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Chế độ xem công việc">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/cong-viec${qs({ ...keep, tab: k, v: undefined, lich: undefined, ngay: undefined })}`} aria-current={tab === k ? "page" : undefined} data-testid={`tab-${k}`}
            className={cn("-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {l}<span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{counts[k]}</span>
          </Link>
        ))}
      </nav>

      <form action="/cong-viec" method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="Tìm và lọc công việc">
        <input type="hidden" name="tab" value={tab} />
        {tab === "cho" ? <input type="hidden" name="v" value={view} /> : null}
        {grouped ? <input type="hidden" name="xem" value="nhom" /> : null}
        {tab === "lich" ? <><input type="hidden" name="lich" value={mode} /><input type="hidden" name="ngay" value={anchor} /></> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Tìm theo tên việc hoặc mã video…" aria-label="Tìm theo tên việc hoặc mã video" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
        </div>
        <select name="nguoi" defaultValue={person ?? ""} aria-label="Lọc theo người phụ trách" className="select-chevron h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Mọi người</option>
          {data.people.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select name="duan" defaultValue={project ?? ""} aria-label="Lọc theo dự án" className="select-chevron h-10 max-w-56 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Mọi dự án</option>
          {data.projects.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
        </select>
        <select name="loc" defaultValue={flag ?? ""} aria-label="Lọc theo tình trạng" className="select-chevron h-10 rounded-lg border border-input bg-card px-3 text-sm">
          {FLAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Lọc</button>
        {q || person || project || flag ? <Link href={`/cong-viec${qs({ tab, v: tab === "cho" ? view : undefined, xem: grouped ? "nhom" : undefined })}`} className="px-2 text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
      </form>

      {tab === "bang" ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1" role="group" aria-label="Cách nhóm thẻ">
            {([["", "Theo trạng thái"], ["nhom", "Theo nhóm công việc"]] as const).map(([k, l]) => (
              <Link key={k} href={`/cong-viec${qs({ ...keep, xem: k || undefined })}`} aria-current={(grouped ? "nhom" : "") === k ? "true" : undefined} data-testid={k ? "view-group" : "view-status"}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", (grouped ? "nhom" : "") === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>
            ))}
          </div>
          {board.length === 0 && all.length === 0 && !grouped
            ? <EmptyState title="Chưa có công việc" description="Bấm “+” ở một cột hoặc “Thêm công việc” để tạo việc đầu tiên." />
            : <WorkBoard cards={board} query={base} selected={selected?.id} mode={grouped ? "group" : "status"} groups={data.groups} />}
        </div>
      ) : null}

      {tab === "lich" ? <WorkCalendar cards={cards} mode={mode} anchor={anchor} today={ctx.today} base={base} /> : null}

      {tab === "toi" ? (
        <div className="grid gap-6 lg:grid-cols-2" data-testid="my-work">
          <section aria-labelledby="mine-act" className="flex flex-col gap-3">
            <h2 id="mine-act" className="text-base font-semibold">Cần tôi xử lý <span className="font-normal text-muted-foreground">({act.length})</span></h2>
            {act.length === 0 ? <EmptyState title="Không có việc nào đang chờ bạn" description="Khi Content bàn giao, Editor nộp bản dựng hoặc có việc được giao, thẻ sẽ hiện ở đây." /> : (
              <ul className="flex flex-col gap-2" data-testid="my-act">
                {act.map((k) => (
                  <li key={k.id} data-card={k.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs">
                    {k.actionLabel ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{k.actionLabel}</p> : null}
                    <WorkCardBody card={k} href={cardHref(k.id)} />
                    {k.video && stepAnchor(k.video.stage) ? <Link href={`/video/${k.video.id}#${stepAnchor(k.video.stage)!.anchor}`} className="mt-2 inline-block rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">{stepAnchor(k.video.stage)!.label}</Link> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="mine-asg" className="flex flex-col gap-3">
            <h2 id="mine-asg" className="text-base font-semibold">Được giao cho tôi <span className="font-normal text-muted-foreground">({mineOpen.length})</span></h2>
            {mineOpen.length === 0 ? <EmptyState title="Chưa có việc nào được giao cho bạn" /> : (
              <ul className="flex flex-col gap-2" data-testid="my-assigned">
                {mineOpen.map((k) => <li key={k.id} data-card={k.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs"><WorkCardBody card={k} href={cardHref(k.id)} /></li>)}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "cho" ? (
        <div className="flex flex-col gap-3">
          <nav className="flex gap-1" aria-label="Lọc công việc">
            {VIEWS.map(([k, l]) => <Link key={k} href={`/cong-viec${qs({ ...keep, v: k })}`} aria-current={view === k ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-sm font-medium", view === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
          </nav>
          <DataTable rows={listRows} testId="list-tasks" empty={<EmptyState title="Không có công việc" description="Thử đổi bộ lọc hoặc bấm “Thêm công việc” để tạo mới." />}
            cols={[
              { label: "Công việc", cell: (r: Card) => (
                <div className="min-w-0">
                  <Link href={cardHref(r.id)} className="font-medium hover:text-primary hover:underline">{r.title}</Link>
                  <p className="text-xs text-muted-foreground">{r.video ? `${r.video.code} · ${[r.step, r.next].filter(Boolean).join(" · ")}` : `${TASK_TYPE[r.taskType] ?? r.taskType}`} · {r.assignees.map((a) => a.name).join(", ") || "Chưa giao"}{r.project ? ` · ${r.project.code}` : ""}</p>
                </div>
              ) },
              { label: "Hạn", cell: (r: Card) => (r.due ? <span className={r.flags.overdue ? "font-medium text-red-700" : undefined}>{formatDate(r.due)}</span> : "—"), className: "hidden sm:table-cell" },
              { label: "Ưu tiên", cell: (r: Card) => badge(TASK_PRIORITY, r.priority), className: "hidden md:table-cell" },
              { label: "Trạng thái", cell: (r: Card) => badge(TASK_STATUS, r.status) },
              { label: "", cell: (r: Card) => (
                r.video ? <Link href={`/video/${r.video.id}`} className="text-sm text-primary hover:underline">Mở video</Link> : (
                  <div className="flex flex-wrap gap-1.5">
                    {r.status === "not_started" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "in_progress" }} label="Bắt đầu" variant="ghost" revalidate={rev} /> : null}
                    {r.status !== "completed" && r.status !== "cancelled" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "completed" }} label="Hoàn thành" variant="soft" revalidate={rev} /> : null}
                    {r.status === "completed" || r.status === "deferred" ? <RpcButton rpc="set_task_status" args={{ p_id: r.id, p_status: "in_progress" }} label="Mở lại" variant="ghost" revalidate={rev} /> : null}
                    {r.createdBy === ctx.user_id ? <RpcButton rpc="delete_task" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa công việc này?" revalidate={rev} /> : null}
                  </div>
                )
              ) },
            ]} />
        </div>
      ) : null}

      {selected ? <WorkDrawer card={selected} viewer={data.viewer} people={data.people} groups={data.groups} projects={data.projects} closeHref={base} /> : null}
    </div>
  );
}
