import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Pencil } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getDepartmentOverview, getDepartmentTasks, getLookups, getStaffList, parseStaffQuery } from "@/lib/hr";
import { badge, EMPLOYMENT_STATUS, WORK_FORM, TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from "@/lib/status-maps";
import { entityBySlug, loadLookups } from "@/lib/entities";
import { formatDateTime } from "@/lib/dates";
import { dayIn } from "@/lib/work-board";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard, Avatar } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { EntityForm, DeleteEntityButton } from "@/components/entity-form";
import { NoAccess } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Badge } from "@/components/ui/badge";
import { DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/ui/alert";
import { TABLE, THEAD } from "@/components/hr/ui";

export const metadata: Metadata = { title: "Phòng ban" };

const TABS = [["tong-quan", "Tổng quan"], ["thanh-vien", "Thành viên"], ["quan-ly", "Người quản lý"], ["cong-viec", "Công việc của thành viên"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Cơ cấu phòng ban" />;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "tong-quan";
  const ov = await getDepartmentOverview(id);
  if (!ov) notFound();
  const staffAdmin = can(ctx, "users.manage") || can(ctx, "staff.manage");
  const isAdmin = can(ctx, "users.manage");
  const rev = [`/phong-ban/${id}`, "/phong-ban", "/nhan-su"];
  const d = ov.dept;
  const memberIds = new Set(ov.members.map((m) => m.id));
  const [lookups, tasks, everyone, L] = await Promise.all([
    getLookups(),
    tab === "cong-viec" ? getDepartmentTasks(id) : Promise.resolve(null),
    staffAdmin && tab === "thanh-vien" ? getStaffList({ ...parseStaffQuery({}, 500), size: 500 }) : Promise.resolve(null),
    isAdmin ? loadLookups(["people"]) : Promise.resolve({}),
  ]);
  const posOpts = lookups.positions.map((p) => [p.id, p.name] as [string, string]);
  const candidates = (everyone?.rows ?? []).filter((r) => !memberIds.has(r.id) && r.status !== "resigned" && r.active).map((r) => [r.id, `${r.code} · ${r.name}`] as [string, string]);
  const e = entityBySlug("phong-ban")!;
  const link = (t: Tab) => `/phong-ban/${id}?tab=${t}`;
  const profileHref = (uid: string) => `/nhan-su?xem=chi-tiet&id=${uid}&phong=${id}&tu=${id}`;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5">
      <Link href="/phong-ban" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Phòng ban</Link>
      <PageHeader title={d.name} eyebrow={d.active ? "Đang hoạt động" : "Ngừng hoạt động"}
        description={ov.managers.length ? `Quản lý: ${ov.managers.map((m) => m.name).join(", ")}` : "Chưa có người quản lý"}
        actions={isAdmin && ov.member_count === 0 ? <DeleteEntityButton entity="department" id={id} /> : null} />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Các mục của phòng ban">
        {TABS.map(([k, l]) => <Link key={k} href={link(k)} data-testid={`dtab-${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</Link>)}
      </nav>

      {tab === "tong-quan" ? (
        <div className="flex flex-col gap-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dept-overview">
            <StatCard label="Thành viên (mỗi người một lần)" value={ov.member_count} tone="green" href={`/nhan-su?phong=${id}`} />
            <StatCard label="Chức vụ đang dùng" value={ov.position_count} tone="sky" />
            <StatCard label="Người quản lý" value={ov.managers.length} tone="amber" />
            <StatCard label="Trạng thái phòng" value={d.active ? "Hoạt động" : "Ngừng"} tone={d.active ? "violet" : "slate"} />
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Cơ cấu theo chức vụ</CardTitle></CardHeader><CardContent>
              {ov.by_position.length ? <DonutChart label="Thành viên theo chức vụ" center="người" data={ov.by_position.map((p) => ({ label: p.name, value: p.count }))} /> : <p className="text-sm text-muted-foreground">Chưa có chức vụ nào trong phòng.</p>}
              <p className="mt-2 text-xs text-muted-foreground">Một người giữ nhiều chức vụ được tính ở từng chức vụ; tổng thành viên vẫn tính một lần.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Hình thức làm việc & trạng thái</CardTitle></CardHeader><CardContent>
              {ov.member_count ? (
                <div className="flex flex-col gap-3">
                  <DonutChart label="Thành viên theo hình thức làm việc" center="người" data={Object.entries(ov.by_work_form).map(([k, n]) => ({ label: WORK_FORM[k]?.[0] ?? k, value: n }))} />
                  <ul className="flex flex-wrap gap-2 text-sm">{Object.entries(ov.by_status).map(([k, n]) => <li key={k} className="flex items-center gap-1.5">{badge(EMPLOYMENT_STATUS, k)}<span className="tabular-nums">{n}</span></li>)}</ul>
                </div>
              ) : <p className="text-sm text-muted-foreground">Phòng chưa có thành viên.</p>}
            </CardContent></Card>
          </div>
          {isAdmin ? (
            <section aria-label="Quản trị phòng ban" className="flex flex-col gap-3">
              <div>
                <RpcButton rpc="set_department_active" args={{ p_dept: id, p_active: !d.active }} label={d.active ? "Ngừng hoạt động phòng" : "Bật lại phòng"} variant="outline" size="default" confirm={d.active ? "Ngừng hoạt động phòng ban này? Phòng sẽ không nhận thêm thành viên mới." : undefined} revalidate={rev} />
              </div>
              <Disclosure summary="Đổi tên phòng" icon={<Pencil className="size-4" aria-hidden />}><EntityForm entity="department" id={id} fields={e.fields(L as never).filter((f) => f.name === "name").map((f) => ({ ...f, defaultValue: d.name }))} /></Disclosure>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "thanh-vien" ? (
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Thành viên ({ov.member_count})</CardTitle></CardHeader><CardContent>
            {ov.members.length === 0 ? <EmptyState title="Phòng chưa có thành viên" description={staffAdmin ? "Thêm nhân viên ở khung bên dưới." : undefined} /> : (
              <div className={TABLE}><table className="w-full min-w-[720px] text-sm" data-testid="department-members">
                <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Mã NV</th><th className="px-3.5 py-2.5">Họ tên</th><th className="px-3.5 py-2.5">Chức vụ trong phòng</th><th className="px-3.5 py-2.5">Hình thức</th><th className="px-3.5 py-2.5">Trạng thái</th>{staffAdmin ? <th /> : null}</tr></thead>
                <tbody className="divide-y">{ov.members.map((m) => (
                  <tr key={m.id} data-member={m.id} className="align-top hover:bg-muted/30">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-muted-foreground">{m.code}</td>
                    <td className="px-3.5 py-2.5"><Link href={profileHref(m.id)} data-testid="member-link" className="flex items-center gap-2.5 hover:text-primary"><Avatar name={m.name} className="size-8" /><span className="min-w-0"><span className="flex items-center gap-1.5 font-medium">{m.name}{m.is_manager ? <Crown className="size-3.5 text-amber-600" aria-label="Quản lý phòng" /> : null}</span><span className="block truncate text-xs text-muted-foreground">{m.email}</span></span></Link></td>
                    <td className="px-3.5 py-2.5"><span className="flex flex-wrap gap-1" data-testid="member-positions">{m.positions.length ? m.positions.map((p) => <Badge key={p.id} className="bg-muted text-foreground/80 ring-border">{p.name}</Badge>) : <span className="text-muted-foreground">Chưa có chức vụ</span>}</span></td>
                    <td className="px-3.5 py-2.5">{badge(WORK_FORM, m.work_form)}</td>
                    <td className="px-3.5 py-2.5">{badge(EMPLOYMENT_STATUS, m.status)}</td>
                    {staffAdmin ? (
                      <td className="px-3.5 py-2.5"><div className="flex flex-col items-end gap-2">
                        <details className="w-64 rounded-lg border p-2 text-left"><summary className="cursor-pointer text-xs font-medium text-primary">Sửa chức vụ</summary>
                          <RpcForm rpc="set_member_positions" fixed={{ p_dept: id, p_user: m.id }} submitLabel="Lưu chức vụ" okMessage="Đã lưu chức vụ." revalidate={rev} columns={1} className="mt-2" variant="soft"
                            fields={[{ name: "p_positions", label: "Chức vụ (có thể chọn nhiều)", type: "checks", options: posOpts, defaultValue: m.positions.map((p) => p.id) }]} />
                        </details>
                        <RpcButton rpc="remove_department_member" args={{ p_dept: id, p_user: m.id }} label="Gỡ khỏi phòng" variant="ghost" confirm={`Gỡ ${m.name} khỏi phòng?${m.is_manager ? " Vai trò quản lý phòng của người này cũng sẽ kết thúc." : ""}`} revalidate={rev} />
                      </div></td>
                    ) : null}
                  </tr>))}</tbody></table></div>
            )}
          </CardContent></Card>
          {staffAdmin ? (
            <Card><CardHeader><CardTitle>Thêm nhân viên vào phòng</CardTitle></CardHeader><CardContent>
              <RpcForm rpc="add_department_member" fixed={{ p_dept: id }} submitLabel="Thêm vào phòng" revalidate={rev} resetOnSuccess columns={3}
                fields={[
                  { name: "p_user", label: "Nhân viên", type: "select", as: "uuid", required: true, options: candidates },
                  { name: "p_position", label: "Chức vụ", type: "select", as: "uuid", options: posOpts },
                  { name: "p_primary", label: "Phòng ban chính", type: "checkbox", placeholder: "Đặt làm phòng ban chính của nhân viên", defaultValue: false },
                ]} />
              {candidates.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Mọi nhân viên đang làm việc đều đã thuộc phòng này.</p> : null}
              {!d.active ? <p className="mt-2 text-xs text-amber-700">Phòng đã ngừng hoạt động: bật lại trước khi thêm thành viên.</p> : null}
            </CardContent></Card>
          ) : null}
        </div>
      ) : null}

      {tab === "quan-ly" ? (
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Người quản lý phòng ({ov.managers.length})</CardTitle></CardHeader><CardContent>
            {ov.managers.length === 0 ? <p className="text-sm text-muted-foreground">Phòng chưa có người quản lý.</p> : (
              <ul className="flex flex-col gap-2" data-testid="managers">{ov.managers.map((m) => (
                <li key={m.id} data-manager={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                  <Avatar name={m.name} className="size-8" />
                  <span className="min-w-0 flex-1"><Link href={profileHref(m.id)} className="font-medium hover:text-primary hover:underline">{m.name}</Link><span className="block text-xs text-muted-foreground">{m.code} · Chức vụ quản lý: {m.position ?? "chưa đặt"}</span></span>
                  {staffAdmin ? <RpcButton rpc="remove_department_manager" args={{ p_dept: id, p_user: m.id }} label="Kết thúc quản lý" variant="ghost" confirm={`Kết thúc vai trò quản lý phòng của ${m.name}? Người này vẫn là thành viên.`} revalidate={rev} /> : null}
                </li>))}</ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Quản lý phòng được xem công việc của thành viên phòng mình. Quyền khác (duyệt, đăng, lương…) vẫn theo vai trò hệ thống, không tự cấp theo chức vụ quản lý.</p>
          </CardContent></Card>
          {staffAdmin ? (
            <Card><CardHeader><CardTitle>Thêm hoặc đổi chức vụ quản lý</CardTitle></CardHeader><CardContent>
              {ov.members.length === 0 ? <p className="text-sm text-muted-foreground">Cần có thành viên trước khi chọn người quản lý.</p> : (
                <RpcForm rpc="add_department_manager" fixed={{ p_dept: id }} submitLabel="Lưu người quản lý" okMessage="Đã lưu người quản lý." revalidate={rev} columns={2}
                  fields={[
                    { name: "p_user", label: "Thành viên của phòng", type: "select", as: "uuid", required: true, options: ov.members.map((m) => [m.id, `${m.code} · ${m.name}`] as [string, string]) },
                    { name: "p_position", label: "Chức vụ quản lý", type: "select", as: "uuid", options: posOpts },
                  ]} />
              )}
              <p className="mt-2 text-xs text-muted-foreground">Chỉ thành viên của phòng mới làm quản lý được. Gỡ một thành viên khỏi phòng cũng kết thúc vai trò quản lý của họ.</p>
            </CardContent></Card>
          ) : null}
        </div>
      ) : null}

      {tab === "cong-viec" && tasks ? (
        <Card><CardHeader><CardTitle>Công việc của thành viên ({tasks.total})</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Phòng ban chưa liên kết trực tiếp với công việc; danh sách lấy theo người được giao là thành viên phòng. Mỗi việc chỉ đếm một lần dù nhiều thành viên cùng được giao; chỉ hiện việc bạn được phép xem.</p>
          {tasks.rows.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có công việc nào.</p> : (
            <div className={TABLE}><table className="w-full min-w-[640px] text-sm" data-testid="dept-tasks">
              <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Công việc</th><th className="px-3.5 py-2.5">Loại</th><th className="px-3.5 py-2.5">Ưu tiên</th><th className="px-3.5 py-2.5">Trạng thái</th><th className="px-3.5 py-2.5">Hạn / lịch</th><th className="px-3.5 py-2.5">Người được giao</th></tr></thead>
              <tbody className="divide-y">{tasks.rows.map((t) => {
                const late = !!t.scheduled_at && t.status !== "completed" && t.status !== "cancelled" && (dayIn(t.scheduled_at, ctx.timezone) ?? "9999") < ctx.today;
                return (
                  <tr key={t.id} data-task={t.id}>
                    <td className="px-3.5 py-2.5"><Link href={`/cong-viec?tab=cho&v=tat-ca&the=${t.id}`} className="font-medium text-primary hover:underline">{t.title}</Link></td>
                    <td className="px-3.5 py-2.5 text-muted-foreground">{t.video_id ? "Đầu việc video" : TASK_TYPE[t.type] ?? t.type}</td>
                    <td className="px-3.5 py-2.5">{badge(TASK_PRIORITY, t.priority)}</td>
                    <td className="px-3.5 py-2.5">{badge(TASK_STATUS, t.status)}</td>
                    <td className="px-3.5 py-2.5">{t.scheduled_at ? <span className={late ? "font-medium text-red-700" : undefined}>{formatDateTime(t.scheduled_at, ctx.timezone)}{late ? " · Quá hạn" : ""}</span> : "—"}</td>
                    <td className="px-3.5 py-2.5">{t.assignees.map((a) => a.name).join(", ")}</td>
                  </tr>);
              })}</tbody></table></div>
          )}
        </CardContent></Card>
      ) : null}
    </div>
  );
}
