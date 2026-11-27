import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { MyContext } from "@/lib/types";
import { can } from "@/lib/auth";
import { getDashboardCharts, getSalesReport, monthLabel, weekLabel } from "@/lib/chart-data";
import { STAGE } from "@/lib/labels";
import { LEAD_STATUS, STAGE_OPP } from "@/lib/entities";
import { PROJECT_STAGE } from "@/lib/status-maps";
import { ChartCard, ColumnChart, compactVnd, DonutChart, HBarChart, LineChart, PALETTE } from "@/components/charts";

const STAGE_COLOR: Record<string, string> = {
  idea: "#8a8f98", preparing: "#2f8fb8", handover: "#7a5ac8", editing: "#4f5bd5", review: "#e0a22a", ready: "#4aa39a", published: "#0f6b3f", on_hold: "#e07b39", cancelled: "#c9ccd1",
};
const OPP_COLOR: Record<string, string> = { needs_analysis: "#2f8fb8", presentation: "#4f5bd5", negotiation: "#e0a22a", won: "#0f6b3f", lost: "#c9ccd1" };

/** Khối biểu đồ thống kê của Dashboard — số liệu lấy qua RLS nên mỗi người chỉ thấy phần được phép. */
export async function DashboardCharts({ ctx }: { ctx: MyContext }) {
  const d = await getDashboardCharts();
  if (!d) return null;
  const fin = can(ctx, "finance.view") && d.revenue_expense;
  const re = d.revenue_expense ?? [];
  const totalHead = d.headcount.reduce((s, x) => s + x.count, 0);
  const vids = d.videos_by_stage.filter((s) => s.stage !== "cancelled");
  return (
    <section aria-label="Biểu đồ thống kê" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Biểu đồ thống kê</h2>
        {can(ctx, "crm.view") ? <Link href="/bao-cao-ban-hang" className="text-sm font-medium text-primary hover:underline">Báo cáo bán hàng →</Link> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {fin ? (
          <ChartCard title="Thu – chi 6 tháng gần nhất" subtitle="Thu đã ghi nhận · Chi đã duyệt" className="lg:col-span-2" empty={re.every((m) => !m.income && !m.expense)}>
            <ColumnChart label="Thu chi theo tháng" labels={re.map((m) => monthLabel(m.month))} format={compactVnd} height={190}
              series={[{ name: "Thu", color: PALETTE[0]!, values: re.map((m) => m.income) }, { name: "Chi", color: PALETTE[4]!, values: re.map((m) => m.expense) }]} />
          </ChartCard>
        ) : null}
        {d.opp_by_stage ? (
          <ChartCard title="Phễu cơ hội theo giai đoạn" subtitle="Số cơ hội và tổng giá trị dự kiến" empty={d.opp_by_stage.every((s) => !s.count)}>
            <HBarChart label="Cơ hội theo giai đoạn" data={d.opp_by_stage.map((s) => ({ label: STAGE_OPP[s.stage]?.[0] ?? s.stage, value: s.count, color: OPP_COLOR[s.stage], sub: s.value ? compactVnd(s.value) : undefined }))} />
          </ChartCard>
        ) : null}
        <ChartCard title="Video đã tạo và đã đăng theo tuần" subtitle="8 tuần gần nhất" empty={d.videos_weekly.every((w) => !w.created && !w.published)}>
          <LineChart label="Video theo tuần" labels={d.videos_weekly.map((w) => weekLabel(w.week))}
            series={[{ name: "Tạo mới", color: PALETTE[1]!, values: d.videos_weekly.map((w) => w.created) }, { name: "Đã đăng", color: PALETTE[0]!, values: d.videos_weekly.map((w) => w.published) }]} />
        </ChartCard>
        <ChartCard title="Video theo giai đoạn sản xuất" empty={vids.every((s) => !s.count)}>
          <HBarChart label="Video theo giai đoạn" data={vids.map((s) => ({ label: STAGE[s.stage as keyof typeof STAGE]?.label ?? s.stage, value: s.count, color: STAGE_COLOR[s.stage] }))} />
        </ChartCard>
        <ChartCard title="Nhân sự theo phòng ban" subtitle={`${totalHead} nhân viên`} empty={!totalHead}>
          <DonutChart label="Nhân sự theo phòng ban" center="nhân viên" data={d.headcount.map((h) => ({ label: h.name, value: h.count }))} />
        </ChartCard>
        <ChartCard title="Dự án theo trạng thái" empty={d.projects_by_stage.every((s) => !s.count)}>
          <DonutChart label="Dự án theo trạng thái" center="dự án" data={d.projects_by_stage.map((s) => ({ label: PROJECT_STAGE[s.stage]?.[0] ?? s.stage, value: s.count }))} />
        </ChartCard>
        {d.leads_by_source ? (
          <ChartCard title="Lead theo nguồn" empty={!d.leads_by_source.length}>
            <DonutChart label="Lead theo nguồn" center="lead" data={d.leads_by_source.map((s) => ({ label: s.name, value: s.count }))} />
          </ChartCard>
        ) : null}
        {d.leads_by_status ? (
          <ChartCard title="Lead theo trạng thái" empty={d.leads_by_status.every((s) => !s.count)}>
            <HBarChart label="Lead theo trạng thái" data={d.leads_by_status.map((s) => ({ label: LEAD_STATUS[s.status]?.[0] ?? s.status, value: s.count }))} />
          </ChartCard>
        ) : null}
        {d.top_accounts ? (
          <ChartCard title="Khách hàng có giá trị hợp đồng cao nhất" empty={!d.top_accounts.length}>
            <HBarChart label="Top khách hàng" format={compactVnd} data={d.top_accounts.map((a) => ({ label: a.name, value: a.value }))} />
          </ChartCard>
        ) : null}
      </div>
    </section>
  );
}

/** Việc cần chú ý trong bán hàng: báo giá / hợp đồng sắp hết hạn, cơ hội quá hạn chốt, lead lâu chưa chăm. */
export async function AttentionCard({ ctx }: { ctx: MyContext }) {
  if (!can(ctx, "crm.view")) return null;
  const r = await getSalesReport().catch(() => null);
  if (!r) return null;
  const a = r.attention;
  const items = [
    { n: a.quotes_expiring, text: "báo giá sắp hết hạn (7 ngày)", href: "/bao-gia?f=sent" },
    { n: a.contracts_expiring, text: "hợp đồng sắp hết hạn (30 ngày)", href: "/hop-dong?f=active" },
    { n: a.opps_overdue, text: "cơ hội quá ngày dự kiến chốt", href: "/co-hoi" },
    { n: a.leads_stale, text: "lead 14 ngày chưa được chăm sóc", href: "/lead" },
  ].filter((i) => i.n > 0);
  if (!items.length) return null;
  return (
    <section aria-labelledby="att-h" className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <h2 id="att-h" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-amber-900"><AlertTriangle className="size-4" aria-hidden />Cần chú ý trong bán hàng</h2>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.text}><Link href={i.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-amber-100/70"><span className="grid min-w-7 place-items-center rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">{i.n}</span><span>{i.text}</span></Link></li>
        ))}
      </ul>
    </section>
  );
}
