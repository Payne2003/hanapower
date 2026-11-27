import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { ASSIGNMENT, APPROVAL, BONUS, PAYMENT, PROJECT_STAGE, badge } from "@/lib/status-maps";
import { STAGE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Disclosure } from "@/components/disclosure";
import { Badge } from "@/components/ui/badge";
import { NotesPanel } from "@/components/notes-panel";

export const metadata: Metadata = { title: "Dự án" };
type Sp = { tab?: string };

const TABS: [string, string][] = [["tong-quan", "Tổng quan"], ["video", "Video"], ["nghiem-thu", "Nghiệm thu & thanh toán"], ["tai-chinh", "Lãi / lỗ"], ["cong-tac-vien", "Cộng tác viên"], ["thuong", "Thưởng"]];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const p = data as Row;
  const manage = can(ctx, "projects.manage_all") || p.manager_id === ctx.user_id;
  const money_ = can(ctx, "finance.view") || manage;
  const tab = TABS.some(([k]) => k === sp.tab) && (money_ || !["nghiem-thu", "tai-chinh", "thuong"].includes(String(sp.tab))) ? String(sp.tab) : "tong-quan";
  const [L, members] = await Promise.all([
    loadLookups(["accounts", "people"]),
    supabase.from("project_members").select("user_id, role_label").eq("project_id", id),
  ]);
  const memberIds = (members.data ?? []).map((m) => m.user_id as string);
  const rev = [`/du-an/${id}`, "/du-an"];
  const stageBtns = (Object.keys(PROJECT_STAGE) as string[]).filter((s) => s !== p.stage);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/du-an" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Dự án</Link>
      <PageHeader
        title={`${p.code} · ${p.name}`}
        eyebrow={<span>{p.customer_id ? <Link className="text-primary hover:underline" href={`/tai-khoan/${p.customer_id}`}>{nameOf(L, "accounts", p.customer_id)}</Link> : "Dự án nội bộ"}{p.contract_id ? <> · <Link className="text-primary hover:underline" href={`/hop-dong/${p.contract_id}`}>Hợp đồng</Link></> : null}</span>}
        actions={badge(PROJECT_STAGE, p.stage)}
      />
      <nav aria-label="Các phần của dự án" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.filter(([k]) => money_ || !["nghiem-thu", "tai-chinh", "thuong"].includes(k)).map(([k, l]) => (
          <Link key={k} href={`/du-an/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>
        ))}
      </nav>

      {tab === "tong-quan" ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Quản lý dự án" value={nameOf(L, "people", p.manager_id)} tone="green" />
            <StatCard label="Bắt đầu" value={formatDate(p.start_date as string)} tone="sky" />
            <StatCard label="Kết thúc" value={formatDate(p.end_date as string)} tone="violet" />
            <StatCard label="Thành viên" value={memberIds.length} tone="slate" />
          </section>
          {p.description ? <Card><CardContent className="pt-5 text-sm">{String(p.description)}</CardContent></Card> : null}
          <Card>
            <CardHeader><CardTitle>Thành viên</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-wrap gap-2">
                {(members.data ?? []).map((m) => <li key={String(m.user_id)}><Badge className="bg-muted text-foreground ring-border">{nameOf(L, "people", m.user_id)}{m.role_label ? ` · ${m.role_label}` : ""}{m.user_id === p.manager_id ? " · QL" : ""}</Badge></li>)}
              </ul>
              {manage ? (
                <Disclosure summary="Sửa danh sách thành viên">
                  <RpcForm rpc="set_project_members" fixed={{ p_id: id }} submitLabel="Lưu thành viên" revalidate={rev} columns={1}
                    fields={[{ name: "p_members", label: "Thành viên", type: "checks", options: (L.people ?? []).filter(([v]) => v !== p.manager_id), defaultValue: memberIds }]} />
                </Disclosure>
              ) : null}
            </CardContent>
          </Card>
          {manage ? (
            <Card>
              <CardHeader><CardTitle>Trạng thái dự án</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {stageBtns.map((s) => <RpcButton key={s} rpc="set_project_stage" args={{ p_id: id, p_stage: s }} label={PROJECT_STAGE[s]![0]} variant={s === "cancelled" ? "destructive" : "outline"} confirm={s === "cancelled" ? "Hủy dự án này?" : undefined} revalidate={rev} />)}
              </CardContent>
            </Card>
          ) : null}
          <NotesPanel type="project" id={id} canWrite userId={ctx.user_id} people={L.people ?? []} isManager={manage} />
          {manage ? <ProjectEdit p={p} L={L} id={id} /> : null}
        </>
      ) : null}

      {tab === "video" ? <VideosTab id={id} manage={manage} /> : null}
      {tab === "nghiem-thu" ? <MilestonesTab id={id} manage={manage} canFinance={can(ctx, "finance.manage")} /> : null}
      {tab === "tai-chinh" ? <FinanceTab id={id} /> : null}
      {tab === "cong-tac-vien" ? <FreelancersTab id={id} manage={manage || can(ctx, "freelancers.manage")} /> : null}
      {tab === "thuong" ? <BonusTab id={id} manage={manage} memberOptions={(members.data ?? []).map((m) => [m.user_id as string, nameOf(L, "people", m.user_id)] as [string, string])} canDecide={can(ctx, "payroll.approve")} /> : null}
    </div>
  );
}

async function ProjectEdit({ p, L, id }: { p: Row; L: Awaited<ReturnType<typeof loadLookups>>; id: string }) {
  const supabase = await createSupabaseServerClient();
  const { data: b } = await supabase.from("project_budgets").select("contract_value, budget_cost").eq("project_id", id).maybeSingle();
  return (
    <Disclosure summary="Sửa thông tin dự án">
      <RpcForm rpc="update_project" fixed={{ p_id: id }} submitLabel="Lưu thông tin" revalidate={[`/du-an/${id}`, "/du-an"]} columns={3}
        fields={[
          { name: "p_name", label: "Tên dự án", required: true, defaultValue: String(p.name), wide: true },
          { name: "p_customer_id", label: "Khách hàng", type: "select", as: "uuid", options: L.accounts ?? [], defaultValue: (p.customer_id as string) ?? "" },
          { name: "p_manager_id", label: "Quản lý dự án", type: "select", as: "uuid", options: L.people ?? [], defaultValue: (p.manager_id as string) ?? "" },
          { name: "p_start", label: "Bắt đầu", type: "date", defaultValue: (p.start_date as string) ?? "" }, { name: "p_end", label: "Kết thúc", type: "date", defaultValue: (p.end_date as string) ?? "" },
          { name: "p_contract_value", label: "Giá trị hợp đồng (₫)", type: "number", defaultValue: Number(b?.contract_value ?? 0) },
          { name: "p_budget_cost", label: "Ngân sách chi phí (₫)", type: "number", defaultValue: Number(b?.budget_cost ?? 0) },
          { name: "p_description", label: "Mô tả", type: "textarea", defaultValue: (p.description as string) ?? "" },
        ]} />
    </Disclosure>
  );
}

async function VideosTab({ id, manage }: { id: string; manage: boolean }) {
  const supabase = await createSupabaseServerClient();
  const [inP, free] = await Promise.all([
    supabase.from("videos").select("id, code, title, stage, due_date").eq("project_id", id).order("code"),
    manage ? supabase.from("videos").select("id, code, title").is("project_id", null).not("stage", "in", "(cancelled)").order("code", { ascending: false }).limit(200) : Promise.resolve({ data: [] as Row[] }),
  ]);
  return (
    <Card>
      <CardHeader><CardTitle>Video của dự án ({inP.data?.length ?? 0})</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTable rows={(inP.data ?? []) as (Row & { id: string })[]} href={(r) => `/video/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có video nào gắn vào dự án.</p>}
          cols={[{ label: "Mã", cell: (r) => String(r.code) }, { label: "Tên video", cell: (r) => String(r.title) }, { label: "Bước", cell: (r) => STAGE[r.stage as keyof typeof STAGE]?.label ?? String(r.stage) }, { label: "Hạn đăng", cell: (r) => formatDate(r.due_date as string), className: "hidden sm:table-cell" },
            ...(manage ? [{ label: "", cell: (r: Row) => <RpcButton rpc="link_video_project" args={{ p_video: r.id, p_project: null }} label="Gỡ" size="sm" variant="ghost" revalidate={[`/du-an/${id}`]} /> }] : [])]} />
        {manage ? (
          <RpcForm rpc="link_video_project" fixed={{ p_project: id }} submitLabel="Thêm video vào dự án" revalidate={[`/du-an/${id}`, "/video"]} columns={1} variant="soft"
            fields={[{ name: "p_video", label: "Chọn video chưa thuộc dự án nào", type: "select", as: "uuid", required: true, options: (free.data ?? []).map((v) => [String(v.id), `${v.code} – ${v.title}`] as [string, string]) }]} />
        ) : null}
      </CardContent>
    </Card>
  );
}

