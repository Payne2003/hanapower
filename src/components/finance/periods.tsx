import Link from "next/link";
import { money } from "@/lib/form-spec";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ISSUE, monthRange, periodLabel, qs } from "@/lib/finance-ui";
import { getExpenses, getIncomes, getPeriodDetail, getPeriodsYear, getReconcile, type FinanceLookups, type FinanceQuery } from "@/lib/finance";
import { StatCard } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { ReceiptForm } from "@/components/finance/receipt-form";
import { cn } from "@/lib/utils";

export async function PeriodsTab({ year, month, L, today, userId, canManage, canApprove }: { year: number; month?: number; L: FinanceLookups; today: string; userId: string; canManage: boolean; canApprove: boolean }) {
  const [months, rec, detail] = await Promise.all([getPeriodsYear(year), getReconcile(month ? year : undefined, month), month ? getPeriodDetail(year, month) : Promise.resolve(null)]);
  const total = months.reduce((a, m) => ({ i: a.i + Number(m.income), e: a.e + Number(m.expense) }), { i: 0, e: 0 });
  const rev = ["/thu-chi", "/du-an"];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/thu-chi?tab=ky&nam=${year - 1}`} className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted" aria-label="Năm trước">← {year - 1}</Link>
        <strong className="px-2 text-base" data-testid="period-year">Năm {year}</strong>
        <Link href={`/thu-chi?tab=ky&nam=${year + 1}`} className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted" aria-label="Năm sau">{year + 1} →</Link>
        <span className="ml-auto text-muted-foreground">Cả năm: thu <strong className="tabular-nums text-foreground">{money(total.i)}</strong> · chi <strong className="tabular-nums text-foreground">{money(total.e)}</strong> · chênh lệch <strong className="tabular-nums text-foreground">{money(total.i - total.e)}</strong></span>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[720px] text-sm" data-testid="period-table">
          <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-3.5 py-2.5">Kỳ</th><th className="px-3.5 py-2.5 text-right">Thực thu</th><th className="px-3.5 py-2.5 text-right">Thực chi</th><th className="px-3.5 py-2.5 text-right">Chênh lệch thu–chi</th><th className="px-3.5 py-2.5">Trạng thái</th></tr></thead>
          <tbody className="divide-y">
            {months.map((m) => (
              <tr key={m.month} className={cn(month === m.month && "bg-primary-soft/40")}>
                <td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/thu-chi?tab=ky&nam=${year}&thang=${m.month}`} data-testid={`period-${m.month}`}>{periodLabel(year, m.month)}</Link></td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{money(m.income)} <span className="text-xs text-muted-foreground">({m.income_count})</span></td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{money(m.expense)} <span className="text-xs text-muted-foreground">({m.expense_count})</span></td>
                <td className={cn("px-3.5 py-2.5 text-right tabular-nums font-medium", Number(m.diff) < 0 && "text-red-700")}>{money(m.diff)}</td>
                <td className="px-3.5 py-2.5">
                  <span className="flex flex-wrap gap-1.5">{m.closed ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đã chốt</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Đang mở</Badge>}
                    {m.mismatch ? <Badge className="bg-red-50 text-red-800 ring-red-300">Lệch tổng đã chốt</Badge> : null}{m.has_note ? <Badge className="bg-sky-50 text-sky-800 ring-sky-300">Có ghi chú</Badge> : null}</span>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {detail && month ? <PeriodDetailCard d={detail} year={year} month={month} canManage={canManage} canApprove={canApprove} rev={rev} /> : <p className="text-sm text-muted-foreground">Chọn một kỳ để xem chi tiết giao dịch, ghi chú, chốt kỳ và đối chiếu.</p>}
      <Reconcile rec={rec} L={L} today={today} userId={userId} canManage={canManage} scope={month ? periodLabel(year, month) : "toàn bộ dữ liệu"} />
      {detail && month ? <PeriodTransactions year={year} month={month} /> : null}
    </>
  );
}

