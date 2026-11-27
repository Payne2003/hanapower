import type { Metadata } from "next";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { formatDate, formatDateTime } from "@/lib/dates";
import { shiftMonth, monthRange } from "@/lib/pipeline";
import { ATTENDANCE, badge, opts } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";

export const metadata: Metadata = { title: "Chấm công" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : ctx.today.slice(0, 7);
  const { from, to } = monthRange(month);
  const supabase = await createSupabaseServerClient();
  const manage = can(ctx, "payroll.manage");
  const view = can(ctx, "payroll.view");
  const [{ data }, L, locked] = await Promise.all([
    supabase.from("attendance_records").select("*").gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false }),
    loadLookups(["people"]),
    supabase.from("payroll_periods").select("status").eq("year", Number(month.slice(0, 4))).eq("month", Number(month.slice(5))).maybeSingle(),
  ]);
  const rows = (data ?? []) as Row[];
  const mine = rows.filter((r) => r.user_id === ctx.user_id);
  const today = mine.find((r) => r.work_date === ctx.today);
  const worked = (list: Row[]) => list.reduce((s, r) => s + (r.status === "present" || r.status === "leave_paid" || r.status === "holiday" ? 1 : r.status === "half" ? 0.5 : 0), 0);
  const perUser = new Map<string, Row[]>();
  for (const r of rows) perUser.set(r.user_id as string, [...(perUser.get(r.user_id as string) ?? []), r]);
  const rev = ["/cham-cong", "/luong"];
  const time = (v: unknown) => (v ? formatDateTime(v as string, ctx.timezone).slice(-5) : "—");
  const lockedP = locked.data && locked.data.status !== "draft";
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Chấm công" description="Chấm công vào / ra mỗi ngày. Nhân sự có thể điều chỉnh công khi kỳ lương còn ở trạng thái nháp." />
      <Card>
        <CardHeader><CardTitle>Hôm nay · {formatDate(ctx.today)}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <RpcButton rpc="check_in" args={{}} label={today?.check_in ? `Đã vào lúc ${time(today.check_in)}` : "Chấm công vào"} variant={today?.check_in ? "outline" : "default"} size="default" icon={<LogIn aria-hidden />} revalidate={rev} />
          <RpcButton rpc="check_out" args={{}} label={today?.check_out ? `Đã ra lúc ${time(today.check_out)}` : "Chấm công ra"} variant="outline" size="default" icon={<LogOut aria-hidden />} revalidate={rev} />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-sm">
        <Link className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted" href={`/cham-cong?m=${shiftMonth(month, -1)}`}>← Tháng trước</Link>
        <strong>Tháng {month.slice(5)}/{month.slice(0, 4)}</strong>
        <Link className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted" href={`/cham-cong?m=${shiftMonth(month, 1)}`}>Tháng sau →</Link>
        {lockedP ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-300">Kỳ lương đã khóa</span> : null}
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Công của tôi" value={worked(mine)} tone="green" /><StatCard label="Số ngày có bản ghi" value={mine.length} tone="slate" />
      </section>
      <DataTable rows={mine as (Row & { id: string })[]} empty={<p className="text-sm text-muted-foreground">Chưa có bản ghi chấm công trong tháng này.</p>}
        cols={[{ label: "Ngày", cell: (r) => formatDate(r.work_date as string) }, { label: "Trạng thái", cell: (r) => badge(ATTENDANCE, r.status) }, { label: "Vào", cell: (r) => time(r.check_in) }, { label: "Ra", cell: (r) => time(r.check_out) }, { label: "Ghi chú", cell: (r) => String(r.note ?? "—"), className: "hidden sm:table-cell" }]} />

      {view ? (
        <Card>
          <CardHeader><CardTitle>Tổng hợp công toàn công ty</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DataTable rows={(L.people ?? []).map(([id, name]) => ({ id, name, list: perUser.get(id) ?? [] }))}
              cols={[{ label: "Nhân viên", cell: (r) => r.name }, { label: "Công", cell: (r) => worked(r.list), className: "text-right" }, { label: "Nghỉ / vắng", cell: (r) => r.list.filter((x) => ["leave_paid", "leave_unpaid", "absent"].includes(String(x.status))).length, className: "text-right hidden sm:table-cell" },
                ...(manage && !lockedP ? [{ label: "", cell: (r: { id: string }) => <RpcButton rpc="fill_attendance" args={{ p_user: r.id, p_from: from, p_to: to < ctx.today ? to : ctx.today }} label="Điền đủ công T2–T6" variant="ghost" confirm="Điền công đi làm cho các ngày T2–T6 còn trống (đến hôm nay)?" revalidate={rev} /> }] : [])]} />
            {manage && !lockedP ? (
              <Disclosure summary="Điều chỉnh công một ngày">
                <RpcForm rpc="set_attendance" submitLabel="Lưu" revalidate={rev} columns={3} resetOnSuccess
                  fields={[{ name: "p_user", label: "Nhân viên", type: "select", as: "uuid", required: true, options: L.people ?? [] }, { name: "p_date", label: "Ngày", type: "date", required: true, defaultValue: ctx.today },
                    { name: "p_status", label: "Trạng thái", type: "select", required: true, defaultValue: "present", options: opts(ATTENDANCE) }, { name: "p_note", label: "Ghi chú", wide: true }]} />
              </Disclosure>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <span className="hidden">{nameOf(L, "people", ctx.user_id)}</span>
    </div>
  );
}
