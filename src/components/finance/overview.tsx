import Link from "next/link";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { BUCKET, BUCKET_ORDER, qs } from "@/lib/finance-ui";
import { getOverview, getReceivables, getReport, getReconcile, type FinanceLookups, type FinanceQuery, type Receivables } from "@/lib/finance";
import { ChartCard, ColumnChart, compactVnd } from "@/components/charts";
import { StatCard } from "@/components/ui/page-header";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { Button } from "@/components/ui/button";
import { presets } from "@/components/finance/filter-bar";
import { ReceiptForm } from "@/components/finance/receipt-form";
import { DueText } from "@/components/projects/parts";
import { cn } from "@/lib/utils";

const mm = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;

// ------------------------------------------------------------------ Tổng quan
export async function OverviewTab({ from, to, today }: { from: string; to: string; today: string }) {
  const [o, rec] = await Promise.all([getOverview(from, to), getReconcile()]);
  const range = `tu=${from}&den=${to}`;
  const high = Object.entries(rec.by_kind).filter(([k]) => !["income_no_voucher", "expense_no_voucher"].includes(k)).reduce((s, [, n]) => s + n, 0);
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted-foreground">Kỳ xem:</span>
          {presets(today).map(([label, f, t]) => <Link key={label} href={`/thu-chi?tab=tong-quan&tu=${f}&den=${t}`} className="rounded-full border bg-card px-3 py-1 font-medium hover:bg-muted">{label}</Link>)}
        </div>
        <form action="/thu-chi" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="tong-quan" />
          <label className="text-xs">Từ ngày<input type="date" name="tu" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
          <label className="text-xs">Đến ngày<input type="date" name="den" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
          <Button type="submit" variant="outline">Xem</Button>
        </form>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="finance-overview">
        <StatCard label="Thực thu" value={money(o.income)} tone="green" hint={`${o.income_count} khoản · bấm để xem danh sách`} href={`/thu-chi?tab=thu&${range}`} testId="ov-income" />
        <StatCard label="Thực chi (đã duyệt)" value={money(o.expense)} tone="amber" hint={`${o.expense_count} khoản`} href={`/thu-chi?tab=chi&${range}&dv=approved`} testId="ov-expense" />
        <StatCard label="Chênh lệch thu–chi" value={money(o.diff)} tone={Number(o.diff) >= 0 ? "sky" : "orange"} hint="= thực thu − thực chi, không phải lợi nhuận kế toán" testId="ov-diff" />
        <StatCard label="Phải thu theo mốc (đang mở)" value={money(o.open_total)} tone="violet" hint={`${o.open_count} mốc chưa thu`} href="/thu-chi?tab=phai-thu" testId="ov-open" />
        <StatCard label="Quá hạn thu" value={money(o.overdue_total)} tone={o.overdue_count ? "orange" : "slate"} hint={`${o.overdue_count} mốc`} href="/thu-chi?tab=phai-thu&nhom=overdue" testId="ov-overdue" />
        <StatCard label="Mốc đến hạn 7 ngày tới" value={money(o.due7_total)} tone="sky" hint={`${o.due7_count} mốc`} href="/thu-chi?tab=phai-thu" />
        <StatCard label="Chi chờ duyệt" value={o.pending_expense_count} tone={o.pending_expense_count ? "amber" : "slate"} href="/thu-chi?tab=chi&dv=submitted&tu=2000-01-01&den=2999-12-31" />
        <StatCard label="Thiếu chứng từ" value={o.missing_income_voucher + o.missing_expense_voucher} tone={o.missing_income_voucher + o.missing_expense_voucher ? "orange" : "slate"} hint={`${o.missing_income_voucher} thu · ${o.missing_expense_voucher} chi`} href={`/thu-chi?tab=chung-tu&${range}`} />
      </section>
      {high > 0 ? <Alert tone="warning">Có <strong>{high}</strong> bản ghi cần đối chiếu (mốc đã thu thiếu khoản thu, số tiền lệch, tổng kỳ lệch…). <Link className="font-medium underline" href="/thu-chi?tab=ky">Mở kỳ tài chính để xử lý</Link>.</Alert> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Thực thu và thực chi theo tháng" subtitle="Từ giao dịch đã ghi nhận (thu đã xác nhận, chi đã duyệt)" empty={!o.series.length}>
          <ColumnChart label="Thực thu và thực chi theo tháng" labels={o.series.map((s) => mm(s.month))} format={compactVnd} height={190}
            series={[{ name: "Thực thu", color: "#0f6b3f", values: o.series.map((s) => Number(s.income)) }, { name: "Thực chi", color: "#e0a22a", values: o.series.map((s) => Number(s.expense)) }]} />
        </ChartCard>
        <ChartCard title="Dự kiến thu theo hạn mốc (chưa thu)" subtitle="Tách riêng khỏi số thực thu: tính từ các mốc chưa thu theo ngày đến hạn" empty={!o.series.length}>
          <ColumnChart label="Dự kiến thu theo hạn mốc" labels={o.series.map((s) => mm(s.month))} format={compactVnd} height={190}
            series={[{ name: "Dự kiến thu", color: "#2f8fb8", values: o.series.map((s) => Number(s.expected)) }]} />
        </ChartCard>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Phải thu theo mốc
export async function ReceivablesTab({ sp, L, today, userId, canRecord }: { sp: Record<string, string | undefined>; L: FinanceLookups; today: string; userId: string; canRecord: boolean }) {
  const group = sp.gom === "project" ? "project" : "customer";
  const bucket = BUCKET_ORDER.includes(sp.nhom ?? "") ? sp.nhom : sp.nhom === "overdue" ? "overdue" : undefined;
  const customer = sp.kh, project = sp.da;
  const all = await getReReceivables(group, customer, project);
  const data = bucket ? filterBucket(all, bucket) : all;
  const link = (over: Record<string, string | undefined>) => `/thu-chi${qs({ tab: "phai-thu", gom: group === "project" ? "project" : undefined, nhom: bucket, kh: customer, da: project, ...over })}`;
  const src = L.sources.find(([, n]) => n === "Sản xuất video theo đơn hàng")?.[0];
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tổng còn phải thu" value={money(all.total)} tone="violet" hint={`${all.count} mốc chưa thu`} testId="rc-total" />
        {(["not_due", "today", "d1_30", "d31_60", "d61_90", "d90p"] as const).map((b) => (
          <Link key={b} href={link({ nhom: bucket === b ? undefined : b })} aria-current={bucket === b ? "true" : undefined} data-testid={`bucket-${b}`}
            className={cn("flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] hover:bg-muted/40", bucket === b && "border-primary bg-primary-soft/40")}>
            <span className="text-xs text-muted-foreground">{BUCKET[b]![0]}</span><strong className="text-lg tabular-nums">{money(all.buckets[b]?.amount ?? 0)}</strong><span className="text-xs text-muted-foreground">{all.buckets[b]?.count ?? 0} mốc</span>
          </Link>
        ))}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <form action="/thu-chi" method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="phai-thu" />{bucket ? <input type="hidden" name="nhom" value={bucket} /> : null}
          <select name="gom" defaultValue={group} aria-label="Nhóm theo" className="select-chevron h-10 rounded-lg border border-input bg-card px-3 text-sm"><option value="customer">Nhóm theo khách hàng</option><option value="project">Nhóm theo dự án</option></select>
          <select name="kh" defaultValue={customer ?? ""} aria-label="Khách hàng" className="select-chevron h-10 rounded-lg border border-input bg-card px-3 text-sm"><option value="">Khách hàng: tất cả</option>{L.customers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="da" defaultValue={project ?? ""} aria-label="Dự án" className="select-chevron h-10 max-w-64 rounded-lg border border-input bg-card px-3 text-sm"><option value="">Dự án: tất cả</option>{L.projects.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <Button type="submit" variant="outline">Lọc</Button>
        </form>
        {bucket || customer || project ? <Link href="/thu-chi?tab=phai-thu" className="text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
        <a href={`/thu-chi/xuat${qs({ type: "receivables", gom: group, nhom: bucket, kh: customer, da: project })}`} className="ml-auto inline-flex h-10 items-center rounded-lg border bg-card px-3 text-sm font-medium text-primary hover:bg-primary-soft/40">Xuất CSV</a>
      </div>
      <p className="text-xs text-muted-foreground">Số ngày trễ tính từ hạn thu của mốc đến hôm nay ({formatDate(today)}) theo ngày của doanh nghiệp. Mốc đã thu đủ tự rời danh sách này. Chỉ thu trọn mốc; thu từng phần cần tách mốc thành các đợt nhỏ.</p>
      {data.groups.length === 0 ? <EmptyState title="Không có khoản phải thu khớp bộ lọc" description="Mọi mốc đã được thu hoặc chưa có mốc nào." /> : (
        <div className="flex flex-col gap-4" data-testid="receivable-groups">
          {data.groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3"><h3 className="font-semibold">{g.name}</h3><span className="text-sm tabular-nums">{g.count} mốc · <strong>{money(g.total)}</strong>{g.max_late > 0 ? <span className="ml-2 text-red-700">trễ nhất {g.max_late} ngày</span> : null}</span></header>
              <ul className="divide-y">
                {g.items.map((it) => (
                  <li key={it.milestone_id} className="flex flex-col gap-2 px-4 py-3 text-sm" data-testid="receivable-item">
                    <div className="grid gap-x-4 gap-y-1 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
                      <div><Link className="font-medium text-primary hover:underline" href={`/du-an/${it.project_id}?tab=thanh-toan`}>{it.project_code} · {it.project_name}</Link><p className="text-xs text-muted-foreground">Mốc {it.milestone}{group === "project" ? ` · ${it.customer_name}` : ""}</p></div>
                      <div className="tabular-nums"><strong>{money(it.amount)}</strong><p className="text-xs text-muted-foreground">Hạn thu <DueText date={it.due_date} today={today} /></p></div>
                      <div><Badge className={BUCKET[it.bucket]?.[1]}>{BUCKET[it.bucket]?.[0] ?? it.bucket}</Badge>{it.days_late && it.days_late > 0 ? <p className="mt-1 text-xs text-red-700">Trễ {it.days_late} ngày</p> : null}</div>
                      <div className="text-xs"><p><span className="text-muted-foreground">Quản lý:</span> {it.managers || "—"}</p><p><span className="text-muted-foreground">Việc tiếp theo:</span> {it.next_action}</p></div>
                    </div>
                    {canRecord ? (
                      <Disclosure summary="Ghi nhận thu">
                        <ReceiptForm milestoneId={it.milestone_id} title={`${it.project_code} – ${it.milestone}`} amount={Number(it.amount)} dueDate={it.due_date} today={today} sources={L.sources} people={L.people} departments={L.departments}
                          defaultSource={src} defaultOwner={userId} defaultInvoice={it.invoice_no} />
                      </Disclosure>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

const getReReceivables = (group: string, customer?: string, project?: string) => getReceivables(group, customer, project);
function filterBucket(r: Receivables, bucket: string): Receivables {
  const ok = (b: string) => (bucket === "overdue" ? ["d1_30", "d31_60", "d61_90", "d90p"].includes(b) : b === bucket);
  const groups = r.groups.map((g) => ({ ...g, items: g.items.filter((i) => ok(i.bucket)) })).filter((g) => g.items.length)
    .map((g) => ({ ...g, count: g.items.length, total: String(g.items.reduce((s, i) => s + Number(i.amount), 0)), max_late: Math.max(0, ...g.items.map((i) => i.days_late ?? 0)) }));
  return { ...r, groups, count: groups.reduce((s, g) => s + g.count, 0), total: String(groups.reduce((s, g) => s + Number(g.total), 0)) };
}

// ------------------------------------------------------------------ Báo cáo
const DIMS: [string, string][] = [["project", "Dự án"], ["customer", "Khách hàng"], ["month", "Tháng"], ["department", "Phòng ban"], ["source", "Nguồn thu"], ["category", "Loại chi phí"]];
export async function ReportTab({ q, dim, today }: { q: FinanceQuery; dim: string; today: string }) {
  const rep = await getReport(dim, q.from, q.to);
  const drill = (key: string | null): string | null => {
    if (!key) return null;
    const r = { tu: q.from, den: q.to };
    switch (dim) {
      case "project": return `/thu-chi${qs({ tab: "thu", ...r, da: key })}`;
      case "customer": return `/thu-chi${qs({ tab: "thu", ...r, kh: key })}`;
      case "department": return `/thu-chi${qs({ tab: "thu", ...r, pb: key })}`;
      case "source": return `/thu-chi${qs({ tab: "thu", ...r, nguon: key })}`;
      case "category": return `/thu-chi${qs({ tab: "chi", ...r, lc: key })}`;
      case "month": { const [y, m] = key.split("-"); const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate(); return `/thu-chi${qs({ tab: "thu", tu: `${key}-01`, den: `${key}-${String(last).padStart(2, "0")}` })}`; }
      default: return null;
    }
  };
  return (
    <>
      <nav aria-label="Chiều báo cáo" className="flex flex-wrap gap-1.5">
        {DIMS.map(([k, l]) => <Link key={k} href={`/thu-chi${qs({ tab: "bao-cao", dim: k, tu: q.from, den: q.to })}`} aria-current={dim === k ? "true" : undefined} className={cn("rounded-full border px-3 py-1 text-sm font-medium", dim === k ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>{l}</Link>)}
      </nav>
      <form action="/thu-chi" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="bao-cao" /><input type="hidden" name="dim" value={dim} />
        <label className="text-xs">Từ ngày<input type="date" name="tu" defaultValue={q.from} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
        <label className="text-xs">Đến ngày<input type="date" name="den" defaultValue={q.to} className="mt-1 block h-10 rounded-lg border border-input bg-card px-3 text-sm" /></label>
        <Button type="submit" variant="outline">Xem</Button>
        <a href={`/thu-chi/xuat${qs({ type: "report", dim, tu: q.from, den: q.to })}`} className="ml-auto inline-flex h-10 items-center rounded-lg border bg-card px-3 text-sm font-medium text-primary hover:bg-primary-soft/40">Xuất CSV</a>
      </form>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Thực thu" value={money(rep.income)} tone="green" /><StatCard label="Thực chi (đã duyệt)" value={money(rep.expense)} tone="amber" />
        <StatCard label="Chênh lệch thu–chi" value={money(Number(rep.income) - Number(rep.expense))} tone={Number(rep.income) >= Number(rep.expense) ? "sky" : "orange"} hint="Không phải lợi nhuận kế toán" />
        <StatCard label="Dự kiến thu (mốc chưa thu)" value={money(rep.expected)} tone="violet" hint="Tách riêng, theo hạn mốc" />
      </section>
      <p className="text-xs text-muted-foreground">Thực thu / thực chi lấy từ giao dịch đã ghi nhận; dự kiến thu lấy từ mốc chưa thu theo hạn thu. Phòng ban lấy theo phòng ban của CHÍNH giao dịch. {dim === "department" ? "Giao dịch chưa gán phòng ban nằm ở “Chưa phân loại”. " : ""}Đến {formatDate(today)}.</p>
      {rep.rows.length === 0 ? <EmptyState title="Không có dữ liệu trong khoảng này" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[640px] text-sm" data-testid="report-table">
            <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-3.5 py-2.5">{DIMS.find(([k]) => k === dim)?.[1]}</th><th className="px-3.5 py-2.5 text-right">Thực thu</th><th className="px-3.5 py-2.5 text-right">Thực chi</th><th className="px-3.5 py-2.5 text-right">Chênh lệch thu–chi</th><th className="px-3.5 py-2.5 text-right">Dự kiến thu</th></tr></thead>
            <tbody className="divide-y">
              {rep.rows.map((r) => { const h = drill(r.key); return (
                <tr key={r.key ?? "none"}><td className="px-3.5 py-2.5">{h ? <Link className="font-medium text-primary hover:underline" href={h}>{r.label}</Link> : r.label}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{money(r.income)}</td><td className="px-3.5 py-2.5 text-right tabular-nums">{money(r.expense)}</td>
                  <td className={cn("px-3.5 py-2.5 text-right tabular-nums font-medium", Number(r.diff) < 0 && "text-red-700")}>{money(r.diff)}</td><td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.expected)}</td></tr>); })}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-semibold"><tr><td className="px-3.5 py-2.5">Tổng</td><td className="px-3.5 py-2.5 text-right tabular-nums">{money(rep.income)}</td><td className="px-3.5 py-2.5 text-right tabular-nums">{money(rep.expense)}</td><td className="px-3.5 py-2.5 text-right tabular-nums">{money(Number(rep.income) - Number(rep.expense))}</td><td className="px-3.5 py-2.5 text-right tabular-nums">{money(rep.expected)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </>
  );
}