function PeriodDetailCard({ d, year, month, canManage, canApprove, rev }: { d: Awaited<ReturnType<typeof getPeriodDetail>>; year: number; month: number; canManage: boolean; canApprove: boolean; rev: string[] }) {
  const gap = d.closed && (Number(d.income_gap) !== 0 || Number(d.expense_gap) !== 0);
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-label={`Chi tiết ${periodLabel(year, month)}`} data-testid="period-detail">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{periodLabel(year, month)}</h2><p className="text-xs text-muted-foreground">{formatDate(d.from)} → {formatDate(d.to)} · kỳ theo ngày thực thu / ngày phát sinh của giao dịch</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {d.closed ? <><Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đã chốt {d.closed_at ? formatDateTime(d.closed_at) : ""}{d.closed_by ? ` · ${d.closed_by}` : ""}</Badge>
            {canApprove ? <RpcButton rpc="reopen_finance_period" args={{ p_year: year, p_month: month }} prompt={{ text: "Lý do mở lại kỳ (bắt buộc, được ghi nhật ký):", arg: "p_reason", required: true }} label="Mở lại kỳ" variant="outline" revalidate={rev} /> : null}</>
            : canApprove ? <RpcButton rpc="close_finance_period" args={{ p_year: year, p_month: month }} label="Chốt kỳ" variant="default" confirm={`Chốt ${periodLabel(year, month)}? Sau khi chốt không thêm / sửa / hủy giao dịch trong kỳ được nữa.`} revalidate={rev} /> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Đang mở</Badge>}
        </div>
      </header>
      {d.reopen_reason && !d.closed ? <p className="text-xs text-muted-foreground">Mở lại {d.reopened_at ? formatDateTime(d.reopened_at) : ""}: {d.reopen_reason}</p> : null}
      {gap ? <Alert tone="error">Tổng chi tiết hiện tại lệch so với lúc chốt: thu {money(d.income_gap)}, chi {money(d.expense_gap)} (lúc chốt thu {money(d.closed_income)}, chi {money(d.closed_expense)}). Xem danh sách đối chiếu bên dưới.</Alert> : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Thực thu" value={money(d.income)} tone="green" hint={`${d.income_count} khoản`} href={`/thu-chi?tab=thu&tu=${d.from}&den=${d.to}`} testId="pd-income" />
        <StatCard label="Thực chi (đã duyệt)" value={money(d.expense)} tone="amber" hint={`${d.expense_count} khoản`} href={`/thu-chi?tab=chi&tu=${d.from}&den=${d.to}&dv=approved`} testId="pd-expense" />
        <StatCard label="Chênh lệch thu–chi" value={money(d.diff)} tone={Number(d.diff) >= 0 ? "sky" : "orange"} hint="Không phải lợi nhuận kế toán" testId="pd-diff" />
        <StatCard label="Dự kiến thu theo hạn mốc" value={money(d.expected_amount)} tone="violet" hint={`Còn chưa thu ${money(d.expected_open)}`} />
      </section>
      <p className="text-sm text-muted-foreground">Thu muộn từ mốc đến hạn kỳ trước ghi nhận vào kỳ này: <strong className="tabular-nums text-foreground">{money(d.late_receipts_amount)}</strong> ({d.late_receipts_count} khoản). {d.pending_expense_count ? <span className="text-amber-700">Còn {d.pending_expense_count} khoản chi chờ duyệt trong kỳ — phải xử lý trước khi chốt.</span> : null}</p>
      {canManage ? (
        <Disclosure summary={d.note ? "Sửa ghi chú kỳ" : "Thêm ghi chú kỳ"}>
          <RpcForm rpc="save_finance_period_note" fixed={{ p_year: year, p_month: month }} submitLabel="Lưu ghi chú" revalidate={rev} columns={1}
            fields={[{ name: "p_note", label: "Ghi chú kỳ", type: "textarea", defaultValue: d.note ?? "", hint: "VD: đã đối chiếu sao kê ngân hàng ngày…" }]} />
        </Disclosure>
      ) : null}
      {d.note ? <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="text-muted-foreground">Ghi chú: </span>{d.note}</p> : null}
    </section>
  );
}

