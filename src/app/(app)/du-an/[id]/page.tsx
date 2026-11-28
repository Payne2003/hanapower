import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ASSIGNMENT, APPROVAL, BONUS, PAYMENT, PROJECT_STAGE, TASK_STATUS, badge } from "@/lib/status-maps";
import { STAGE } from "@/lib/labels";
import { RISK_MANUAL, safeBack } from "@/lib/finance-ui";
import { getProjectHistory, getProjectList, getProjectMoney, parseProjectQuery, type ProjectMoney, type ProjectRow } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Disclosure } from "@/components/disclosure";
import { Badge } from "@/components/ui/badge";
import { NotesPanel } from "@/components/notes-panel";
import { DueText, ProgressBar, RiskBadge } from "@/components/projects/parts";
import { ReceiptForm } from "@/components/finance/receipt-form";
import { FileUpload } from "@/components/finance/file-upload";
import { uploadProjectFileAction } from "../actions";
import { uploadFinanceFileAction } from "../../thu-chi/actions";

export const metadata: Metadata = { title: "Dự án" };
type Sp = { tab?: string; tu?: string };
type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const TABS: [string, string, boolean][] = [
  ["tong-quan", "Tổng quan", false], ["con-nguoi", "Con người", false], ["cong-viec", "Công việc & sản xuất", false], ["thanh-toan", "Thanh toán", true],
  ["tai-chinh", "Tài chính dự án", true], ["tai-lieu", "Tài liệu", false], ["cong-tac-vien", "Cộng tác viên", false], ["thuong", "Thưởng", true],
];
const ALIAS: Record<string, string> = { "nghiem-thu": "thanh-toan", video: "cong-viec" };
const KIND_LABEL: Record<string, string> = { project: "Tài liệu dự án", plan: "Kế hoạch", report: "Báo cáo", quote: "Báo giá", contract: "Hợp đồng", other: "Khác" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const p = data as Row;
  const [L, mgrs, members, moneyData, listed] = await Promise.all([
    loadLookups(["people"]),
    supabase.from("project_managers").select("user_id").eq("project_id", id),
    supabase.from("project_members").select("user_id, role_label").eq("project_id", id),
    getProjectMoney(id),
    getProjectList({ ...parseProjectQuery({}), q: String(p.code), size: 5 }),
  ]);
  const managerIds = (mgrs.data ?? []).map((m) => m.user_id as string);
  const manage = can(ctx, "projects.manage_all") || managerIds.includes(ctx.user_id) || p.manager_id === ctx.user_id;
  const canMoney = moneyData !== null;
  const row = listed.rows.find((r) => r.id === id);
  const name = (uid: unknown) => (L.people ?? []).find(([v]) => v === uid)?.[1] ?? "—";
  const want = ALIAS[sp.tab ?? ""] ?? sp.tab;
  const visible = TABS.filter(([, , needMoney]) => canMoney || !needMoney);
  const tab = visible.some(([k]) => k === want) ? String(want) : "tong-quan";
  const back = safeBack(sp.tu);
  const rev = [`/du-an/${id}`, "/du-an", "/thu-chi"];
  const tq = back ? `&tu=${encodeURIComponent(back)}` : "";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href={`/du-an${back}${back ? `#row-${id}` : ""}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-list"><ArrowLeft className="size-4" aria-hidden />Dự án{back ? " (giữ bộ lọc)" : ""}</Link>
      <PageHeader
        title={`${p.code} · ${p.name}`}
        eyebrow={<span>{p.customer_id ? <Link className="text-primary hover:underline" href={`/tai-khoan/${p.customer_id}`}>{row?.customer_name ?? "Khách hàng"}</Link> : "Dự án nội bộ"}{p.contract_id ? <> · <Link className="text-primary hover:underline" href={`/hop-dong/${p.contract_id}`}>Hợp đồng</Link></> : null}</span>}
        actions={<>{badge(PROJECT_STAGE, p.stage)}{row ? <RiskBadge level={row.effective_risk} /> : null}</>}
      />
      <nav aria-label="Các phần của dự án" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {visible.map(([k, l]) => (
          <Link key={k} href={`/du-an/${id}?tab=${k}${tq}`} aria-current={tab === k ? "page" : undefined} data-testid={`tab-${k}`}
            className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>
        ))}
      </nav>

      {tab === "tong-quan" ? <Overview p={p} row={row} id={id} manage={manage} rev={rev} name={name} managerIds={managerIds} memberCount={new Set([...managerIds, ...(members.data ?? []).map((m) => m.user_id as string)]).size} L={L} userId={ctx.user_id} supabase={supabase} today={ctx.today} /> : null}
      {tab === "con-nguoi" ? <People id={id} manage={manage} rev={rev} name={name} managerIds={managerIds} members={(members.data ?? []) as { user_id: string; role_label: string | null }[]} people={L.people ?? []} /> : null}
      {tab === "cong-viec" ? <WorkTab id={id} manage={manage} name={name} today={ctx.today} supabase={supabase} /> : null}
      {tab === "thanh-toan" && moneyData ? <PaymentsTab id={id} p={p} manage={manage} canFinance={can(ctx, "finance.manage")} m={moneyData} today={ctx.today} ctx={{ userId: ctx.user_id }} supabase={supabase} people={L.people ?? []} /> : null}
      {tab === "tai-chinh" && moneyData ? <FinanceTab id={id} m={moneyData} supabase={supabase} /> : null}
      {tab === "tai-lieu" ? <DocsTab id={id} manage={manage} canMoney={canMoney} canFinance={can(ctx, "finance.manage")} supabase={supabase} name={name} /> : null}
      {tab === "cong-tac-vien" ? <FreelancersTab id={id} manage={manage || can(ctx, "freelancers.manage")} /> : null}
      {tab === "thuong" && canMoney ? <BonusTab id={id} manage={manage} memberOptions={(members.data ?? []).map((m) => [m.user_id as string, name(m.user_id)] as [string, string])} canDecide={can(ctx, "payroll.approve")} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Tổng quan
async function Overview({ p, row, id, manage, rev, name, managerIds, memberCount, L, userId, supabase, today }: {
  p: Row; row?: ProjectRow; id: string; manage: boolean; rev: string[]; name: (u: unknown) => string; managerIds: string[]; memberCount: number;
  L: Awaited<ReturnType<typeof loadLookups>>; userId: string; supabase: SB; today: string;
}) {
  const [files, hist] = await Promise.all([
    supabase.from("project_files").select("id, kind, name").in("kind", ["quote", "plan", "report"]).eq("project_id", id).order("created_at", { ascending: false }),
    manage ? getProjectHistory(id) : Promise.resolve([]),
  ]);
  const stageBtns = (Object.keys(PROJECT_STAGE) as string[]).filter((s) => s !== p.stage);
  const links = (files.data ?? []) as { id: string; kind: string; name: string }[];
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Quản lý dự án" value={managerIds.length ? managerIds.map(name).join(", ") : "—"} tone="green" />
        <StatCard label="Bắt đầu" value={formatDate(p.start_date as string)} tone="sky" />
        <StatCard label="Kết thúc" value={formatDate(p.end_date as string)} tone="violet" hint={row?.late ? "Đã quá hạn kết thúc" : undefined} />
        <StatCard label="Người tham gia" value={memberCount} tone="slate" hint="Mỗi người tính một lần" />
      </section>
      <Card>
        <CardHeader><CardTitle>Tiến độ & rủi ro</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4"><ProgressBar value={Number(p.progress ?? 0)} className="[&>div]:w-48" />{row ? <RiskBadge level={row.effective_risk} flags={row.risk_flags} withReasons /> : null}</div>
          {p.risk_note ? <p className="text-sm"><span className="text-muted-foreground">Ghi chú rủi ro: </span>{String(p.risk_note)}</p> : null}
          <p className="text-sm"><span className="text-muted-foreground">Phương thức thanh toán: </span>{p.payment_terms ? String(p.payment_terms) : "Chưa ghi"}</p>
          {manage ? (
            <Disclosure summary="Cập nhật tiến độ, rủi ro, phương thức thanh toán">
              <RpcForm rpc="update_project_progress" fixed={{ p_id: id }} submitLabel="Lưu" revalidate={rev} columns={2}
                fields={[
                  { name: "p_progress", label: "Tiến độ (%)", type: "number", required: true, min: 0, step: "1", defaultValue: Number(p.progress ?? 0) },
                  { name: "p_risk", label: "Mức rủi ro do quản lý đánh giá", type: "select", required: true, defaultValue: String(p.risk_level ?? "low"), options: RISK_MANUAL },
                  { name: "p_risk_note", label: "Lý do / ghi chú rủi ro", type: "textarea", defaultValue: (p.risk_note as string) ?? "", hint: "Mức hiển thị còn tự nâng khi có mốc thu quá hạn, chi vượt ngân sách hoặc trễ hạn dự án" },
                  { name: "p_payment_terms", label: "Phương thức thanh toán", defaultValue: (p.payment_terms as string) ?? "", placeholder: "VD: Chuyển khoản 3 đợt 30–40–30" },
                ]} />
            </Disclosure>
          ) : null}
        </CardContent>
      </Card>
      {p.description ? <Card><CardHeader><CardTitle>Phạm vi</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-line">{String(p.description)}</CardContent></Card> : null}
      <Card>
        <CardHeader><CardTitle>Báo giá, kế hoạch, báo cáo</CardTitle></CardHeader>
        <CardContent>
          {links.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {links.map((f) => (
                <li key={f.id} className="flex items-center gap-2"><Badge className="bg-muted text-foreground ring-border">{KIND_LABEL[f.kind]}</Badge><a className="font-medium text-primary hover:underline" href={`/du-an/tai-lieu/${f.id}?xem=1`} target="_blank" rel="noreferrer">{f.name}</a></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Chưa có tài liệu báo giá / kế hoạch / báo cáo. Thêm trong tab Tài liệu.</p>}
        </CardContent>
      </Card>
      {manage ? (
        <Card>
          <CardHeader><CardTitle>Giai đoạn dự án</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stageBtns.map((s) => <RpcButton key={s} rpc="set_project_stage" args={{ p_id: id, p_stage: s }} label={PROJECT_STAGE[s]![0]} variant={s === "cancelled" ? "destructive" : "outline"} confirm={s === "cancelled" ? "Hủy dự án này?" : undefined} revalidate={rev} />)}
          </CardContent>
        </Card>
      ) : null}
      <NotesPanel type="project" id={id} canWrite userId={userId} people={L.people ?? []} isManager={manage} />
      {manage ? <ProjectEdit p={p} L={L} id={id} /> : null}
      {manage && hist.length ? (
        <Card>
          <CardHeader><CardTitle>Lịch sử thay đổi</CardTitle><p className="text-sm text-muted-foreground">Ai đã sửa tiến độ, người quản lý, mốc thanh toán…</p></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm" data-testid="project-history">
              {hist.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{formatDateTime(h.at)}</span><strong>{h.by ?? "Hệ thống"}</strong><span>{HISTORY[h.action] ?? h.action}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <span hidden>{today}</span>
    </>
  );
}
const HISTORY: Record<string, string> = {
  "project.progress": "cập nhật tiến độ / rủi ro", "project.managers": "đổi người quản lý", "project.members": "đổi thành viên", "project.file_add": "thêm tài liệu", "project.file_delete": "xóa tài liệu",
  "milestone.paid": "ghi nhận đã thu một mốc", "milestone.link_income": "gắn khoản thu vào mốc", "milestone.save": "sửa mốc thanh toán", "milestone.delete": "xóa mốc", "milestone.accept": "nghiệm thu mốc", "milestone.invoice": "xuất hóa đơn mốc",
};

async function ProjectEdit({ p, L, id }: { p: Row; L: Awaited<ReturnType<typeof loadLookups>>; id: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: b }, acc] = await Promise.all([supabase.from("project_budgets").select("contract_value, budget_cost").eq("project_id", id).maybeSingle(), loadLookups(["accounts"])]);
  return (
    <Disclosure summary="Sửa thông tin dự án">
      <RpcForm rpc="update_project" fixed={{ p_id: id }} submitLabel="Lưu thông tin" revalidate={[`/du-an/${id}`, "/du-an"]} columns={3}
        fields={[
          { name: "p_name", label: "Tên dự án", required: true, defaultValue: String(p.name), wide: true },
          { name: "p_customer_id", label: "Khách hàng", type: "select", as: "uuid", options: acc.accounts ?? [], defaultValue: (p.customer_id as string) ?? "" },
          { name: "p_manager_id", label: "Quản lý chính", type: "select", as: "uuid", options: L.people ?? [], defaultValue: (p.manager_id as string) ?? "" },
          { name: "p_start", label: "Bắt đầu", type: "date", defaultValue: (p.start_date as string) ?? "" }, { name: "p_end", label: "Kết thúc", type: "date", defaultValue: (p.end_date as string) ?? "" },
          { name: "p_contract_value", label: "Giá trị hợp đồng (₫)", type: "number", defaultValue: Number(b?.contract_value ?? 0), hint: "Căn cứ quy đổi % của từng mốc thanh toán" },
          { name: "p_budget_cost", label: "Ngân sách chi (₫)", type: "number", defaultValue: Number(b?.budget_cost ?? 0), hint: "Ngân sách CHI PHÍ: so với chi đã duyệt, không phải doanh thu" },
          { name: "p_description", label: "Phạm vi / mô tả", type: "textarea", defaultValue: (p.description as string) ?? "" },
        ]} />
    </Disclosure>
  );
}

// ---------------------------------------------------------------- Con người
function People({ id, manage, rev, name, managerIds, members, people }: { id: string; manage: boolean; rev: string[]; name: (u: unknown) => string; managerIds: string[]; members: { user_id: string; role_label: string | null }[]; people: [string, string][] }) {
  const all = [...new Set([...managerIds, ...members.map((m) => m.user_id)])];
  const memberIds = members.map((m) => m.user_id);
  return (
    <Card>
      <CardHeader><CardTitle>Con người ({all.length})</CardTitle><p className="text-sm text-muted-foreground">Người vừa quản lý vừa tham gia chỉ tính một lần.</p></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y rounded-xl border" data-testid="project-people">
          {all.map((u) => (
            <li key={u} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-sm">
              <span className="font-medium">{name(u)}</span>
              {managerIds.includes(u) ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Quản lý</Badge> : null}
              {memberIds.includes(u) ? <Badge className="bg-sky-50 text-sky-800 ring-sky-300">Thành viên</Badge> : null}
              {members.find((m) => m.user_id === u)?.role_label ? <span className="text-muted-foreground">{members.find((m) => m.user_id === u)!.role_label}</span> : null}
            </li>
          ))}
        </ul>
        {manage ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Disclosure summary="Đổi người quản lý (nhiều người)">
              <RpcForm rpc="set_project_managers" fixed={{ p_id: id }} submitLabel="Lưu quản lý" revalidate={rev} columns={1}
                fields={[{ name: "p_users", label: "Người quản lý dự án (ít nhất một)", type: "checks", options: people, defaultValue: managerIds }]} />
            </Disclosure>
            <Disclosure summary="Sửa danh sách thành viên">
              <RpcForm rpc="set_project_members" fixed={{ p_id: id }} submitLabel="Lưu thành viên" revalidate={rev} columns={1}
                fields={[{ name: "p_members", label: "Thành viên (quản lý luôn được giữ lại)", type: "checks", options: people.filter(([v]) => !managerIds.includes(v)), defaultValue: memberIds }]} />
            </Disclosure>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- Công việc & sản xuất
async function WorkTab({ id, manage, name, today, supabase }: { id: string; manage: boolean; name: (u: unknown) => string; today: string; supabase: SB }) {
  const [inP, free] = await Promise.all([
    supabase.from("videos").select("id, code, title, stage, due_date, content_owner_id, editor_id, edit_progress").eq("project_id", id).order("code"),
    manage ? supabase.from("videos").select("id, code, title").is("project_id", null).not("stage", "in", "(cancelled)").order("code", { ascending: false }).limit(200) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const vids = (inP.data ?? []) as Row[];
  const vIds = vids.map((v) => String(v.id));
  const taskQ = supabase.from("tasks").select("id, title, status, priority, scheduled_at, kind, video_id, related_type").is("deleted_at", null).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(200);
  const { data: tdata } = await (vIds.length ? taskQ.or(`and(related_type.eq.project,related_id.eq.${id}),video_id.in.(${vIds.join(",")})`) : taskQ.eq("related_type", "project").eq("related_id", id));
  const tasks = (tdata ?? []) as Row[];
  const asg = new Map<string, string[]>();
  if (tasks.length) {
    const { data } = await supabase.from("task_assignees").select("task_id, user_id").in("task_id", tasks.map((t) => String(t.id)));
    for (const a of data ?? []) asg.set(a.task_id as string, [...(asg.get(a.task_id as string) ?? []), a.user_id as string]);
  }
  const code = new Map(vids.map((v) => [String(v.id), String(v.code)]));
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Công việc ({tasks.length})</CardTitle><p className="text-sm text-muted-foreground">Việc gắn với dự án hoặc với video của dự án. Bấm tên để mở đúng thẻ trong màn Công việc.</p></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DataTable rows={tasks as (Row & { id: string })[]} testId="project-tasks" empty={<p className="text-sm text-muted-foreground">Chưa có công việc nào gắn vào dự án.</p>}
            cols={[
              { label: "Công việc", cell: (t) => <Link className="font-medium text-primary hover:underline" href={`/cong-viec?tab=cho&v=tat-ca&the=${t.id}`}>{String(t.title)}</Link> },
              { label: "Người làm", cell: (t) => (asg.get(String(t.id)) ?? []).map(name).join(", ") || "—", className: "hidden md:table-cell" },
              { label: "Hạn", cell: (t) => (t.scheduled_at ? <DueText date={String(t.scheduled_at).slice(0, 10)} today={today} done={t.status === "completed" || t.status === "cancelled"} /> : "—") },
              { label: "Trạng thái", cell: (t) => badge(TASK_STATUS, t.status) },
              { label: "Nguồn", cell: (t) => (t.video_id ? <Link className="text-primary hover:underline" href={`/video/${t.video_id}`}>Video {code.get(String(t.video_id)) ?? ""}</Link> : "Dự án"), className: "hidden lg:table-cell" },
            ]} />
          <Link href={`/cong-viec?duan=${id}`} className="w-fit text-sm font-medium text-primary hover:underline">Mở bảng công việc của dự án →</Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Video của dự án ({vids.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable rows={vids as (Row & { id: string })[]} href={(r) => `/video/${r.id}`} testId="project-videos" empty={<p className="text-sm text-muted-foreground">Chưa có video nào gắn vào dự án.</p>}
            cols={[
              { label: "Mã", cell: (r) => String(r.code) }, { label: "Tên video", cell: (r) => String(r.title) },
              { label: "Người phụ trách", cell: (r) => [name(r.content_owner_id), name(r.editor_id)].filter((x) => x !== "—").join(" · ") || "—", className: "hidden md:table-cell" },
              { label: "Bước", cell: (r) => STAGE[r.stage as keyof typeof STAGE]?.label ?? String(r.stage) }, { label: "Dựng", cell: (r) => <ProgressBar value={Number(r.edit_progress ?? 0)} />, className: "hidden lg:table-cell" },
              { label: "Hạn đăng", cell: (r) => formatDate(r.due_date as string), className: "hidden sm:table-cell" },
              ...(manage ? [{ label: "", cell: (r: Row) => <RpcButton rpc="link_video_project" args={{ p_video: r.id, p_project: null }} label="Gỡ" size="sm" variant="ghost" revalidate={[`/du-an/${id}`]} /> }] : [])]} />
          {manage ? (
            <RpcForm rpc="link_video_project" fixed={{ p_project: id }} submitLabel="Thêm video vào dự án" revalidate={[`/du-an/${id}`, "/video"]} columns={1} variant="soft"
              fields={[{ name: "p_video", label: "Chọn video chưa thuộc dự án nào", type: "select", as: "uuid", required: true, options: (free.data ?? []).map((v) => [String(v.id), `${v.code} – ${v.title}`] as [string, string]) }]} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Thanh toán
async function PaymentsTab({ id, p, manage, canFinance, m, today, ctx, supabase, people }: {
  id: string; p: Row; manage: boolean; canFinance: boolean; m: ProjectMoney; today: string; ctx: { userId: string }; supabase: SB; people: [string, string][];
}) {
  const [ms, inc, src, dept] = await Promise.all([
    supabase.from("project_milestones").select("*").eq("project_id", id).order("sort_order").order("due_date"),
    supabase.from("incomes").select("id, occurred_on, milestone_id, cancelled_milestone_id, status, amount").eq("project_id", id),
    canFinance ? supabase.from("income_sources").select("id, name").eq("is_active", true).order("name") : Promise.resolve({ data: [] as Row[] }),
    canFinance ? supabase.from("departments").select("id, name").eq("is_active", true).order("name") : Promise.resolve({ data: [] as Row[] }),
  ]);
  const rows = (ms.data ?? []) as Row[];
  const byMs = new Map(((inc.data ?? []) as Row[]).filter((i) => i.status === "confirmed" && i.milestone_id).map((i) => [String(i.milestone_id), i]));
  const contract = Number(m.contract_value ?? 0);
  const total = Number(m.schedule_total);
  const pct = (amt: number) => (contract > 0 ? `${Math.round((amt / contract) * 1000) / 10}%` : "—");
  const gap = m.unallocated !== null ? Number(m.unallocated) : null;
  const rev = [`/du-an/${id}`, "/thu-chi", "/du-an"];
  const sources = (src.data ?? []).map((x) => [String(x.id), String(x.name)] as [string, string]);
  const depts = (dept.data ?? []).map((x) => [String(x.id), String(x.name)] as [string, string]);
  const open = rows.filter((r) => r.payment !== "paid" && Number(r.amount) > 0);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tổng các mốc" value={money(total)} tone="slate" hint={contract > 0 ? `${pct(total)} giá trị hợp đồng ${money(contract)}` : "Chưa có giá trị hợp đồng nên không quy đổi %"} />
        <StatCard label="Đã thu" value={money(m.schedule_paid)} tone="green" />
        <StatCard label="Còn phải thu theo lịch" value={money(m.schedule_open)} tone="sky" />
        <StatCard label="Quá hạn thu" value={`${m.overdue_count} mốc · ${money(m.overdue_amount)}`} tone={m.overdue_count ? "orange" : "slate"} hint="Chỉ tính mốc đã qua hạn mà chưa thu" />
      </section>
      {gap !== null && gap !== 0 ? <Alert tone="warning" data-testid="schedule-gap">{gap > 0 ? `Còn ${money(gap)} giá trị hợp đồng chưa phân vào mốc nào.` : `Các mốc vượt giá trị hợp đồng ${money(-gap)}.`} Điều chỉnh mốc hoặc giá trị hợp đồng cho khớp.</Alert> : null}
      {p.payment_terms ? <p className="text-sm"><span className="text-muted-foreground">Phương thức thanh toán: </span>{String(p.payment_terms)}</p> : null}
      <Card>
        <CardHeader><CardTitle>Lịch thanh toán</CardTitle><p className="text-sm text-muted-foreground">Nghiệm thu → xuất hóa đơn → ghi nhận thu. Tiền chỉ được tính là đã thu khi kế toán ghi nhận; tên quản lý dự án không đủ quyền xác nhận.</p></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable rows={rows as (Row & { id: string })[]} testId="project-milestones" empty={<p className="text-sm text-muted-foreground">Chưa có mốc nào. Thêm các đợt thu (Tạm ứng, Nghiệm thu, Bàn giao…).</p>}
            cols={[
              { label: "Mốc", cell: (r) => <span className="font-medium">{String(r.name)}</span> },
              { label: "Số tiền", cell: (r) => <span className="tabular-nums">{money(r.amount as number)}</span>, className: "text-right" },
              { label: "%", cell: (r) => pct(Number(r.amount)), className: "text-right hidden sm:table-cell" },
              { label: "Hạn thu", cell: (r) => (r.payment === "paid" ? formatDate(r.due_date as string) : <DueText date={r.due_date as string | null} today={today} />) },
              { label: "Nghiệm thu", cell: (r) => (r.acceptance === "accepted" ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đã nghiệm thu</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Chưa</Badge>), className: "hidden md:table-cell" },
              { label: "Thanh toán", cell: (r) => badge(PAYMENT, r.payment) },
              { label: "Ngày thực thu", cell: (r) => { const i = byMs.get(String(r.id)); return i ? <span>{formatDate(i.occurred_on as string)} <Link className="text-xs text-primary hover:underline" href={`/thu-chi?tab=thu&da=${id}&tu=${String(i.occurred_on).slice(0, 8)}01&den=${i.occurred_on}`}>khoản thu</Link></span> : "—"; } },
              { label: "Thao tác", cell: (r) => (
                <div className="flex flex-wrap gap-1.5">
                  {manage && r.acceptance !== "accepted" ? <RpcButton rpc="milestone_acceptance" args={{ p_id: r.id, p_accepted: true }} label="Nghiệm thu" variant="soft" revalidate={rev} /> : null}
                  {manage && r.acceptance === "accepted" && r.payment === "unpaid" ? <RpcButton rpc="milestone_acceptance" args={{ p_id: r.id, p_accepted: false }} label="Hủy nghiệm thu" variant="ghost" revalidate={rev} /> : null}
                  {canFinance && r.acceptance === "accepted" && r.payment === "unpaid" ? <RpcButton rpc="milestone_invoice" args={{ p_id: r.id }} prompt={{ text: "Số hóa đơn (có thể để trống):", arg: "p_invoice_no" }} label="Xuất hóa đơn" revalidate={rev} /> : null}
                  {canFinance && r.payment === "paid" && byMs.get(String(r.id)) ? <RpcButton rpc="cancel_income" args={{ p_id: byMs.get(String(r.id))!.id }} prompt={{ text: "Lý do hủy khoản thu (điều chỉnh sai sót):", arg: "p_reason", required: true }} label="Hủy khoản thu" variant="ghost" confirm="Hủy khoản thu này? Mốc sẽ trở lại chưa thu và việc hủy được ghi nhật ký." revalidate={rev} /> : null}
                  {manage && r.payment === "unpaid" ? <RpcButton rpc="delete_milestone" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa mốc này?" revalidate={rev} /> : null}
                </div>
              ) },
            ]} />
          <p className="text-right text-sm tabular-nums" data-testid="milestone-total">Tổng các mốc: <strong>{money(total)}</strong>{contract > 0 ? <> · {pct(total)} hợp đồng · chưa phân bổ <strong>{money(contract - total)}</strong></> : null}</p>
          {canFinance && open.length ? (
            <section className="flex flex-col gap-2" aria-label="Ghi nhận thu"><h3 className="text-sm font-semibold">Ghi nhận thu</h3>
              {open.map((r) => (
                <Disclosure key={String(r.id)} summary={`Ghi nhận thu — ${r.name} (${money(r.amount as number)})`}>
                  <ReceiptForm milestoneId={String(r.id)} title={`${p.code} – ${r.name}`} amount={Number(r.amount)} dueDate={(r.due_date as string) ?? null} today={today} sources={sources} people={people} departments={depts}
                    defaultSource={sources.find(([, n]) => n === "Sản xuất video theo đơn hàng")?.[0]} defaultOwner={ctx.userId} defaultInvoice={(r.invoice_no as string) ?? null} />
                </Disclosure>
              ))}
            </section>
          ) : null}
          {manage ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Disclosure summary="Thêm mốc thanh toán">
                <RpcForm rpc="save_milestone" fixed={{ p_project: id, p_id: null }} submitLabel="Thêm mốc" revalidate={rev} resetOnSuccess columns={3}
                  fields={[{ name: "p_name", label: "Tên mốc", required: true, placeholder: "Tạm ứng / Nghiệm thu / Bàn giao" }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true, hint: contract > 0 ? `Còn chưa phân bổ ${money(contract - total)}` : "Chưa có giá trị hợp đồng nên nhập số tiền" }, { name: "p_due", label: "Hạn thu", type: "date" }, { name: "p_note", label: "Ghi chú", wide: true }]} />
              </Disclosure>
              <Disclosure summary="Sửa mốc chưa thu">
                <div className="flex flex-col gap-4">
                  {rows.filter((r) => r.payment !== "paid").length ? rows.filter((r) => r.payment !== "paid").map((r) => (
                    <RpcForm key={String(r.id)} rpc="save_milestone" fixed={{ p_project: id, p_id: r.id }} submitLabel={`Lưu “${r.name}”`} revalidate={rev} columns={3} variant="outline"
                      fields={[{ name: "p_name", label: "Tên mốc", required: true, defaultValue: String(r.name) }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true, defaultValue: Number(r.amount) }, { name: "p_due", label: "Hạn thu", type: "date", defaultValue: (r.due_date as string) ?? "" }, { name: "p_note", label: "Ghi chú", wide: true, defaultValue: (r.note as string) ?? "" }]} />
                  )) : <p className="text-sm text-muted-foreground">Mọi mốc đã thu.</p>}
                </div>
              </Disclosure>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Tài chính dự án
async function FinanceTab({ id, m, supabase }: { id: string; m: ProjectMoney; supabase: SB }) {
  const [inc, exp] = await Promise.all([
    supabase.rpc("income_list", { p_project: id, p_status: "all", p_limit: 200 }),
    supabase.rpc("expense_list", { p_project: id, p_limit: 200 }),
  ]);
  const incomes = ((inc.data as { rows?: Row[] } | null)?.rows ?? []);
  const expenses = ((exp.data as { rows?: Row[] } | null)?.rows ?? []);
  const budget = Number(m.budget_cost ?? 0);
  const over = m.budget_remaining !== null && Number(m.budget_remaining) < 0;
  const cs = m.cost_structure;
  const csTotal = cs.reduce((s, c) => s + Number(c.amount), 0);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="project-money">
        <StatCard label="Đã thu" value={money(m.income)} tone="green" hint={`Giá trị hợp đồng ${money(m.contract_value)}`} testId="m-income" />
        <StatCard label="Đã chi (đã duyệt)" value={money(m.expense)} tone="amber" hint={Number(m.expense_pending) ? `Còn ${money(m.expense_pending)} chờ duyệt` : undefined} testId="m-expense" />
        <StatCard label="Chênh lệch thu–chi" value={money(m.diff)} tone={Number(m.diff) >= 0 ? "sky" : "orange"} hint="= đã thu − đã chi. Không phải lợi nhuận kế toán" testId="m-diff" />
        <StatCard label="Còn phải thu theo lịch" value={money(m.schedule_open)} tone="violet" hint={Number(m.overdue_count) ? `${m.overdue_count} mốc quá hạn` : "Không có mốc quá hạn"} testId="m-open" />
      </section>
      {budget > 0 ? (
        <Alert tone={over ? "error" : "info"} data-testid="budget-line">
          {over ? <>Vượt ngân sách chi <strong>{money(-Number(m.budget_remaining))}</strong> (ngân sách chi {money(budget)}).</> : <>Ngân sách chi còn lại <strong>{money(m.budget_remaining)}</strong> trên {money(budget)}.</>} Ngân sách này là hạn mức CHI PHÍ, so với chi đã duyệt.
        </Alert>
      ) : null}
      {cs.length ? (
        <Card><CardHeader><CardTitle>Cơ cấu chi phí</CardTitle></CardHeader><CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {cs.map((c) => <li key={c.category} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3"><span>{c.category}</span><span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${csTotal ? (Number(c.amount) / csTotal) * 100 : 0}%` }} /></span><span className="tabular-nums">{money(c.amount)}</span></li>)}
          </ul>
        </CardContent></Card>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Khoản thu</CardTitle></CardHeader><CardContent>
          <DataTable rows={incomes as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có khoản thu.</p>}
            cols={[{ label: "Ngày", cell: (x) => formatDate(x.occurred_on as string) }, { label: "Nội dung", cell: (x) => <span>{String(x.description ?? "—")}{x.is_milestone ? <span className="block text-xs text-muted-foreground">Thu theo mốc {String(x.milestone_name ?? "")}</span> : null}</span> },
              { label: "Số tiền", cell: (x) => <span className={x.status === "cancelled" ? "line-through" : ""}>{money(x.amount as number)}</span>, className: "text-right" }, { label: "Chứng từ", cell: (x) => (Number(x.file_count) ? `${x.file_count} tệp` : "Thiếu"), className: "hidden sm:table-cell" }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Khoản chi</CardTitle></CardHeader><CardContent>
          <DataTable rows={expenses as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có chi phí.</p>}
            cols={[{ label: "Ngày", cell: (x) => formatDate(x.occurred_on as string) }, { label: "Nội dung", cell: (x) => <span>{String(x.description ?? x.payee_name ?? "—")}<span className="block text-xs text-muted-foreground">{String(x.category_name ?? "Chưa phân loại")}</span></span> }, { label: "Số tiền", cell: (x) => money(x.amount as number), className: "text-right" }, { label: "Duyệt", cell: (x) => badge(APPROVAL, x.approval) }, { label: "Chứng từ", cell: (x) => (x.has_voucher ? "Có" : "Thiếu"), className: "hidden sm:table-cell" }]} />
        </CardContent></Card>
      </div>
      <Link href={`/thu-chi?tab=thu&da=${id}&tu=2000-01-01&den=2999-12-31`} className="w-fit text-sm font-medium text-primary hover:underline">Mở toàn bộ giao dịch của dự án trong Thu chi →</Link>
    </>
  );
}

// ---------------------------------------------------------------- Tài liệu
async function DocsTab({ id, manage, canMoney, canFinance, supabase, name }: { id: string; manage: boolean; canMoney: boolean; canFinance: boolean; supabase: SB; name: (u: unknown) => string }) {
  const { data } = await supabase.from("project_files").select("id, kind, name, size_bytes, created_at, uploaded_by").eq("project_id", id).order("created_at", { ascending: false });
  const files = (data ?? []) as { id: string; kind: string; name: string; size_bytes: number; created_at: string; uploaded_by: string | null }[];
  let vouchers: { id: string; kind: string; ref_id: string; name: string; created_at: string }[] = [];
  let incomeRows: Row[] = [], expenseRows: Row[] = [];
  if (canMoney) {
    const [i, e] = await Promise.all([supabase.rpc("income_list", { p_project: id, p_limit: 200 }), supabase.rpc("expense_list", { p_project: id, p_limit: 200 })]);
    incomeRows = (i.data as { rows?: Row[] } | null)?.rows ?? [];
    expenseRows = (e.data as { rows?: Row[] } | null)?.rows ?? [];
    const refs = [...incomeRows, ...expenseRows].map((r) => String(r.id));
    if (refs.length) { const { data: f } = await supabase.from("finance_files").select("id, kind, ref_id, name, created_at").in("ref_id", refs).order("created_at", { ascending: false }); vouchers = (f ?? []) as typeof vouchers; }
  }
  const label = new Map<string, string>([...incomeRows.map((r) => [String(r.id), `Thu ${formatDate(r.occurred_on as string)} · ${money(r.amount as number)}`] as [string, string]), ...expenseRows.map((r) => [String(r.id), `Chi ${formatDate(r.occurred_on as string)} · ${money(r.amount as number)}`] as [string, string])]);
  const kinds = (Object.entries(KIND_LABEL) as [string, string][]).filter(([k]) => canMoney || !["quote", "contract"].includes(k));
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Tài liệu dự án ({files.length})</CardTitle><p className="text-sm text-muted-foreground">Tệp của dự án (kế hoạch, báo cáo, kịch bản…). Báo giá / hợp đồng chỉ người xem được tiền thấy. Chứng từ thu chi nằm riêng bên dưới.</p></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable rows={files} testId="project-files" empty={<p className="text-sm text-muted-foreground">Chưa có tài liệu.</p>}
            cols={[
              { label: "Tên tệp", cell: (f) => <span className="font-medium">{f.name}</span> }, { label: "Loại", cell: (f) => KIND_LABEL[f.kind] ?? f.kind },
              { label: "Tải lên", cell: (f) => `${formatDate(f.created_at.slice(0, 10))} · ${name(f.uploaded_by)}`, className: "hidden md:table-cell" },
              { label: "", cell: (f) => (
                <div className="flex flex-wrap gap-2 text-sm">
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/du-an/tai-lieu/${f.id}?xem=1`} target="_blank" rel="noreferrer"><Eye className="size-3.5" aria-hidden />Xem</a>
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/du-an/tai-lieu/${f.id}`}><Download className="size-3.5" aria-hidden />Tải</a>
                  {manage ? <RpcButton rpc="delete_project_file" args={{ p_id: f.id }} label="Xóa" variant="ghost" confirm="Xóa tài liệu này?" revalidate={[`/du-an/${id}`]} /> : null}
                </div>
              ) },
            ]} />
          {manage ? <FileUpload id="pf" action={uploadProjectFileAction} hidden={{ project: id }} kinds={kinds} label="Chọn tệp (có thể nhiều tệp)" /> : null}
        </CardContent>
      </Card>
      {canMoney ? (
        <Card>
          <CardHeader><CardTitle>Chứng từ thu chi của dự án ({vouchers.length})</CardTitle><p className="text-sm text-muted-foreground">Nhiều chứng từ có thể gắn cho một giao dịch; số tiền vẫn chỉ tính một lần.</p></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DataTable rows={vouchers} testId="project-vouchers" empty={<p className="text-sm text-muted-foreground">Chưa có chứng từ.</p>}
              cols={[{ label: "Tệp", cell: (f) => <span className="font-medium">{f.name}</span> }, { label: "Giao dịch", cell: (f) => label.get(f.ref_id) ?? "—" },
                { label: "", cell: (f) => <div className="flex gap-2 text-sm"><a className="text-primary hover:underline" href={`/thu-chi/chung-tu/${f.id}?xem=1`} target="_blank" rel="noreferrer">Xem</a><a className="text-primary hover:underline" href={`/thu-chi/chung-tu/${f.id}`}>Tải</a></div> }]} />
            {canFinance ? (
              <Disclosure summary="Đính kèm chứng từ cho giao dịch">
                <div className="flex flex-col gap-4">
                  {[...incomeRows.map((r) => ({ ...r, k: "income" } as Row & { k: string })), ...expenseRows.map((r) => ({ ...r, k: "expense" } as Row & { k: string }))].slice(0, 12).map((r) => (
                    <div key={String(r.id)} className="flex flex-col gap-1.5 border-b pb-3 last:border-0"><span className="text-sm font-medium">{label.get(String(r.id))}</span><FileUpload id={`fv-${r.id}`} action={uploadFinanceFileAction} hidden={{ kind: String(r.k), ref: String(r.id) }} label="Chứng từ" /></div>
                  ))}
                </div>
              </Disclosure>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function FreelancersTab({ id, manage }: { id: string; manage: boolean }) {
  const supabase = await createSupabaseServerClient();
  const [{ data }, fl] = await Promise.all([
    supabase.from("freelance_assignments").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    manage ? supabase.from("freelancers").select("id, full_name").eq("is_active", true).is("deleted_at", null).order("full_name") : Promise.resolve({ data: [] as Row[] }),
  ]);
  const names = new Map<string, string>();
  const ids = [...new Set((data ?? []).map((a) => a.freelancer_id as string))];
  if (ids.length) { const { data: f2 } = await supabase.from("freelancers").select("id, full_name").in("id", ids); for (const f of f2 ?? []) names.set(f.id as string, f.full_name as string); }
  return (
    <Card>
      <CardHeader><CardTitle>Đầu việc giao cộng tác viên ({data?.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTable rows={(data ?? []) as (Row & { id: string })[]} href={(r) => `/cong-tac-vien/viec/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa giao việc cho cộng tác viên.</p>}
          cols={[{ label: "Đầu việc", cell: (r) => String(r.title) }, { label: "Cộng tác viên", cell: (r) => names.get(String(r.freelancer_id)) ?? "—" }, { label: "Hạn", cell: (r) => formatDate(r.due_date as string), className: "hidden sm:table-cell" },
            { label: "Thù lao", cell: (r) => money(r.fee as number), className: "text-right" }, { label: "Trạng thái", cell: (r) => badge(ASSIGNMENT, r.status) }, { label: "TT", cell: (r) => (r.status === "approved" ? badge(PAYMENT, r.payment) : "—") }]} />
        {manage ? (
          <Disclosure summary="Giao việc cho cộng tác viên">
            <RpcForm rpc="assign_freelancer" fixed={{ p_project: id }} submitLabel="Giao việc" revalidate={[`/du-an/${id}`, "/cong-tac-vien"]} resetOnSuccess columns={3}
              fields={[
                { name: "p_freelancer", label: "Cộng tác viên", type: "select", as: "uuid", required: true, options: (fl.data ?? []).map((f) => [String(f.id), String(f.full_name)] as [string, string]) },
                { name: "p_title", label: "Tên đầu việc", required: true }, { name: "p_fee", label: "Thù lao (₫)", type: "number", required: true },
                { name: "p_due", label: "Hạn bàn giao", type: "date" }, { name: "p_description", label: "Yêu cầu chi tiết", type: "textarea" },
              ]} />
          </Disclosure>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function BonusTab({ id, manage, memberOptions, canDecide }: { id: string; manage: boolean; memberOptions: [string, string][]; canDecide: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("project_bonuses").select("*").eq("project_id", id).order("created_at", { ascending: false });
  const nm = new Map(memberOptions);
  return (
    <Card>
      <CardHeader><CardTitle>Thưởng theo dự án</CardTitle><p className="text-sm text-muted-foreground">Quản lý dự án đề xuất → kế toán duyệt → tự vào bảng lương của tháng được chọn.</p></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTable rows={(data ?? []) as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có đề xuất thưởng.</p>}
          cols={[{ label: "Người nhận", cell: (r) => nm.get(String(r.user_id)) ?? "—" }, { label: "Tháng", cell: (r) => String(r.month_date).slice(0, 7) }, { label: "Số tiền", cell: (r) => money(r.amount as number), className: "text-right" }, { label: "Lý do", cell: (r) => String(r.reason ?? "—"), className: "hidden md:table-cell" }, { label: "Trạng thái", cell: (r) => badge(BONUS, r.status) },
            ...(canDecide ? [{ label: "", cell: (r: Row) => r.status === "requested" ? (<div className="flex gap-1.5"><RpcButton rpc="decide_project_bonus" args={{ p_id: r.id, p_approve: true }} label="Duyệt" variant="soft" revalidate={[`/du-an/${id}`]} /><RpcButton rpc="decide_project_bonus" args={{ p_id: r.id, p_approve: false }} prompt={{ text: "Lý do từ chối:", arg: "p_reason", required: true }} label="Từ chối" variant="ghost" revalidate={[`/du-an/${id}`]} /></div>) : null }] : [])]} />
        {manage ? (
          <Disclosure summary="Đề xuất thưởng">
            <RpcForm rpc="request_project_bonus" fixed={{ p_project: id }} submitLabel="Gửi đề xuất" revalidate={[`/du-an/${id}`]} resetOnSuccess columns={3}
              fields={[{ name: "p_user", label: "Người nhận", type: "select", as: "uuid", required: true, options: memberOptions }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true }, { name: "p_month", label: "Tháng chi trả (chọn ngày bất kỳ)", type: "date", required: true }, { name: "p_reason", label: "Lý do", wide: true }]} />
          </Disclosure>
        ) : null}
      </CardContent>
    </Card>
  );
}
