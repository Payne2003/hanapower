import type { Metadata } from "next";
import Link from "next/link";
import { Columns3, GanttChart, Plus, Save, Table2, X } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups } from "@/lib/entities";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/form-spec";
import { PROJECT_STAGE, badge, opts } from "@/lib/status-maps";
import { DEFAULT_COLS, PROJECT_COLS, PROJECT_VIEWS, RISK, RISK_FLAG as FLAGS } from "@/lib/finance-ui";
import { getProjectList, getSavedViews, parseProjectQuery, projectParams, type ProjectRow } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { EmptyState } from "@/components/ui/alert";
import { Chip, Pager, SELECT, SortTh, TABLE, THEAD } from "@/components/hr/ui";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { DueText, ProgressBar, RiskBadge } from "@/components/projects/parts";
import { ProjectTimeline, type MilestoneDot } from "@/components/projects/timeline";

export const metadata: Metadata = { title: "Dự án" };
type SP = Record<string, string | undefined>;

const KANBAN: [string, string, string][] = [
  ["planning", "Lên kế hoạch", "#2f8fb8"], ["in_progress", "Đang thực hiện", "#7a5ac8"], ["acceptance", "Nghiệm thu", "#e0a22a"],
  ["completed", "Hoàn thành", "#0f6b3f"], ["on_hold", "Tạm dừng", "#d97706"], ["cancelled", "Đã hủy", "#8a8f98"],
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const q = parseProjectQuery(sp);
  await (await createSupabaseServerClient()).rpc("run_finance_reminders"); // nhắc mốc thu / rủi ro: mỗi sự kiện đúng một lần
  const [list, L, views] = await Promise.all([getProjectList(q), loadLookups(["accounts", "people"]), getSavedViews("project")]);
  const canCreate = can(ctx, "projects.create");
  const here = projectParams(q); // trạng thái hiện tại — dùng làm đường quay lại từ hồ sơ
  const withP = (over: Partial<typeof q>, extra: Record<string, string | undefined> = {}) => `/du-an${projectParams({ ...q, page: 1, ...over }, extra)}`;
  const rows = list.rows;
  const anyMoney = rows.some((r) => r.money_ok);
  const cols = q.cols.filter((c) => anyMoney || !PROJECT_COLS.find(([k]) => k === c)?.[2]);
  const picked = q.pick ? rows.find((r) => r.id === q.pick) : undefined;
  const openHref = (r: ProjectRow) => `/du-an/${r.id}${here ? `?tu=${encodeURIComponent(here)}` : `?tu=`}`;

  let milestones: MilestoneDot[] = [];
  if (q.display === "dong-thoi" && anyMoney) {
    const supabase = await createSupabaseServerClient();
    const ids = new Set(rows.map((r) => r.id));
    const { data } = await supabase.from("project_milestones").select("project_id, name, amount, due_date, payment").not("due_date", "is", null).order("due_date").limit(3000);
    milestones = ((data ?? []) as { project_id: string; name: string; amount: number | string; due_date: string; payment: string }[]).filter((m) => ids.has(m.project_id)).map((m) => ({ ...m, amount: Number(m.amount) }));
  }

  const columns: KanbanColumn[] = KANBAN.map(([value, label, color]) => ({
    value, label: value === "cancelled" ? `${label} (dùng nút “Hủy dự án” trong hồ sơ)` : label, color, locked: value === "cancelled",
    cards: rows.filter((r) => r.stage === value).map((r) => ({
      id: r.id, title: `${r.code} · ${r.name}`, sub: [r.customer_name, r.manager_names.join(", ")].filter(Boolean).join(" · ") || undefined,
      meta: `${r.progress}% · ${RISK[r.effective_risk]?.[0] ?? ""}${r.money_ok && (r.overdue_count ?? 0) > 0 ? ` · ${r.overdue_count} mốc thu quá hạn` : ""}`, href: openHref(r),
    })),
  }));

  const modeLink = (bd: "bang" | "kanban" | "dong-thoi", label: string, icon: React.ReactNode) => (
    <Link key={bd} href={withP({ display: bd, pick: undefined })} aria-current={q.display === bd ? "true" : undefined} data-testid={`mode-${bd}`}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", q.display === bd ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{icon}{label}</Link>
  );
  const sortHref = (col: string, dir: "asc" | "desc") => `/du-an${projectParams({ ...q, sort: col, dir, page: 1 })}`;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Dự án" eyebrow={`${list.total} dự án`}
        description="Mỗi dự án có thành viên từ nhiều bộ phận; người ngoài dự án không xem được. Cột tiền chỉ hiện với quản lý dự án và kế toán."
        actions={canCreate ? <Link href={`/du-an${projectParams(q, { tao: "1" })}#tao-du-an`}><Button><Plus className="size-4" aria-hidden />Tạo dự án</Button></Link> : undefined} />

      {canCreate && sp.tao === "1" ? (
        <div id="tao-du-an">
          <Disclosure summary="Tạo dự án" defaultOpen icon={<Plus className="size-4" aria-hidden />}>
            <RpcForm rpc="create_project" submitLabel="Tạo dự án" redirectTo="/du-an/{}" revalidate={["/du-an"]} columns={3}
              fields={[
                { name: "p_name", label: "Tên dự án", required: true, wide: true },
                { name: "p_kind", label: "Loại", type: "select", required: true, defaultValue: "client", options: [["client", "Dự án khách hàng"], ["internal", "Nội bộ"]] },
                { name: "p_customer_id", label: "Khách hàng", type: "select", as: "uuid", options: L.accounts ?? [], hint: "Bắt buộc với dự án khách hàng" },
                { name: "p_manager_id", label: "Quản lý chính", type: "select", as: "uuid", options: L.people ?? [], defaultValue: ctx.user_id, required: true, hint: "Thêm đồng quản lý trong hồ sơ dự án → Con người" },
                { name: "p_start", label: "Bắt đầu", type: "date" }, { name: "p_end", label: "Kết thúc", type: "date" },
                { name: "p_contract_value", label: "Giá trị hợp đồng (₫)", type: "number", defaultValue: 0 }, { name: "p_budget_cost", label: "Ngân sách chi (₫)", type: "number", defaultValue: 0 },
                { name: "p_description", label: "Phạm vi / mô tả", type: "textarea" },
                { name: "p_members", label: "Thành viên (từ nhiều bộ phận)", type: "checks", options: (L.people ?? []).filter(([v]) => v !== ctx.user_id) },
              ]} />
          </Disclosure>
        </div>
      ) : null}

      <nav aria-label="Chế độ xem nhanh" className="flex flex-wrap gap-2" data-testid="quick-views">
        {PROJECT_VIEWS.map(([k, label, hint]) => (
          <span key={k || "all"} title={hint}><Chip href={withP({ view: k, pick: undefined })} label={label} count={list.counts[k || "all"] ?? 0} active={q.view === k} /></span>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/du-an" method="get" role="search" className="flex flex-1 flex-wrap items-center gap-2">
          {q.display !== "bang" ? <input type="hidden" name="bd" value={q.display} /> : null}
          {q.view ? <input type="hidden" name="xem" value={q.view} /> : null}
          {q.sort !== "name" ? <input type="hidden" name="sx" value={q.sort} /> : null}
          {q.dir === "desc" ? <input type="hidden" name="chieu" value="desc" /> : null}
          {q.cols.join(",") !== DEFAULT_COLS.join(",") ? <input type="hidden" name="cot" value={q.cols.join(",")} /> : null}
          <input name="q" defaultValue={q.q} placeholder="Tìm theo mã, tên dự án, khách hàng…" aria-label="Tìm dự án" className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
          <select name="gd" defaultValue={q.stage ?? ""} aria-label="Lọc theo giai đoạn" className={SELECT}><option value="">Giai đoạn: tất cả</option>{opts(PROJECT_STAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="kh" defaultValue={q.customer ?? ""} aria-label="Lọc theo khách hàng" className={SELECT}><option value="">Khách hàng: tất cả</option>{(L.accounts ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <Button type="submit" variant="outline">Lọc</Button>
          {q.q || q.stage || q.customer || q.view ? <Link href={`/du-an${projectParams({ display: q.display })}`} className="px-2 text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
        </form>
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1" role="group" aria-label="Kiểu hiển thị">
          {modeLink("bang", "Bảng", <Table2 className="size-4" aria-hidden />)}
          {modeLink("kanban", "Kanban", <Columns3 className="size-4" aria-hidden />)}
          {modeLink("dong-thoi", "Dòng thời gian", <GanttChart className="size-4" aria-hidden />)}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {q.display === "bang" ? (
          <Disclosure summary="Cột hiển thị" icon={<Table2 className="size-4" aria-hidden />}>
            <fieldset className="flex flex-wrap gap-2 text-sm">
              <legend className="sr-only">Chọn cột hiển thị</legend>
              {PROJECT_COLS.filter(([k, , m]) => k !== "ten" && (anyMoney || !m)).map(([k, label]) => {
                const on = q.cols.includes(k);
                const next = on ? q.cols.filter((c) => c !== k) : PROJECT_COLS.map(([c]) => c).filter((c) => c === k || q.cols.includes(c));
                return <Link key={k} href={`/du-an${projectParams({ ...q, cols: next.length ? next : DEFAULT_COLS, pick: undefined })}`} aria-pressed={on} data-testid={`col-${k}`}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>{on ? "✓ " : ""}{label}</Link>;
              })}
            </fieldset>
          </Disclosure>
        ) : null}
        <Disclosure summary={`Góc nhìn đã lưu${views.length ? ` (${views.length})` : ""}`} icon={<Save className="size-4" aria-hidden />}>
          <div className="flex flex-col gap-3">
            {views.length ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {views.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <Link href={`/du-an${v.params ? `?${v.params}` : ""}`} className="font-medium text-primary hover:underline">{v.name}</Link>
                    <RpcButton rpc="delete_view" args={{ p_id: v.id }} label="Xóa" variant="ghost" revalidate={["/du-an"]} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Chưa có góc nhìn nào. Lọc / sắp xếp như ý rồi lưu để mở lại một chạm.</p>}
            <RpcForm rpc="save_view" fixed={{ p_scope: "project", p_params: here.replace(/^\?/, "").replace(/&?trang=\d+/, "") }} submitLabel="Lưu góc nhìn hiện tại" revalidate={["/du-an"]} columns={1} resetOnSuccess variant="outline"
              fields={[{ name: "p_name", label: "Tên góc nhìn", required: true, placeholder: "VD: Rủi ro cao tháng này" }]} />
          </div>
        </Disclosure>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={q.q || q.stage || q.customer || q.view ? "Không có dự án khớp bộ lọc" : "Chưa có dự án nào bạn tham gia"}
          description={q.q || q.stage || q.customer || q.view ? "Thử bỏ bớt bộ lọc." : canCreate ? "Tạo dự án mới hoặc tạo từ hợp đồng đã kích hoạt." : "Quản lý sẽ thêm bạn vào dự án."} />
      ) : q.display === "kanban" ? (
        <>
          {list.total > rows.length ? <p className="text-xs text-muted-foreground">Hiển thị {rows.length}/{list.total} dự án đầu tiên — thu hẹp bộ lọc để xem đủ.</p> : null}
          <KanbanBoard columns={columns} rpc="set_project_stage" idArg="p_id" statusArg="p_stage" revalidate={["/du-an"]} />
        </>
      ) : q.display === "dong-thoi" ? (
        <ProjectTimeline rows={rows} milestones={milestones} today={ctx.today} href={(r) => openHref(r)} />
      ) : (
        <>
          <div className={TABLE}>
            <table className="w-full min-w-[820px] text-sm" data-testid="list-projects">
              <thead className={THEAD}>
                <tr>
                  {PROJECT_COLS.filter(([k]) => k === "ten" || cols.includes(k)).map(([k, label]) => {
                    const sortKey = ({ ma: "code", ten: "name", khach: "customer", tiendo: "progress", giaidoan: "stage", ruiro: "risk", han: "end", moc: "next" } as Record<string, string>)[k];
                    return sortKey ? <SortTh key={k} label={label} col={sortKey} sort={q.sort} dir={q.dir} href={sortHref} /> : <th key={k} scope="col" className="px-3.5 py-2.5">{label}</th>;
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} id={`row-${r.id}`} className={cn("relative hover:bg-muted/40", picked?.id === r.id && "bg-primary-soft/40")} data-testid="project-row">
                    {PROJECT_COLS.filter(([k]) => k === "ten" || cols.includes(k)).map(([k]) => <td key={k} className="px-3.5 py-2.5 align-top">{cell(k, r, ctx.today, `/du-an${projectParams(q, { chon: r.id })}#row-${r.id}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={list.total} page={q.page} size={q.size} href={(p) => `/du-an${projectParams({ ...q, page: p })}`} />
        </>
      )}

      {picked ? <QuickView r={picked} today={ctx.today} closeHref={`/du-an${here}`} openHref={openHref(picked)} /> : null}
    </div>
  );
}

function cell(k: string, r: ProjectRow, today: string, pickHref: string) {
  switch (k) {
    case "ma": return <span className="font-medium">{r.code}</span>;
    case "ten": return <Link href={pickHref} className="font-medium text-primary hover:underline after:absolute after:inset-0 after:content-['']" aria-label={`Xem nhanh ${r.name}`}>{r.name}</Link>;
    case "khach": return r.customer_name ?? <span className="text-muted-foreground">{r.kind === "internal" ? "Nội bộ" : "—"}</span>;
    case "quanly": return r.manager_names.length ? r.manager_names.join(", ") : "—";
    case "tiendo": return <ProgressBar value={r.progress} />;
    case "giaidoan": return badge(PROJECT_STAGE, r.stage);
    case "ruiro": return <RiskBadge level={r.effective_risk} flags={r.risk_flags} withReasons />;
    case "han": return <DueText date={r.end_date} today={today} done={r.stage === "completed" || r.stage === "cancelled"} />;
    case "moc": return r.money_ok ? (r.next_name ? <div><p>{r.next_name} · <span className="tabular-nums">{money(r.next_amount)}</span></p><p className="text-xs"><DueText date={r.next_due} today={today} /></p></div> : <span className="text-muted-foreground">Không còn mốc chưa thu</span>) : <span className="text-muted-foreground">—</span>;
    case "hopdong": return r.money_ok ? <span className="tabular-nums">{money(r.contract_value)}</span> : "—";
    case "dathu": return r.money_ok ? <span className="tabular-nums">{money(r.revenue)}</span> : "—";
    default: return null;
  }
}

/** Xem nhanh bên phải: quản lý, tiến độ, rủi ro, mốc thu kế tiếp + nút mở hồ sơ. Đóng bằng liên kết (giữ nguyên bộ lọc / trang). */
function QuickView({ r, today, closeHref, openHref }: { r: ProjectRow; today: string; closeHref: string; openHref: string }) {
  return (
    <>
      <Link href={closeHref} aria-label="Đóng xem nhanh" className="fixed inset-0 z-30 bg-black/20" />
      <aside role="dialog" aria-label={`Xem nhanh ${r.name}`} className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-5 shadow-xl" data-testid="quick-view">
        <header className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.code}</p><h2 className="text-lg font-semibold leading-snug">{r.name}</h2><p className="mt-1 text-sm text-muted-foreground">{r.customer_name ?? (r.kind === "internal" ? "Dự án nội bộ" : "Chưa gán khách hàng")}</p></div>
          <Link href={closeHref} aria-label="Đóng" className="grid size-8 place-items-center rounded-lg border hover:bg-muted"><X className="size-4" aria-hidden /></Link>
        </header>
        <div className="flex flex-wrap items-center gap-2">{badge(PROJECT_STAGE, r.stage)}<RiskBadge level={r.effective_risk} /></div>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Quản lý</dt><dd>{r.manager_names.length ? r.manager_names.join(", ") : "—"}</dd>
          <dt className="text-muted-foreground">Thành viên</dt><dd>{r.member_count} người</dd>
          <dt className="text-muted-foreground">Tiến độ</dt><dd><ProgressBar value={r.progress} /></dd>
          <dt className="text-muted-foreground">Thời gian</dt><dd>{formatDate(r.start_date)} → {formatDate(r.end_date)}</dd>
          <dt className="text-muted-foreground">Rủi ro</dt>
          <dd>{r.risk_flags.length ? <ul className="flex flex-col gap-0.5">{r.risk_flags.map((f) => <li key={f}>• {FLAGS[f] ?? f}</li>)}</ul> : "Không có dấu hiệu rủi ro"}{r.risk_note ? <p className="mt-1 text-muted-foreground">“{r.risk_note}”</p> : null}</dd>
          {r.money_ok ? (<>
            <dt className="text-muted-foreground">Mốc thu kế tiếp</dt>
            <dd>{r.next_name ? <><strong>{r.next_name}</strong> · {money(r.next_amount)}<p className="text-xs"><DueText date={r.next_due} today={today} /></p></> : "Không còn mốc chưa thu"}</dd>
            <dt className="text-muted-foreground">Đã thu / hợp đồng</dt><dd className="tabular-nums">{money(r.revenue)} / {money(r.contract_value)}</dd>
            {(r.overdue_count ?? 0) > 0 ? (<><dt className="text-muted-foreground">Quá hạn thu</dt><dd className="text-red-700">{r.overdue_count} mốc · {money(r.overdue_amount)} · trễ nhất {r.max_overdue_days} ngày</dd></>) : null}
          </>) : null}
        </dl>
        <div className="mt-auto flex gap-2"><Link href={openHref} className="flex-1"><Button className="w-full" data-testid="open-project">Mở hồ sơ đầy đủ</Button></Link></div>
      </aside>
    </>
  );
}