async function Reconcile({ rec, L, today, userId, canManage, scope }: { rec: Awaited<ReturnType<typeof getReconcile>>; L: FinanceLookups; today: string; userId: string; canManage: boolean; scope: string }) {
  const kinds = Object.entries(rec.by_kind);
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-label="Đối chiếu" data-testid="reconcile">
      <header><h2 className="text-lg font-semibold">Đối chiếu ({scope})</h2><p className="text-sm text-muted-foreground">Danh sách bản ghi lệch hoặc thiếu. Trang này chỉ liệt kê — không tự tạo hay sửa tiền; xử lý bằng thao tác tường minh có phân quyền.</p></header>
      {rec.count === 0 ? <Alert tone="success">Không có bản ghi lệch.</Alert> : (
        <>
          <ul className="flex flex-wrap gap-2 text-xs">{kinds.map(([k, n]) => <li key={k}><Badge className={ISSUE[k]?.tone}>{ISSUE[k]?.label ?? k}: {n}</Badge></li>)}</ul>
          <ul className="divide-y rounded-xl border" data-testid="reconcile-items">
            {rec.items.map((it, i) => (
              <li key={`${it.kind}-${it.ref_id}-${i}`} className="flex flex-col gap-1.5 px-3.5 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge className={ISSUE[it.kind]?.tone}>{ISSUE[it.kind]?.label ?? it.kind}</Badge><span className="font-medium">{it.label}</span>{Number(it.amount) ? <span className="tabular-nums">{money(it.amount)}</span> : null}{it.dt ? <span className="text-xs text-muted-foreground">{formatDate(it.dt)}</span> : null}</div>
                <p className="text-xs text-muted-foreground">{it.detail}. <em>{ISSUE[it.kind]?.fix}</em></p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {it.project_id ? <Link className="text-primary hover:underline" href={`/du-an/${it.project_id}?tab=thanh-toan`}>Mở dự án</Link> : null}
                  {it.ref_type === "income" ? <Link className="text-primary hover:underline" href={`/thu-chi?tab=thu&tu=2000-01-01&den=2999-12-31${it.project_id ? `&da=${it.project_id}` : ""}&tt=all#row-${it.ref_id}`}>Mở khoản thu</Link> : null}
                  {it.ref_type === "expense" ? <Link className="text-primary hover:underline" href={`/thu-chi?tab=chi&tu=2000-01-01&den=2999-12-31${it.project_id ? `&da=${it.project_id}` : ""}#row-${it.ref_id}`}>Mở khoản chi</Link> : null}
                  {it.ref_type === "period" && it.dt ? <Link className="text-primary hover:underline" href={`/thu-chi?tab=ky&nam=${it.dt.slice(0, 4)}&thang=${Number(it.dt.slice(5, 7))}`}>Mở kỳ</Link> : null}
                </div>
                {it.kind === "paid_no_income" && canManage && it.ref_id ? (
                  <Disclosure summary="Ghi nhận thu cho mốc này (ngày thực tế)">
                    <ReceiptForm milestoneId={it.ref_id} title={it.label} amount={Number(it.amount)} dueDate={null} today={today} sources={L.sources} people={L.people} departments={L.departments} defaultOwner={userId} defaultDate={it.dt && it.dt <= today ? it.dt : today} />
                  </Disclosure>) : null}
              </li>
            ))}
          </ul>
          {rec.count > rec.items.length ? <p className="text-xs text-muted-foreground">Hiển thị {rec.items.length}/{rec.count} bản ghi đầu tiên.</p> : null}
        </>
      )}
    </section>
  );
}

async function PeriodTransactions({ year, month }: { year: number; month: number }) {
  const [from, to] = monthRange(year, month);
  const q = { from, to, status: "confirmed", general: false, sort: "date", dir: "desc", page: 1, size: 30 } as FinanceQuery;
  const [inc, exp] = await Promise.all([getIncomes(q), getExpenses(q)]);
  const link = (tab: string) => `/thu-chi${qs({ tab, tu: from, den: to })}`;
  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="period-transactions">
      <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"><header className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Khoản thu ({inc.total})</h3><Link href={link("thu")} className="text-xs text-primary hover:underline">Xem tất cả →</Link></header>
        <ul className="divide-y text-sm">{inc.rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate"><span className="text-muted-foreground">{formatDate(r.occurred_on)}</span> · {r.description ?? "—"}{r.is_milestone ? " · theo mốc" : ""}</span><span className="tabular-nums">{money(r.amount)}</span></li>)}{inc.rows.length === 0 ? <li className="py-2 text-muted-foreground">Chưa có khoản thu.</li> : null}</ul></section>
      <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"><header className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Khoản chi ({exp.total})</h3><Link href={link("chi")} className="text-xs text-primary hover:underline">Xem tất cả →</Link></header>
        <ul className="divide-y text-sm">{exp.rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate"><span className="text-muted-foreground">{formatDate(r.occurred_on)}</span> · {r.description ?? r.payee_name ?? "—"}{r.approval !== "approved" ? ` · ${r.approval === "submitted" ? "chờ duyệt" : r.approval === "draft" ? "nháp" : "từ chối"}` : ""}</span><span className="tabular-nums">{money(r.amount)}</span></li>)}{exp.rows.length === 0 ? <li className="py-2 text-muted-foreground">Chưa có khoản chi.</li> : null}</ul></section>
    </div>
  );
}
