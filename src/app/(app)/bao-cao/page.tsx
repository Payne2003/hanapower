import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getPeople, getVideos } from "@/lib/queries";
import { monthRange, monthlyKpi, shiftMonth } from "@/lib/pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { SheetTable } from "@/components/video-table";
import { PageHeader, StatCard, Avatar } from "@/components/ui/page-header";
import { ChevronLeft, ChevronRight, Clapperboard, Send, BadgeCheck, RotateCcw, Scissors, PenLine, CheckCircle2, AlarmClock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Video } from "@/lib/types";

export const metadata: Metadata = { title: "Báo cáo tháng" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ thang?: string }> }) {
  const { thang } = await searchParams;
  const ctx = await requireContext();
  const month = thang && /^\d{4}-\d{2}$/.test(thang) ? thang : ctx.today.slice(0, 7);
  const [videos, people] = await Promise.all([getVideos(monthRange(month)), getPeople()]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const kpi = monthlyKpi(videos, ctx.today);
  const label = `${month.slice(5)}/${month.slice(0, 4)}`;

  const byPerson = (role: "content" | "editor") =>
    people
      .filter((p) => p.roles.includes(role))
      .map((p) => {
        const mine = videos.filter((v) => (role === "content" ? v.content_owner_id : v.editor_id) === p.id && v.stage !== "cancelled");
        return { p, mine };
      })
      .filter((x) => x.mine.length > 0 || x.p.is_active);
  const handed = (v: Video) => ["editing", "review", "ready", "published"].includes(v.stage);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title={`Báo cáo tháng ${label}`}
        description="Tổng hợp theo ngày báo cáo của video — thay cho các tab t11, t12… trong Google Sheet."
        actions={
          <>
            <div className="inline-flex rounded-lg border bg-card shadow-xs">
              <Link aria-label="Tháng trước" className="grid h-10 w-10 place-items-center rounded-l-lg hover:bg-muted" href={`/bao-cao?thang=${shiftMonth(month, -1)}`}><ChevronLeft className="size-4" /></Link>
              <span className="grid place-items-center border-x px-3 text-sm font-medium">{label}</span>
              <Link aria-label="Tháng sau" className="grid h-10 w-10 place-items-center rounded-r-lg hover:bg-muted" href={`/bao-cao?thang=${shiftMonth(month, 1)}`}><ChevronRight className="size-4" /></Link>
            </div>
            <a className={buttonVariants()} href={`/bao-cao/xuat?thang=${month}`} download><Download aria-hidden /> Xuất Excel (CSV)</a>
          </>
        }
      />

      <section aria-label="Chỉ số" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tổng video" value={kpi.total} icon={<Clapperboard />} tone="green" testId="kpi-total" />
        <StatCard label="Đã bàn giao Edit" value={kpi.handedOver} icon={<Send />} tone="violet" />
        <StatCard label="Nhận đủ ngay lần đầu" value={kpi.firstPassRate === null ? "—" : `${kpi.firstPassRate}%`} icon={<BadgeCheck />} tone="sky" />
        <StatCard label="Lần yêu cầu bổ sung" value={kpi.supplements} icon={<RotateCcw />} tone="amber" />
        <StatCard label="Đang dựng" value={kpi.inEditing} icon={<Scissors />} tone="violet" />
        <StatCard label="Lần yêu cầu sửa" value={kpi.revisions} icon={<PenLine />} tone="amber" />
        <StatCard label="Đã đăng" value={kpi.published} icon={<CheckCircle2 />} tone="green" />
        <StatCard label="Quá hạn đăng" value={kpi.overdue} icon={<AlarmClock />} tone={kpi.overdue ? "orange" : "slate"} />
      </section>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Theo Content</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm tabular-nums [&_td]:px-2">
              <thead className="text-left text-xs text-muted-foreground [&_th]:px-2 [&_th]:font-medium"><tr><th className="py-2">Người</th><th>Video</th><th>Đã bàn giao</th><th>Chờ bàn giao</th><th>Bị yêu cầu bổ sung</th></tr></thead>
              <tbody>
                {byPerson("content").map(({ p, mine }) => (
                  <tr key={p.id} className="border-t"><td className="py-2.5 pr-3"><span className="flex items-center gap-2"><Avatar name={p.full_name} />{p.full_name}</span></td><td>{mine.length}</td><td>{mine.filter(handed).length}</td><td>{mine.filter((v) => v.stage === "handover").length}</td><td>{mine.reduce((s, v) => s + v.supplement_count, 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Theo Editor</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm tabular-nums [&_td]:px-2">
              <thead className="text-left text-xs text-muted-foreground [&_th]:px-2 [&_th]:font-medium"><tr><th className="py-2">Người</th><th>Chờ xác nhận</th><th>Đang dựng</th><th>Chờ duyệt</th><th>Lần sửa</th><th>Đã đăng</th></tr></thead>
              <tbody>
                {byPerson("editor").map(({ p, mine }) => (
                  <tr key={p.id} className="border-t"><td className="py-2.5 pr-3"><span className="flex items-center gap-2"><Avatar name={p.full_name} />{p.full_name}</span></td><td>{mine.filter((v) => v.stage === "handover").length}</td><td>{mine.filter((v) => v.stage === "editing").length}</td><td>{mine.filter((v) => v.stage === "review").length}</td><td>{mine.reduce((s, v) => s + v.revision_count, 0)}</td><td>{mine.filter((v) => v.stage === "published").length}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tbl-h" className="flex min-w-0 flex-col gap-2">
        <h2 id="tbl-h" className="text-lg font-semibold tracking-tight">Bảng báo cáo công việc và bàn giao Content</h2>
        {videos.length === 0 ? <EmptyState title={`Chưa có video trong tháng ${label}`} /> : <SheetTable videos={videos} names={names} today={ctx.today} />}
      </section>
    </div>
  );
}
