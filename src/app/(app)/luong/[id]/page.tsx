import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { PAYROLL, badge } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Bảng lương" };
const KIND: Record<string, string> = { allowance: "Phụ cấp", bonus: "Thưởng", insurance: "Bảo hiểm", tax: "Thuế TNCN", deduction: "Khấu trừ" };

export default async function PayrollPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const [{ data: p }, { data: lines }, L] = await Promise.all([
    supabase.from("payroll_periods").select("*").eq("id", id).maybeSingle(),
    supabase.from("payroll_lines").select("*").eq("period_id", id),
    loadLookups(["people"]),
  ]);
  if (!p) notFound();
  const rows = ((lines ?? []) as Row[]).sort((a, b) => nameOf(L, "people", a.user_id).localeCompare(nameOf(L, "people", b.user_id), "vi"));
  const ids = rows.map((r) => r.id as string);
  const { data: items } = ids.length ? await supabase.from("payroll_items").select("*").in("line_id", ids).order("kind") : { data: [] as Row[] };
  const byLine = new Map<string, Row[]>();
  for (const it of (items ?? []) as Row[]) byLine.set(it.line_id as string, [...(byLine.get(it.line_id as string) ?? []), it]);
  const view = can(ctx, "payroll.view"), manage = can(ctx, "payroll.manage"), approve = can(ctx, "payroll.approve");
  const st = String(p.status);
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const rev = [`/luong/${id}`, "/luong"];
  const step = (action: string, label: string, variant: "default" | "outline" | "soft" | "ghost" = "outline", extra?: { confirm?: string; prompt?: boolean }) => (
    <RpcButton key={action} rpc="payroll_step" args={{ p_period: id, p_action: action }} label={label} variant={variant} confirm={extra?.confirm} revalidate={rev} size="default"
      prompt={extra?.prompt ? { text: "Lý do mở lại bảng lương:", arg: "p_note", required: true } : undefined} />
  );
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <Link href="/luong" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Bảng lương</Link>
      <PageHeader title={`Bảng lương tháng ${p.month}/${p.year}`} eyebrow={`Công chuẩn ${p.standard_days} · Bảo hiểm ${p.insurance_rate}%`} actions={<>{badge(PAYROLL, st)}{view ? <a href={`/luong/${id}/xuat`} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Xuất Excel</a> : null}</>} />
      {view ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Số người" value={rows.length} tone="slate" /><StatCard label="Tổng lương theo công" value={money(sum("base_pay"))} tone="sky" />
          <StatCard label="Phụ cấp + thưởng" value={money(sum("allowances") + sum("bonuses"))} tone="green" /><StatCard label="Tổng thực nhận" value={money(sum("net_pay"))} tone="violet" hint={`Bảo hiểm ${money(sum("insurance"))} · Thuế ${money(sum("tax"))}`} />
        </section>
      ) : null}
      {view ? (
        <Card>
          <CardHeader><CardTitle>Bước tiếp theo</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {st === "draft" && manage ? step("check", "Nhân sự xác nhận đã kiểm tra", "default", { confirm: "Chuyển sang chờ kế toán duyệt? Sau đó không sửa được." }) : null}
            {st === "checked" && approve ? step("approve", "Kế toán duyệt bảng lương", "default") : null}
            {st === "approved" && approve ? step("pay", "Xác nhận đã chi trả", "default", { confirm: "Xác nhận đã chuyển lương cho nhân viên?" }) : null}
            {(st === "checked" && (manage || approve)) || (st === "approved" && approve) ? step("reopen", "Mở lại để chỉnh sửa", "outline", { prompt: true }) : null}
            {st === "paid" ? <span className="text-sm text-muted-foreground">Đã chi trả ngày {formatDate(p.paid_on as string)}.</span> : null}
            {st === "draft" && !manage ? <span className="text-sm text-muted-foreground">Đang được nhân sự lập.</span> : null}
          </CardContent>
        </Card>
      ) : null}
      {st !== "draft" && p.note ? <Alert tone="info">Ghi chú: {String(p.note)}</Alert> : null}
      <DataTable rows={rows as (Row & { id: string })[]} testId="list-payslips"
        cols={[
          { label: "Nhân viên", cell: (r) => <div><p className="font-medium">{nameOf(L, "people", r.user_id)}</p>{r.note ? <p className="text-xs text-amber-700">{String(r.note)}</p> : null}</div> },
          { label: "Công", cell: (r) => String(r.worked_days), className: "text-right" }, { label: "Lương theo công", cell: (r) => money(r.base_pay as number), className: "text-right hidden md:table-cell" },
          { label: "Phụ cấp", cell: (r) => money(r.allowances as number), className: "text-right hidden lg:table-cell" }, { label: "Thưởng", cell: (r) => money(r.bonuses as number), className: "text-right hidden lg:table-cell" },
          { label: "Bảo hiểm", cell: (r) => money(r.insurance as number), className: "text-right hidden lg:table-cell" }, { label: "Thuế", cell: (r) => money(r.tax as number), className: "text-right hidden xl:table-cell" },
          { label: "Khấu trừ", cell: (r) => money(r.deductions as number), className: "text-right hidden xl:table-cell" },
          { label: "Thực nhận", cell: (r) => <strong>{money(r.net_pay as number)}</strong>, className: "text-right" },
        ]} />
      {rows.map((r) => (
        <details key={String(r.id)} className="rounded-xl border bg-card px-4 py-3 text-sm shadow-[var(--shadow-card)]">
          <summary className="cursor-pointer font-medium">Chi tiết: {nameOf(L, "people", r.user_id)} — {money(r.net_pay as number)}</summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            <li className="flex justify-between"><span>Lương cơ bản {money(r.base_salary as number)} × {String(r.worked_days)}/{String(p.standard_days)} công</span><span>{money(r.base_pay as number)}</span></li>
            {(byLine.get(String(r.id)) ?? []).map((it) => (
              <li key={String(it.id)} className="flex items-center justify-between gap-2">
                <span>{KIND[String(it.kind)]}: {String(it.name)}{it.is_manual ? " (nhập tay)" : ""}</span>
                <span className="flex items-center gap-2">{["insurance", "tax", "deduction"].includes(String(it.kind)) ? "−" : "+"}{money(it.amount as number)}
                  {st === "draft" && manage && it.is_manual ? <RpcButton rpc="remove_payroll_item" args={{ p_item: it.id }} label="Xóa" variant="ghost" revalidate={rev} /> : null}</span>
              </li>
            ))}
          </ul>
          {st === "draft" && manage ? (
            <div className="mt-3"><Disclosure summary="Thêm khoản (khấu trừ, thuế TNCN, phụ cấp, thưởng…)">
              <RpcForm rpc="add_payroll_item" fixed={{ p_line: r.id }} submitLabel="Thêm" revalidate={rev} resetOnSuccess columns={3}
                fields={[{ name: "p_kind", label: "Loại", type: "select", required: true, defaultValue: "deduction", options: [["deduction", "Khấu trừ"], ["tax", "Thuế TNCN"], ["allowance", "Phụ cấp"], ["bonus", "Thưởng"]] }, { name: "p_name", label: "Tên khoản", required: true }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true }]} />
            </Disclosure></div>
          ) : null}
        </details>
      ))}
    </div>
  );
}
