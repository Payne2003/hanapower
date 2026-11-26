import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getPeople, getVideos } from "@/lib/queries";
import { monthRange, monthlyKpi, shiftMonth } from "@/lib/pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { VideoTable } from "@/components/video-table";
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
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Báo cáo tháng {label}</h1>
          <p className="text-sm text-muted-foreground">Tổng hợp theo ngày báo cáo của video (thay cho các tab t11, t12… trong Google Sheet).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/bao-cao?thang=${shiftMonth(month, -1)}`}>‹ Tháng trước</Link>
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/bao-cao?thang=${shiftMonth(month, 1)}`}>Tháng sau ›</Link>
          <a className={buttonVariants({ size: "sm" })} href={`/bao-cao/xuat?thang=${month}`} download><Download aria-hidden /> Xuất Excel (CSV)</a>
        </div>
      </header>

      <section aria-label="Chỉ số" className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Tổng video" value={kpi.total} testId="kpi-total" />
        <Kpi label="Đã bàn giao Edit" value={kpi.handedOver} />
        <Kpi label="Nhận đủ ngay lần đầu" value={kpi.firstPassRate === null ? "—" : `${kpi.firstPassRate}%`} />
        <Kpi label="Lần yêu cầu bổ sung" value={kpi.supplements} />
        <Kpi label="Đang dựng" value={kpi.inEditing} />
        <Kpi label="Lần yêu cầu sửa" value={kpi.revisions} />
        <Kpi label="Đã đăng" value={kpi.published} />
        <Kpi label="Quá hạn đăng" value={kpi.overdue} warn />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Theo Content</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Người</th><th>Video</th><th>Đã bàn giao</th><th>Chờ bàn giao</th><th>Bị yêu cầu bổ sung</th></tr></thead>
              <tbody>
                {byPerson("content").map(({ p, mine }) => (
                  <tr key={p.id} className="border-t"><td className="py-1.5">{p.full_name}</td><td>{mine.length}</td><td>{mine.filter(handed).length}</td><td>{mine.filter((v) => v.stage === "handover").length}</td><td>{mine.reduce((s, v) => s + v.supplement_count, 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Theo Editor</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Người</th><th>Chờ xác nhận</th><th>Đang dựng</th><th>Chờ duyệt</th><th>Lần sửa</th><th>Đã đăng</th></tr></thead>
              <tbody>
                {byPerson("editor").map(({ p, mine }) => (
                  <tr key={p.id} className="border-t"><td className="py-1.5">{p.full_name}</td><td>{mine.filter((v) => v.stage === "handover").length}</td><td>{mine.filter((v) => v.stage === "editing").length}</td><td>{mine.filter((v) => v.stage === "review").length}</td><td>{mine.reduce((s, v) => s + v.revision_count, 0)}</td><td>{mine.filter((v) => v.stage === "published").length}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tbl-h" className="flex flex-col gap-2">
        <h2 id="tbl-h" className="text-lg font-semibold">Bảng báo cáo công việc và bàn giao Content</h2>
        {videos.length === 0 ? <EmptyState title={`Chưa có video trong tháng ${label}`} /> : <VideoTable videos={videos} names={names} today={ctx.today} />}
      </section>
    </div>
  );
}

function Kpi({ label, value, warn, testId }: { label: string; value: number | string; warn?: boolean; testId?: string }) {
  const hot = warn && typeof value === "number" && value > 0;
  return (
    <Card className={hot ? "border-orange-200 bg-orange-50" : undefined}>
      <CardContent className="pt-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums" data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