async function MilestonesTab({ id, manage, canFinance }: { id: string; manage: boolean; canFinance: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("project_milestones").select("*").eq("project_id", id).order("sort_order");
  const rows = (data ?? []) as Row[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const rev = [`/du-an/${id}`, "/thu-chi"];
  return (
    <Card>
      <CardHeader><CardTitle>Mốc nghiệm thu & thanh toán</CardTitle><p className="text-sm text-muted-foreground">Tổng các mốc: {money(total)}. Nghiệm thu xong → kế toán xuất hóa đơn → ghi nhận thu tiền.</p></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTable rows={rows as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có mốc nào.</p>}
          cols={[
            { label: "Mốc", cell: (r) => <span className="font-medium">{String(r.name)}</span> }, { label: "Số tiền", cell: (r) => money(r.amount as number), className: "text-right tabular-nums" },
            { label: "Hạn", cell: (r) => formatDate(r.due_date as string), className: "hidden md:table-cell" },
            { label: "Nghiệm thu", cell: (r) => (r.acceptance === "accepted" ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đã nghiệm thu</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Chưa</Badge>) },
            { label: "Thanh toán", cell: (r) => badge(PAYMENT, r.payment) },
            { label: "Thao tác", cell: (r) => (
              <div className="flex flex-wrap gap-1.5">
                {manage && r.acceptance !== "accepted" ? <RpcButton rpc="milestone_acceptance" args={{ p_id: r.id, p_accepted: true }} label="Nghiệm thu" variant="soft" revalidate={rev} /> : null}
                {manage && r.acceptance === "accepted" && r.payment === "unpaid" ? <RpcButton rpc="milestone_acceptance" args={{ p_id: r.id, p_accepted: false }} label="Hủy nghiệm thu" variant="ghost" revalidate={rev} /> : null}
                {canFinance && r.acceptance === "accepted" && r.payment === "unpaid" ? <RpcButton rpc="milestone_invoice" args={{ p_id: r.id }} prompt={{ text: "Số hóa đơn (có thể để trống):", arg: "p_invoice_no" }} label="Xuất hóa đơn" revalidate={rev} /> : null}
                {canFinance && r.payment === "invoiced" ? <RpcButton rpc="milestone_pay" args={{ p_id: r.id }} label="Đã thu tiền" variant="default" confirm="Ghi nhận đã thu tiền mốc này?" revalidate={rev} /> : null}
                {manage && r.payment === "unpaid" ? <RpcButton rpc="delete_milestone" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa mốc này?" revalidate={rev} /> : null}
              </div>
            ) },
          ]} />
        {manage ? (
          <Disclosure summary="Thêm mốc">
            <RpcForm rpc="save_milestone" fixed={{ p_project: id, p_id: null }} submitLabel="Thêm mốc" revalidate={rev} resetOnSuccess columns={3}
              fields={[{ name: "p_name", label: "Tên mốc", required: true }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true }, { name: "p_due", label: "Hạn", type: "date" }, { name: "p_note", label: "Ghi chú", wide: true }]} />
          </Disclosure>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function FinanceTab({ id }: { id: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: f }, inc, exp] = await Promise.all([
    supabase.from("project_financials").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("incomes").select("id, occurred_on, amount, description, status").eq("project_id", id).order("occurred_on", { ascending: false }),
    supabase.from("expenses").select("id, occurred_on, amount, description, approval, payment, payee_name").eq("project_id", id).is("deleted_at", null).order("occurred_on", { ascending: false }),
  ]);
  const r = (f ?? {}) as Row;
  const profit = Number(r.revenue ?? 0) - Number(r.cost ?? 0);
  const over = Number(r.budget_cost ?? 0) > 0 && Number(r.cost ?? 0) > Number(r.budget_cost);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Doanh thu đã thu" value={money(r.revenue as number)} tone="green" hint={`Giá trị HĐ ${money(r.contract_value as number)}`} />
        <StatCard label="Chi phí đã duyệt" value={money(r.cost as number)} tone={over ? "orange" : "amber"} hint={Number(r.budget_cost) ? `Ngân sách ${money(r.budget_cost as number)}${over ? " — VƯỢT" : ""}` : undefined} />
        <StatCard label={profit >= 0 ? "Lãi tạm tính" : "Lỗ tạm tính"} value={money(profit)} tone={profit >= 0 ? "sky" : "orange"} hint="= đã thu − chi phí đã duyệt" />
        <StatCard label="Phải thu / phải trả" value={`${money(r.receivable as number)} / ${money(r.payable as number)}`} tone="violet" hint="Mốc đã nghiệm thu chưa thu / chi đã duyệt chưa trả" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Khoản thu</CardTitle></CardHeader><CardContent>
          <DataTable rows={(inc.data ?? []) as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có khoản thu.</p>}
            cols={[{ label: "Ngày", cell: (x) => formatDate(x.occurred_on as string) }, { label: "Nội dung", cell: (x) => String(x.description ?? "—") }, { label: "Số tiền", cell: (x) => <span className={x.status === "cancelled" ? "line-through" : ""}>{money(x.amount as number)}</span>, className: "text-right" }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Chi phí</CardTitle></CardHeader><CardContent>
          <DataTable rows={(exp.data ?? []) as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có chi phí.</p>}
            cols={[{ label: "Ngày", cell: (x) => formatDate(x.occurred_on as string) }, { label: "Nội dung", cell: (x) => String(x.description ?? x.payee_name ?? "—") }, { label: "Số tiền", cell: (x) => money(x.amount as number), className: "text-right" }, { label: "Duyệt", cell: (x) => badge(APPROVAL, x.approval) }, { label: "TT", cell: (x) => badge(PAYMENT, x.payment) }]} />
        </CardContent></Card>
      </div>
    </>
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
