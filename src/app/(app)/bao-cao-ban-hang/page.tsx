import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Percent, Target, Timer, TrendingUp } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { getDashboardCharts, getSalesReport, monthLabel } from "@/lib/chart-data";
import { STAGE_OPP } from "@/lib/entities";
import { QUOTE_STATUS } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { NoAccess, DataTable } from "@/components/data-table";
import { ChartCard, ColumnChart, compactVnd, HBarChart, PALETTE } from "@/components/charts";
import { AttentionCard } from "@/components/dashboard-charts";

export const metadata: Metadata = { title: "Báo cáo bán hàng" };

const OPP_COLOR: Record<string, string> = { needs_analysis: "#2f8fb8", presentation: "#4f5bd5", negotiation: "#e0a22a", won: "#0f6b3f", lost: "#c9ccd1" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function SalesReportPage() {
  const ctx = await requireContext();
  if (!can(ctx, "crm.view")) return <NoAccess what="Báo cáo bán hàng" />;
  const [r, d] = await Promise.all([getSalesReport(), getDashboardCharts()]);
  if (!r) return <NoAccess what="Báo cáo bán hàng" />;
  const k = r.kpi;
  const closed = k.won_count + k.lost_count;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title="Báo cáo bán hàng" description="Phễu cơ hội, dự báo doanh thu theo ngày chốt, hiệu quả nguồn lead và nhân viên kinh doanh. Số liệu theo quyền xem của bạn." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Chỉ số chính">
        <StatCard label="Giá trị đang theo đuổi" value={compactVnd(k.open_value)} icon={<Banknote />} tone="sky" hint={`${k.open_count} cơ hội đang mở`} href="/co-hoi" />
        <StatCard label="Dự báo theo xác suất" value={compactVnd(k.weighted)} icon={<TrendingUp />} tone="violet" />
        <StatCard label="Tỷ lệ thắng" value={pct(k.won_count, closed)} icon={<Percent />} tone="green" hint={`${k.won_count} thắng / ${k.lost_count} thua`} />
        <StatCard label="Giá trị trung bình mỗi deal" value={compactVnd(k.avg_deal)} icon={<Target />} tone="amber" />
        <StatCard label="Chu kỳ chốt trung bình" value={`${Math.round(k.cycle_days)} ngày`} icon={<Timer />} tone="orange" hint="Từ tạo đến thắng" />
      </section>
      <AttentionCard ctx={ctx} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Dự báo doanh thu theo tháng dự kiến chốt" subtitle="Cơ hội đang mở: giá trị đầy đủ và giá trị theo xác suất" className="lg:col-span-2" empty={r.forecast.every((m) => !m.value)}>
          <ColumnChart label="Dự báo theo tháng" labels={r.forecast.map((m) => monthLabel(m.month))} format={compactVnd} height={190}
            series={[{ name: "Giá trị", color: PALETTE[1]!, values: r.forecast.map((m) => m.value) }, { name: "Theo xác suất", color: PALETTE[0]!, values: r.forecast.map((m) => m.weighted) }]} />
        </ChartCard>
        <ChartCard title="Phễu cơ hội" subtitle="Số cơ hội · giá trị" empty={!d?.opp_by_stage || d.opp_by_stage.every((s) => !s.count)}>
          <HBarChart label="Cơ hội theo giai đoạn" data={(d?.opp_by_stage ?? []).map((s) => ({ label: STAGE_OPP[s.stage]?.[0] ?? s.stage, value: s.count, color: OPP_COLOR[s.stage], sub: s.value ? compactVnd(s.value) : undefined }))} />
        </ChartCard>
        <ChartCard title="Giá trị hợp đồng ký theo tháng" subtitle="Theo ngày hiệu lực, 6 tháng gần nhất" empty={r.won_by_month.every((m) => !m.value)}>
          <ColumnChart label="Hợp đồng theo tháng" labels={r.won_by_month.map((m) => monthLabel(m.month))} format={compactVnd} series={[{ name: "Giá trị hợp đồng", color: PALETTE[0]!, values: r.won_by_month.map((m) => m.value) }]} />
        </ChartCard>
        <ChartCard title="Báo giá theo trạng thái" empty={r.quote_funnel.every((s) => !s.count)}>
          <HBarChart label="Báo giá theo trạng thái" data={r.quote_funnel.map((s) => ({ label: QUOTE_STATUS[s.status]?.[0] ?? s.status, value: s.count }))} />
        </ChartCard>
        <ChartCard title="Lý do thua cơ hội" empty={!r.lost_reasons.length}>
          <HBarChart label="Lý do thua" data={r.lost_reasons.map((s) => ({ label: s.name, value: s.count, color: PALETTE[4] }))} />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3"><h2 className="text-[15px] font-semibold">Hiệu quả theo nguồn lead</h2>
          <DataTable rows={r.lead_sources.map((s, i) => ({ id: i, ...s }))} empty={<p className="text-sm text-muted-foreground">Chưa có lead.</p>}
            cols={[{ label: "Nguồn", cell: (x) => x.name }, { label: "Lead", cell: (x) => x.leads, className: "text-right" }, { label: "Đã chuyển đổi", cell: (x) => x.converted, className: "text-right" }, { label: "Tỷ lệ", cell: (x) => <strong>{pct(x.converted, x.leads)}</strong>, className: "text-right" }]} />
        </section>
        <section className="flex min-w-0 flex-col gap-3"><h2 className="text-[15px] font-semibold">Kết quả theo người phụ trách</h2>
          <DataTable rows={r.owners.map((s, i) => ({ id: i, ...s }))} empty={<p className="text-sm text-muted-foreground">Chưa có cơ hội.</p>}
            cols={[{ label: "Nhân viên", cell: (x) => x.name }, { label: "Cơ hội", cell: (x) => x.count, className: "text-right" }, { label: "Đang mở", cell: (x) => compactVnd(x.open_value), className: "text-right" }, { label: "Đã thắng", cell: (x) => <strong>{compactVnd(x.won_value)}</strong>, className: "text-right" }]} />
        </section>
      </div>
      <p className="text-xs text-muted-foreground">Giá trị cơ hội lấy từ các dòng sản phẩm. “Theo xác suất” = giá trị × xác suất thắng của giai đoạn. Xem chi tiết từng cơ hội ở <Link href="/co-hoi" className="text-primary hover:underline">Cơ hội</Link>.</p>
    </div>
  );
}
