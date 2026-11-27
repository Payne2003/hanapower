import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Crown, Download, FileCheck2, List, PanelLeft, Search, UserPlus } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { avatarSrc } from "@/lib/avatar";
import { getLookups, getStaffList, getStaffSummary, parseStaffQuery, staffParams, type StaffQuery, type StaffRow } from "@/lib/hr";
import { getProfile } from "@/lib/hr-profile";
import { badge, EMPLOYMENT_STATUS, WORK_FORM, opts } from "@/lib/status-maps";
import { cn } from "@/lib/utils";
import { PageHeader, Avatar } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { AccountCreateForm } from "@/components/account-forms";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Chip, Pager, SELECT, SortTh, TABLE, THEAD } from "@/components/hr/ui";
import { StaffProfile, PROFILE_TABS, type ProfileTab } from "@/components/hr/staff-profile";

export const metadata: Metadata = { title: "Nhân viên" };

type SP = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Assignments({ r }: { r: StaffRow }) {
  if (r.assignments.length === 0) return <span className="text-muted-foreground">Chưa thuộc phòng ban</span>;
  return (
    <ul className="flex flex-col gap-1">{r.assignments.map((a) => (
      <li key={a.dept_id} className="flex flex-wrap items-center gap-1.5 text-sm" data-dept={a.dept_id}>
        <Link href={`/phong-ban/${a.dept_id}`} className="font-medium hover:text-primary hover:underline">{a.dept}</Link>
        {a.is_manager ? <Crown className="size-3.5 text-amber-600" aria-label="Quản lý phòng" /> : null}
        <span className="text-muted-foreground">·</span>
        {a.positions.length ? a.positions.map((p) => <Badge key={p.id} className="bg-muted text-foreground/80 ring-border">{p.name}</Badge>) : <span className="text-xs text-muted-foreground">chưa có chức vụ</span>}
      </li>))}</ul>
  );
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Danh sách nhân viên" />;
  const detail = sp.xem === "chi-tiet";
  const q: StaffQuery = parseStaffQuery(sp, detail ? 12 : 20);
  const back = sp.tu && UUID.test(sp.tu) ? sp.tu : undefined;
  const wantId = sp.id && UUID.test(sp.id) ? sp.id : undefined;
  const muc = (PROFILE_TABS.find(([k]) => k === sp.muc)?.[0] ?? "tong-quan") as ProfileTab;
  const isAdmin = can(ctx, "users.manage");

  const [list, summary, lookups] = await Promise.all([getStaffList(q), getStaffSummary(q), getLookups()]);
  const selectedId = detail ? wantId ?? list.rows[0]?.id : undefined;
  const data = selectedId ? await getProfile(ctx, selectedId) : null;
  const deptName = new Map(lookups.departments.map((d) => [d.id, d.name]));
  const backName = back ? deptName.get(back) : undefined;

  const keep = { tu: back } as Record<string, string | undefined>;
  const url = (over: Partial<StaffQuery> = {}, extra: Record<string, string | undefined> = {}) => `/nhan-su${staffParams({ ...q, ...over }, { ...keep, ...extra })}`;
  // Chuyển chế độ giữ nguyên bộ lọc, trang và nhân viên đang chọn
  const modeHref = (m: "ds" | "chi-tiet") => url({}, m === "chi-tiet" ? { xem: "chi-tiet", id: selectedId ?? list.rows[0]?.id, muc: sp.muc } : {});
  const pageHref = (n: number) => url({ page: n }, detail ? { xem: "chi-tiet", id: selectedId, muc: sp.muc } : {});
  const sortHref = (col: string, dir: "asc" | "desc") => url({ sort: col, dir, page: 1 });
  const filtered = !!(q.q || q.dept || q.position || q.status || q.form || q.none);
  const exportHref = `/nhan-su/xuat${staffParams({ ...q, page: 1 })}`;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5">
      {back ? <Link href={`/phong-ban/${back}?tab=thanh-vien`} data-testid="back-to-dept" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Quay về phòng {backName ?? "ban"}</Link> : null}
      <PageHeader title="Nhân viên" eyebrow={`${list.total} người${filtered ? " khớp bộ lọc" : ""}`}
        description="Danh sách và hồ sơ nhân viên: phòng ban, chức vụ, hình thức làm việc, liên hệ, tài liệu, công việc, lương và tài khoản — mỗi mục chỉ hiện với người có quyền."
        actions={<>
          {can(ctx, "staff.manage") || isAdmin ? <Link href="/nhan-su/giay-to" data-testid="link-docs" className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted"><FileCheck2 className="size-4" aria-hidden />Giấy tờ nhân viên</Link> : null}
          <a href={exportHref} className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted" data-testid="export-staff"><Download className="size-4" aria-hidden />Xuất CSV</a>
        </>} />
      {isAdmin ? (
        <Disclosure summary="Tạo tài khoản nhân viên" icon={<UserPlus className="size-4" aria-hidden />}>
          <AccountCreateForm departments={lookups.departments.map((d) => ({ id: d.id, name: d.name }))} />
        </Disclosure>
      ) : null}

      <section aria-label="Tổng hợp" className="flex flex-col gap-2" data-testid="staff-summary">
        <div className="flex flex-wrap gap-2">
          {Object.entries(EMPLOYMENT_STATUS).map(([k, [label]]) => <Chip key={k} label={label} count={summary.by_status[k] ?? 0} href={url({ status: q.status === k ? undefined : k, page: 1 })} active={q.status === k} />)}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
          {Object.entries(WORK_FORM).map(([k, [label]]) => <Chip key={k} label={label} count={summary.by_work_form[k] ?? 0} href={url({ form: q.form === k ? undefined : k, page: 1 })} active={q.form === k} />)}
          <Chip label="Chưa thuộc phòng nào" count={summary.unassigned} href={url({ none: !q.none, page: 1 })} active={q.none} />
        </div>
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">Theo phòng ban và chức vụ ({summary.by_department.length} phòng · {summary.by_position.length} chức vụ)</summary>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" data-testid="summary-depts">{summary.by_department.map((d) => <Chip key={d.id} label={d.name} count={d.count} href={url({ dept: q.dept === d.id ? undefined : d.id, page: 1 })} active={q.dept === d.id} />)}</div>
            <div className="flex flex-wrap gap-2" data-testid="summary-positions">{summary.by_position.map((p) => <Chip key={p.id} label={p.name} count={p.count} href={url({ position: q.position === p.id ? undefined : p.id, page: 1 })} active={q.position === p.id} />)}</div>
            <p className="text-xs text-muted-foreground">Số liệu tính trên toàn bộ kết quả khớp bộ lọc. Một người giữ nhiều chức vụ hoặc thuộc nhiều phòng được tính ở từng nhóm.</p>
          </div>
        </details>
      </section>

      <form action="/nhan-su" method="get" role="search" aria-label="Tìm và lọc nhân viên" className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {detail ? <input type="hidden" name="xem" value="chi-tiet" /> : null}
        {back ? <input type="hidden" name="tu" value={back} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={q.q} placeholder="Tìm theo tên hoặc mã nhân viên…" aria-label="Tìm theo tên hoặc mã nhân viên" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
        </div>
        <select name="phong" defaultValue={q.dept ?? ""} aria-label="Lọc theo phòng ban" className={SELECT}><option value="">Mọi phòng ban</option>{lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="chuc-vu" defaultValue={q.position ?? ""} aria-label="Lọc theo chức vụ" className={SELECT}><option value="">Mọi chức vụ</option>{lookups.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="trang-thai" defaultValue={q.status ?? ""} aria-label="Lọc theo trạng thái nhân sự" className={SELECT}><option value="">Mọi trạng thái</option>{opts(EMPLOYMENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="hinh-thuc" defaultValue={q.form ?? ""} aria-label="Lọc theo hình thức làm việc" className={SELECT}><option value="">Mọi hình thức</option>{opts(WORK_FORM).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Lọc</button>
        {filtered ? <Link href={`/nhan-su${staffParams({}, { xem: detail ? "chi-tiet" : undefined, tu: back })}`} className="px-2 text-sm text-muted-foreground underline" data-testid="clear-filter">Xóa lọc</Link> : null}
      </form>

      <div className="flex gap-1" role="group" aria-label="Chế độ xem">
        <Link href={modeHref("ds")} aria-current={!detail ? "true" : undefined} data-testid="mode-list" className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", !detail ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}><List className="size-4" aria-hidden />Danh sách</Link>
        <Link href={modeHref("chi-tiet")} aria-current={detail ? "true" : undefined} data-testid="mode-detail" className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", detail ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}><PanelLeft className="size-4" aria-hidden />Chi tiết hồ sơ</Link>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title="Không có nhân viên phù hợp" description={filtered ? "Thử bỏ bớt bộ lọc hoặc đổi từ khóa." : "Chưa có nhân viên nào."} />
      ) : !detail ? (
        <div className="flex flex-col gap-3">
          <div className={TABLE}>
            <table className="w-full min-w-[760px] text-sm" data-testid="staff-table">
              <thead className={THEAD}>
                <tr>
                  <SortTh label="Mã NV" col="code" sort={q.sort} dir={q.dir} href={sortHref} />
                  <SortTh label="Họ tên" col="name" sort={q.sort} dir={q.dir} href={sortHref} />
                  <th scope="col" className="px-3.5 py-2.5">Phòng ban · Chức vụ</th>
                  <SortTh label="Hình thức" col="work_form" sort={q.sort} dir={q.dir} href={sortHref} />
                  <SortTh label="Trạng thái" col="status" sort={q.sort} dir={q.dir} href={sortHref} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.rows.map((r) => (
                  <tr key={r.id} data-staff={r.id} className="hover:bg-muted/30">
                    <td className="px-3.5 py-2.5 align-top font-mono text-xs text-muted-foreground">{r.code}</td>
                    <td className="px-3.5 py-2.5 align-top">
                      <Link href={url({}, { xem: "chi-tiet", id: r.id })} className="flex items-center gap-2.5 hover:text-primary" data-testid="staff-link">
                        <Avatar name={r.name} src={avatarSrc(r.id, r.avatar)} className="size-8" /><span className="min-w-0"><span className="block font-medium">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.email}</span></span>
                      </Link>
                    </td>
                    <td className="px-3.5 py-2.5 align-top"><Assignments r={r} /></td>
                    <td className="px-3.5 py-2.5 align-top">{badge(WORK_FORM, r.work_form)}</td>
                    <td className="px-3.5 py-2.5 align-top"><span className="flex flex-wrap gap-1">{badge(EMPLOYMENT_STATUS, r.status)}{!r.active ? <Badge className="bg-red-50 text-red-800 ring-red-300">Khóa TK</Badge> : null}</span></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pager total={list.total} page={q.page} size={q.size} href={pageHref} />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]" data-testid="staff-detail-layout">
          <aside className="flex flex-col gap-2" aria-label="Danh sách nhân viên">
            <ul className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]" data-testid="staff-compact">
              {list.rows.map((r) => (
                <li key={r.id} data-staff={r.id} className="border-b last:border-b-0">
                  <Link href={url({}, { xem: "chi-tiet", id: r.id, muc: sp.muc })} aria-current={r.id === selectedId ? "true" : undefined}
                    className={cn("flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50", r.id === selectedId && "bg-primary-soft/60")}>
                    <Avatar name={r.name} src={avatarSrc(r.id, r.avatar)} className="size-8" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.code} · {r.assignments[0]?.dept ?? "Chưa có phòng"}</span></span>
                    {r.status !== "working" ? <span className="size-2 shrink-0 rounded-full bg-amber-500" title={EMPLOYMENT_STATUS[r.status]?.[0]} aria-label={EMPLOYMENT_STATUS[r.status]?.[0]} /> : null}
                  </Link>
                </li>))}
            </ul>
            <Pager total={list.total} page={q.page} size={q.size} href={pageHref} />
          </aside>
          {data ? (
            <StaffProfile d={data} tab={muc} today={ctx.today} timezone={ctx.timezone} selfId={ctx.user_id}
              tabHref={(t) => url({}, { xem: "chi-tiet", id: data.profile.id, muc: t })} />
          ) : <EmptyState title="Không tìm thấy hồ sơ" description="Nhân viên không tồn tại hoặc bạn không có quyền xem." />}
        </div>
      )}
    </div>
  );
}
