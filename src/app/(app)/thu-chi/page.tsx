import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { ADVANCE, APPROVAL, PAYMENT, badge, PROJECT_STAGE } from "@/lib/status-maps";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Thu chi & công nợ" };

const TABS: [string, string][] = [["chi-phi", "Chi phí"], ["tam-ung", "Tạm ứng"], ["thu", "Khoản thu"], ["cong-no", "Công nợ"], ["lai-lo", "Lãi / lỗ theo dự án"]];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const canView = can(ctx, "finance.view");
  const tabs = TABS.filter(([k]) => canView || k === "chi-phi" || k === "tam-ung");
  const tab = tabs.some(([k]) => k === sp.tab) ? String(sp.tab) : "chi-phi";
  const month = ctx.today.slice(0, 7);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${month}-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : ctx.today;
  const supabase = await createSupabaseServerClient();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Thu chi & công nợ" description="Mọi khoản gắn dự án được; chi phí qua bước duyệt rồi mới thanh toán. Người không phải kế toán chỉ thấy khoản của mình và của dự án mình quản lý." />
      <nav aria-label="Phần tài chính" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {tabs.map(([k, l]) => <Link key={k} href={`/thu-chi?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
      </nav>
      {tab === "chi-phi" ? <Expenses ctxUser={ctx.user_id} canApprove={can(ctx, "finance.approve") || hasRole(ctx, "manager")} canPay={can(ctx, "finance.manage")} canExport={canView} supabase={supabase} today={ctx.today} /> : null}
      {tab === "tam-ung" ? <Advances ctxUser={ctx.user_id} canApprove={can(ctx, "finance.approve") || hasRole(ctx, "manager")} canPay={can(ctx, "finance.manage")} supabase={supabase} /> : null}
      {tab === "thu" && canView ? <Incomes canManage={can(ctx, "finance.manage")} supabase={supabase} from={from} to={to} today={ctx.today} /> : null}
      {tab === "cong-no" && canView ? <Debts supabase={supabase} /> : null}
      {tab === "lai-lo" && canView ? <Pnl supabase={supabase} from={from} to={to} /> : null}
    </div>
  );
}

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function projectOptions(supabase: SB): Promise<[string, string][]> {
  const { data } = await supabase.from("projects").select("id, code, name").is("deleted_at", null).not("stage", "in", "(cancelled,completed)").order("code");
  return (data ?? []).map((p) => [p.id as string, `${p.code} – ${p.name}`]);
}

async function Expenses({ ctxUser, canApprove, canPay, canExport, supabase, today }: { ctxUser: string; canApprove: boolean; canPay: boolean; canExport: boolean; supabase: SB; today: string }) {
  const [{ data }, projects, cats, adv, L] = await Promise.all([
    supabase.from("expenses").select("*").is("deleted_at", null).order("occurred_on", { ascending: false }).limit(200),
    projectOptions(supabase),
    supabase.from("expense_categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("advances").select("id, amount, purpose").eq("user_id", ctxUser).eq("status", "disbursed"),
    loadLookups(["people"]),
  ]);
  const rows = (data ?? []) as Row[];
  const pName = new Map(projects);
  const cName = new Map((cats.data ?? []).map((c) => [c.id as string, c.name as string]));
  const rev = ["/thu-chi", "/du-an"];
  const toPay = rows.filter((r) => r.approval === "approved" && r.payment === "unpaid").reduce((s, r) => s + Number(r.amount), 0);
  const pending = rows.filter((r) => r.approval === "submitted").reduce((s, r) => s + Number(r.amount), 0);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Chờ duyệt" value={money(pending)} tone="amber" />
        <StatCard label="Đã duyệt, chờ thanh toán" value={money(toPay)} tone="orange" />
        <StatCard label="Số khoản (200 gần nhất)" value={rows.length} tone="slate" />
        {canExport ? <a href={`/thu-chi/xuat?type=expenses&from=${today.slice(0, 7)}-01&to=${today}`} className="flex items-center justify-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium text-primary shadow-[var(--shadow-card)] hover:bg-primary-soft/40"><Download className="size-4" aria-hidden />Xuất Excel cho kế toán</a> : null}
      </section>
      <Disclosure summary="Đề nghị chi / ghi nhận chi phí">
        <RpcForm rpc="create_expense" submitLabel="Gửi duyệt" revalidate={rev} resetOnSuccess columns={3}
          fixed={{ p_submit: true }}
          fields={[
            { name: "p_occurred_on", label: "Ngày phát sinh", type: "date", required: true, defaultValue: today }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true },
            { name: "p_category_id", label: "Loại chi phí", type: "select", as: "uuid", options: (cats.data ?? []).map((c) => [c.id as string, c.name as string]) },
            { name: "p_project_id", label: "Dự án", type: "select", as: "uuid", options: projects, hint: "Chi phí không gắn dự án chỉ kế toán tạo được" },
            { name: "p_payee_type", label: "Người nhận", type: "select", required: true, defaultValue: "vendor", options: [["vendor", "Nhà cung cấp"], ["freelancer", "Cộng tác viên"], ["employee", "Nhân viên"], ["other", "Khác"]] },
            { name: "p_payee_name", label: "Tên người / đơn vị nhận" },
            { name: "p_description", label: "Nội dung", wide: true }, { name: "p_due_date", label: "Hạn thanh toán", type: "date" }, { name: "p_invoice_url", label: "Link chứng từ (http…)", type: "url" },
            { name: "p_advance_id", label: "Trừ vào tạm ứng", type: "select", as: "uuid", options: (adv.data ?? []).map((a) => [a.id as string, `${money(a.amount as number)} – ${a.purpose}`]) },
          ]} />
      </Disclosure>
      <DataTable rows={rows as (Row & { id: string })[]} testId="list-expenses" empty={<EmptyState title="Chưa có chi phí" description="Bấm “Đề nghị chi” để tạo khoản đầu tiên." />}
        cols={[
          { label: "Ngày", cell: (r) => formatDate(r.occurred_on as string) },
          { label: "Nội dung", cell: (r) => <div><p className="font-medium">{String(r.description ?? r.payee_name ?? "—")}</p><p className="text-xs text-muted-foreground">{cName.get(String(r.category_id)) ?? "Chưa phân loại"}{r.project_id ? ` · ${pName.get(String(r.project_id)) ?? "dự án"}` : ""}{r.requested_by ? ` · ${nameOf(L, "people", r.requested_by)}` : ""}</p></div> },
          { label: "Số tiền", cell: (r) => <strong>{money(r.amount as number)}</strong>, className: "text-right tabular-nums" },
          { label: "Duyệt", cell: (r) => badge(APPROVAL, r.approval) }, { label: "Thanh toán", cell: (r) => badge(PAYMENT, r.payment) },
          { label: "Thao tác", cell: (r) => (
            <div className="flex flex-wrap gap-1.5">
              {r.approval === "draft" && r.requested_by === ctxUser ? <RpcButton rpc="submit_expense" args={{ p_id: r.id }} label="Gửi duyệt" variant="soft" revalidate={rev} /> : null}
              {canApprove && r.approval === "submitted" ? <><RpcButton rpc="decide_expense" args={{ p_id: r.id, p_decision: "approve" }} label="Duyệt" variant="soft" revalidate={rev} /><RpcButton rpc="decide_expense" args={{ p_id: r.id, p_decision: "reject" }} prompt={{ text: "Lý do từ chối:", arg: "p_note", required: true }} label="Từ chối" variant="ghost" revalidate={rev} /></> : null}
              {canPay && r.approval === "approved" && r.payment === "unpaid" ? <RpcButton rpc="pay_expense" args={{ p_id: r.id }} label="Đã thanh toán" variant="default" confirm="Xác nhận đã thanh toán khoản này?" revalidate={rev} /> : null}
              {r.payment === "unpaid" && (r.requested_by === ctxUser || canPay) && r.approval !== "approved" ? <RpcButton rpc="delete_expense" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa khoản chi này?" revalidate={rev} /> : null}
              {r.approval === "rejected" && r.reject_reason ? <span className="text-xs text-destructive">Lý do: {String(r.reject_reason)}</span> : null}
            </div>
          ) },
        ]} />
    </>
  );
}

async function Advances({ ctxUser, canApprove, canPay, supabase }: { ctxUser: string; canApprove: boolean; canPay: boolean; supabase: SB }) {
  const [{ data }, projects, L] = await Promise.all([supabase.from("advances").select("*").order("created_at", { ascending: false }).limit(200), projectOptions(supabase), loadLookups(["people"])]);
  const rows = (data ?? []) as Row[];
  const rev = ["/thu-chi"];
  return (
    <>
      <Disclosure summary="Đề nghị tạm ứng">
        <RpcForm rpc="request_advance" submitLabel="Gửi đề nghị" revalidate={rev} resetOnSuccess columns={3}
          fields={[{ name: "p_project_id", label: "Dự án", type: "select", as: "uuid", options: projects }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true }, { name: "p_purpose", label: "Mục đích", required: true, wide: true }]} />
      </Disclosure>
      <DataTable rows={rows as (Row & { id: string })[]} empty={<EmptyState title="Chưa có tạm ứng" />}
        cols={[
          { label: "Người ứng", cell: (r) => nameOf(L, "people", r.user_id) }, { label: "Mục đích", cell: (r) => String(r.purpose) },
          { label: "Số tiền", cell: (r) => <strong>{money(r.amount as number)}</strong>, className: "text-right" },
          { label: "Đã chi / hoàn", cell: (r) => (r.status === "settled" ? `${money(r.settled_amount as number)} / ${money(r.refund_amount as number)}` : "—"), className: "hidden md:table-cell" },
          { label: "Trạng thái", cell: (r) => badge(ADVANCE, r.status) },
          { label: "Thao tác", cell: (r) => (
            <div className="flex flex-wrap gap-1.5">
              {canApprove && r.status === "requested" ? <><RpcButton rpc="decide_advance" args={{ p_id: r.id, p_decision: "approve" }} label="Duyệt" variant="soft" revalidate={rev} /><RpcButton rpc="decide_advance" args={{ p_id: r.id, p_decision: "reject" }} prompt={{ text: "Lý do từ chối:", arg: "p_note", required: true }} label="Từ chối" variant="ghost" revalidate={rev} /></> : null}
              {canPay && r.status === "approved" ? <RpcButton rpc="disburse_advance" args={{ p_id: r.id }} label="Đã giải ngân" variant="default" confirm="Xác nhận đã chuyển tiền tạm ứng?" revalidate={rev} /> : null}
              {r.status === "disbursed" && (r.user_id === ctxUser || canPay) ? <RpcButton rpc="settle_advance" args={{ p_id: r.id }} label="Quyết toán" variant="outline" confirm="Quyết toán tạm ứng dựa trên các chi phí đã duyệt gắn với khoản này?" revalidate={rev} /> : null}
            </div>
          ) },
        ]} />
    </>
  );
}

async function Incomes({ canManage, supabase, from, to, today }: { canManage: boolean; supabase: SB; from: string; to: string; today: string }) {
  const [{ data }, projects, src] = await Promise.all([
    supabase.from("incomes").select("*").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on", { ascending: false }),
    projectOptions(supabase), supabase.from("income_sources").select("id, name").eq("is_active", true).order("name"),
  ]);
  const rows = (data ?? []) as Row[];
  const pName = new Map(projects);
  const sName = new Map((src.data ?? []).map((s) => [s.id as string, s.name as string]));
  const total = rows.filter((r) => r.status === "confirmed").reduce((s, r) => s + Number(r.amount), 0);
  const rev = ["/thu-chi", "/du-an"];
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={`Tổng thu ${formatDate(from)} → ${formatDate(to)}`} value={money(total)} tone="green" />
        <StatCard label="Số khoản" value={rows.length} tone="slate" />
        <a href={`/thu-chi/xuat?type=incomes&from=${from}&to=${to}`} className="flex items-center justify-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium text-primary shadow-[var(--shadow-card)] hover:bg-primary-soft/40"><Download className="size-4" aria-hidden />Xuất Excel</a>
      </section>
      <form action="/thu-chi" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="thu" />
        <label className="text-xs">Từ<input type="date" name="from" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
        <label className="text-xs">Đến<input type="date" name="to" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
        <button className="h-10 rounded-lg border bg-card px-4 text-sm hover:bg-muted">Xem</button>
      </form>
      {canManage ? (
        <Disclosure summary="Ghi nhận khoản thu (AdSense, tài trợ, thanh toán khách…)">
          <RpcForm rpc="record_income" submitLabel="Ghi nhận" revalidate={rev} resetOnSuccess columns={3}
            fields={[
              { name: "p_occurred_on", label: "Ngày thu", type: "date", required: true, defaultValue: today }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true },
              { name: "p_source_id", label: "Nguồn thu", type: "select", as: "uuid", options: (src.data ?? []).map((s) => [s.id as string, s.name as string]) },
              { name: "p_project_id", label: "Dự án", type: "select", as: "uuid", options: projects }, { name: "p_invoice_no", label: "Số hóa đơn" }, { name: "p_method", label: "Hình thức (CK, tiền mặt…)" },
              { name: "p_description", label: "Nội dung", wide: true },
            ]} />
        </Disclosure>
      ) : null}
      <DataTable rows={rows as (Row & { id: string })[]} empty={<EmptyState title="Chưa có khoản thu trong khoảng này" />}
        cols={[
          { label: "Ngày", cell: (r) => formatDate(r.occurred_on as string) }, { label: "Nguồn", cell: (r) => sName.get(String(r.source_id)) ?? "—", className: "hidden md:table-cell" },
          { label: "Nội dung", cell: (r) => <div><p className={cn("font-medium", r.status === "cancelled" && "line-through")}>{String(r.description ?? "—")}</p>{r.project_id ? <p className="text-xs text-muted-foreground">{pName.get(String(r.project_id)) ?? "Dự án"}</p> : null}</div> },
          { label: "Số tiền", cell: (r) => <strong className={r.status === "cancelled" ? "line-through" : ""}>{money(r.amount as number)}</strong>, className: "text-right tabular-nums" },
          { label: "Hóa đơn", cell: (r) => String(r.invoice_no ?? "—"), className: "hidden lg:table-cell" },
          { label: "", cell: (r) => (r.status === "cancelled" ? <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-300">Đã hủy</Badge> : canManage ? <RpcButton rpc="cancel_income" args={{ p_id: r.id }} prompt={{ text: "Lý do hủy khoản thu:", arg: "p_reason", required: true }} label="Hủy" variant="ghost" revalidate={rev} /> : null) },
        ]} />
    </>
  );
}

async function Debts({ supabase }: { supabase: SB }) {
  const [ms, ex] = await Promise.all([
    supabase.from("project_milestones").select("id, project_id, name, amount, payment, due_date").eq("acceptance", "accepted").neq("payment", "paid").order("due_date"),
    supabase.from("expenses").select("id, project_id, description, payee_name, amount, due_date").eq("approval", "approved").eq("payment", "unpaid").is("deleted_at", null).order("due_date"),
  ]);
  const { data: projs } = await supabase.from("projects").select("id, code, name");
  const pn = new Map((projs ?? []).map((p) => [p.id as string, `${p.code} – ${p.name}`]));
  const recv = (ms.data ?? []) as Row[], pay = (ex.data ?? []) as Row[];
  const sum = (a: Row[]) => a.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Phải thu (mốc đã nghiệm thu, chưa thu tiền)" value={money(sum(recv))} tone="green" />
        <StatCard label="Phải trả (chi phí đã duyệt, chưa thanh toán)" value={money(sum(pay))} tone="orange" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Công nợ phải thu</CardTitle></CardHeader><CardContent>
          <DataTable rows={recv as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Không có khoản phải thu.</p>}
            cols={[{ label: "Dự án / mốc", cell: (r) => <div><Link className="font-medium text-primary hover:underline" href={`/du-an/${r.project_id}?tab=nghiem-thu`}>{pn.get(String(r.project_id)) ?? "—"}</Link><p className="text-xs text-muted-foreground">{String(r.name)}</p></div> }, { label: "Hạn", cell: (r) => formatDate(r.due_date as string) }, { label: "Số tiền", cell: (r) => money(r.amount as number), className: "text-right" }, { label: "", cell: (r) => badge(PAYMENT, r.payment) }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Công nợ phải trả</CardTitle></CardHeader><CardContent>
          <DataTable rows={pay as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Không có khoản phải trả.</p>}
            cols={[{ label: "Nội dung", cell: (r) => <div><p className="font-medium">{String(r.description ?? r.payee_name ?? "—")}</p><p className="text-xs text-muted-foreground">{r.project_id ? pn.get(String(r.project_id)) : "Không gắn dự án"}</p></div> }, { label: "Hạn", cell: (r) => formatDate(r.due_date as string) }, { label: "Số tiền", cell: (r) => money(r.amount as number), className: "text-right" }]} />
        </CardContent></Card>
      </div>
    </>
  );
}

async function Pnl({ supabase, from, to }: { supabase: SB; from: string; to: string }) {
  const { data } = await supabase.from("project_financials").select("*").order("code");
  const rows = (data ?? []) as Row[];
  const tot = rows.reduce<{ rev: number; cost: number; recv: number; pay: number }>((a, r) => ({ rev: a.rev + Number(r.revenue), cost: a.cost + Number(r.cost), recv: a.recv + Number(r.receivable), pay: a.pay + Number(r.payable) }), { rev: 0, cost: 0, recv: 0, pay: 0 });
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tổng đã thu (các dự án)" value={money(tot.rev)} tone="green" /><StatCard label="Tổng chi phí đã duyệt" value={money(tot.cost)} tone="amber" />
        <StatCard label={tot.rev - tot.cost >= 0 ? "Lãi tạm tính" : "Lỗ tạm tính"} value={money(tot.rev - tot.cost)} tone={tot.rev - tot.cost >= 0 ? "sky" : "orange"} />
        <a href={`/thu-chi/xuat?type=pnl&from=${from}&to=${to}`} className="flex items-center justify-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium text-primary shadow-[var(--shadow-card)] hover:bg-primary-soft/40"><Download className="size-4" aria-hidden />Xuất Excel</a>
      </section>
      <p className="text-xs text-muted-foreground">Lãi / lỗ tạm tính = khoản thu đã ghi nhận − chi phí đã duyệt. Chưa gồm lương nhân viên và chi phí chung không gắn dự án.</p>
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/du-an/${r.project_id}?tab=tai-chinh`} empty={<EmptyState title="Chưa có dự án" />}
        cols={[
          { label: "Dự án", cell: (r) => <div><p className="font-medium">{String(r.code)} · {String(r.name)}</p><p className="text-xs text-muted-foreground">{PROJECT_STAGE[String(r.stage)]?.[0]}</p></div> },
          { label: "Giá trị HĐ", cell: (r) => money(r.contract_value as number), className: "text-right hidden md:table-cell" }, { label: "Đã thu", cell: (r) => money(r.revenue as number), className: "text-right" },
          { label: "Chi phí", cell: (r) => money(r.cost as number), className: "text-right" },
          { label: "Lãi / lỗ", cell: (r) => { const p = Number(r.revenue) - Number(r.cost); return <strong className={p < 0 ? "text-red-700" : "text-emerald-700"}>{money(p)}</strong>; }, className: "text-right" },
          { label: "Phải thu", cell: (r) => money(r.receivable as number), className: "text-right hidden lg:table-cell" }, { label: "Phải trả", cell: (r) => money(r.payable as number), className: "text-right hidden lg:table-cell" },
        ]} />
    </>
  );
}
