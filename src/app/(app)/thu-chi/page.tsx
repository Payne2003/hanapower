import type { Metadata } from "next";
import Link from "next/link";
import { requireContext, can, hasRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFinanceLookups, parseFinanceQuery } from "@/lib/finance";
import { DATE_RE } from "@/lib/finance-ui";
import { getSavedViews } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { NoAccess } from "@/components/data-table";
import { Save } from "lucide-react";
import { Advances } from "@/components/finance/advances";
import { ExpensesTab, IncomesTab } from "@/components/finance/lists";
import { OverviewTab, ReceivablesTab, ReportTab } from "@/components/finance/overview";
import { PeriodsTab } from "@/components/finance/periods";
import { VouchersTab } from "@/components/finance/vouchers";

export const metadata: Metadata = { title: "Thu chi & công nợ" };

const TABS: [key: string, label: string, viewOnly: boolean][] = [
  ["tong-quan", "Tổng quan", true], ["thu", "Khoản thu", true], ["chi", "Khoản chi", false], ["phai-thu", "Phải thu theo mốc", true],
  ["ky", "Kỳ tài chính", true], ["chung-tu", "Chứng từ", false], ["bao-cao", "Báo cáo", true], ["tam-ung", "Tạm ứng", false],
];
const ALIAS: Record<string, string> = { "chi-phi": "chi", "cong-no": "phai-thu", "lai-lo": "bao-cao" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const canView = can(ctx, "finance.view");
  const canManage = can(ctx, "finance.manage");
  const canApprove = can(ctx, "finance.approve") || hasRole(ctx, "manager");
  const tabs = TABS.filter(([, , viewOnly]) => canView || !viewOnly);
  const want = ALIAS[sp.tab ?? ""] ?? sp.tab;
  const tab = tabs.some(([k]) => k === want) ? String(want) : canView ? "tong-quan" : "chi";
  const q = parseFinanceQuery(sp, ctx.today);
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("run_finance_reminders"); // nhắc việc: mỗi sự kiện đúng một lần (khóa duy nhất ở CSDL)
  const [L, views] = await Promise.all([getFinanceLookups(), canView ? getSavedViews("finance") : Promise.resolve([])]);
  const year = Math.min(2100, Math.max(2000, Math.floor(Number(sp.nam)) || Number(ctx.today.slice(0, 4))));
  const month = Number(sp.thang) >= 1 && Number(sp.thang) <= 12 ? Number(sp.thang) : undefined;
  const ovFrom = DATE_RE.test(sp.tu ?? "") ? sp.tu! : `${ctx.today.slice(0, 4)}-01-01`;
  const ovTo = DATE_RE.test(sp.den ?? "") ? sp.den! : ctx.today;
  const reportFrom = DATE_RE.test(sp.tu ?? "") ? sp.tu! : `${ctx.today.slice(0, 4)}-01-01`;
  const reportTo = DATE_RE.test(sp.den ?? "") ? sp.den! : ctx.today;
  const dim = ["project", "customer", "month", "department", "source", "category"].includes(sp.dim ?? "") ? sp.dim! : "project";
  const here = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "trang").map(([k, v]) => [k, String(v)] as [string, string])).toString();
  let advanceOptions: [string, string][] = [];
  if (tab === "chi") {
    const { data } = await supabase.from("advances").select("id, amount, purpose").eq("user_id", ctx.user_id).eq("status", "disbursed");
    advanceOptions = (data ?? []).map((a) => [a.id as string, `${new Intl.NumberFormat("vi-VN").format(Number(a.amount))} ₫ – ${a.purpose}`]);
  }
  const common = { q, L, today: ctx.today, userId: ctx.user_id, canManage };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Thu chi & công nợ" description="Thực thu / thực chi lấy từ giao dịch đã ghi nhận; dự kiến thu lấy từ các mốc chưa thu. Chi phí qua bước duyệt rồi mới thanh toán. Người không phải kế toán chỉ thấy khoản của mình và của dự án mình quản lý." />
      <nav aria-label="Phần tài chính" className="-mx-1 flex gap-1 overflow-x-auto px-1" data-testid="finance-tabs">
        {tabs.map(([k, l]) => <Link key={k} href={`/thu-chi?tab=${k}`} aria-current={tab === k ? "page" : undefined} data-testid={`tab-${k}`} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
      </nav>

      {canView && ["thu", "chi", "chung-tu", "bao-cao"].includes(tab) ? (
        <Disclosure summary={`Góc nhìn đã lưu${views.length ? ` (${views.length})` : ""}`} icon={<Save className="size-4" aria-hidden />}>
          <div className="flex flex-col gap-3">
            {views.length ? <ul className="flex flex-col gap-1.5 text-sm">{views.map((v) => <li key={v.id} className="flex items-center justify-between gap-2"><Link href={`/thu-chi${v.params ? `?${v.params}` : ""}`} className="font-medium text-primary hover:underline">{v.name}</Link><RpcButton rpc="delete_view" args={{ p_id: v.id }} label="Xóa" variant="ghost" revalidate={["/thu-chi"]} /></li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa có góc nhìn nào.</p>}
            <RpcForm rpc="save_view" fixed={{ p_scope: "finance", p_params: here }} submitLabel="Lưu bộ lọc hiện tại" revalidate={["/thu-chi"]} columns={1} resetOnSuccess variant="outline" fields={[{ name: "p_name", label: "Tên góc nhìn", required: true, placeholder: "VD: Thiếu chứng từ tháng này" }]} />
          </div>
        </Disclosure>
      ) : null}

      {tab === "tong-quan" ? <OverviewTab from={ovFrom} to={ovTo} today={ctx.today} /> : null}
      {tab === "thu" ? (canView ? <IncomesTab {...common} /> : <NoAccess what="Khoản thu" />) : null}
      {tab === "chi" ? <ExpensesTab {...common} canApprove={canApprove} canViewAll={canView} advances={advanceOptions} /> : null}
      {tab === "phai-thu" ? <ReceivablesTab sp={sp} L={L} today={ctx.today} userId={ctx.user_id} canRecord={canManage} /> : null}
      {tab === "ky" ? <PeriodsTab year={year} month={month} L={L} today={ctx.today} userId={ctx.user_id} canManage={canManage} canApprove={can(ctx, "finance.approve")} /> : null}
      {tab === "chung-tu" ? (
        <VouchersTab q={sp.ct === undefined ? { ...q, voucher: "missing" } : q} kind={sp["loai-ct"] === "income" || sp["loai-ct"] === "expense" ? sp["loai-ct"] : "all"} L={L} today={ctx.today} canManage={canManage} userId={ctx.user_id} />
      ) : null}
      {tab === "bao-cao" ? <ReportTab q={{ ...q, from: reportFrom, to: reportTo }} dim={dim} today={ctx.today} /> : null}
      {tab === "tam-ung" ? <Advances ctxUser={ctx.user_id} canApprove={canApprove} canPay={canManage} supabase={supabase} /> : null}
    </div>
  );
}
