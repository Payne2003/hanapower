import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getDepartments, parseDeptQuery, type DeptQuery } from "@/lib/hr";
import { entityBySlug, loadLookups } from "@/lib/entities";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { EntityForm } from "@/components/entity-form";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Pager, SELECT, SortTh, TABLE, THEAD } from "@/components/hr/ui";

export const metadata: Metadata = { title: "Phòng ban" };

type SP = Record<string, string | undefined>;

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Cơ cấu phòng ban" />;
  const q: DeptQuery = parseDeptQuery(sp);
  const e = entityBySlug("phong-ban")!;
  const [res, L] = await Promise.all([getDepartments(q), loadLookups(["people"])]);
  const canEdit = can(ctx, "users.manage");
  const filtered = !!(q.q || q.active !== undefined);
  const params = (over: Partial<DeptQuery> = {}) => {
    const m = { ...q, ...over };
    const p: Record<string, string | undefined> = { q: m.q || undefined, "trang-thai": m.active === true ? "dang-hoat-dong" : m.active === false ? "ngung" : undefined, sx: m.sort !== "name" ? m.sort : undefined, chieu: m.dir === "desc" ? "desc" : undefined, trang: m.page > 1 ? String(m.page) : undefined };
    const items = Object.entries(p).filter(([, v]) => v);
    return items.length ? `?${items.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
  };
  const t = res.totals;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title="Phòng ban" eyebrow={`${res.total} phòng${filtered ? " khớp bộ lọc" : ""}`}
        description="Cơ cấu tổ chức: mỗi phòng gồm các nhân viên với một hoặc nhiều chức vụ và một hoặc nhiều người quản lý; một nhân viên có thể thuộc nhiều phòng."
        actions={<a href={`/nhan-su/xuat${params({ page: 1 }) ? `${params({ page: 1 })}&` : "?"}loai=phong-ban`} data-testid="export-depts" className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Xuất CSV</a>} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dept-stats">
        <StatCard label="Phòng ban" value={t.departments} tone="green" />
        <StatCard label="Đang hoạt động" value={t.active} tone="sky" />
        <StatCard label="Nhân viên đã vào phòng" value={t.members} tone="violet" hint="Mỗi người tính một lần" href="/nhan-su" />
        <StatCard label="Chưa thuộc phòng nào" value={t.unassigned} tone={t.unassigned ? "orange" : "slate"} href="/nhan-su?chua-phan-phong=1" />
      </section>
      {canEdit ? <Disclosure summary="Thêm phòng ban" icon={<Plus className="size-4" aria-hidden />}><EntityForm entity="department" fields={e.fields(L)} /></Disclosure> : null}

      <form action="/phong-ban" method="get" role="search" aria-label="Tìm và lọc phòng ban" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={q.q} placeholder="Tìm theo tên phòng ban…" aria-label="Tìm theo tên phòng ban" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
        </div>
        <select name="trang-thai" defaultValue={q.active === true ? "dang-hoat-dong" : q.active === false ? "ngung" : ""} aria-label="Lọc theo trạng thái phòng" className={SELECT}>
          <option value="">Mọi trạng thái</option><option value="dang-hoat-dong">Đang hoạt động</option><option value="ngung">Ngừng hoạt động</option>
        </select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Lọc</button>
        {filtered ? <Link href="/phong-ban" className="px-2 text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
      </form>

      {res.rows.length === 0 ? <EmptyState title="Không có phòng ban phù hợp" description={filtered ? "Thử bỏ bộ lọc hoặc đổi từ khóa." : "Thêm phòng ban đầu tiên ở khung phía trên."} /> : (
        <div className="flex flex-col gap-3">
          <div className={TABLE}>
            <table className="w-full min-w-[720px] text-sm" data-testid="department-table">
              <thead className={THEAD}>
                <tr>
                  <SortTh label="Tên phòng" col="name" sort={q.sort} dir={q.dir} href={(c, d) => params({ sort: c, dir: d, page: 1 })} />
                  <th scope="col" className="px-3.5 py-2.5">Người quản lý</th>
                  <SortTh label="Số thành viên" col="members" sort={q.sort} dir={q.dir} href={(c, d) => params({ sort: c, dir: d, page: 1 })} />
                  <SortTh label="Số chức vụ đang dùng" col="positions" sort={q.sort} dir={q.dir} href={(c, d) => params({ sort: c, dir: d, page: 1 })} />
                  <SortTh label="Trạng thái" col="status" sort={q.sort} dir={q.dir} href={(c, d) => params({ sort: c, dir: d, page: 1 })} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {res.rows.map((d) => (
                  <tr key={d.id} data-dept={d.id} className="hover:bg-muted/30">
                    <td className="px-3.5 py-2.5"><Link href={`/phong-ban/${d.id}`} className="font-medium text-primary hover:underline" data-testid="dept-link">{d.name}</Link></td>
                    <td className="px-3.5 py-2.5">{d.managers.length ? d.managers.map((m) => <span key={m.id} className="mr-2 inline-block">{m.name}{m.position ? <span className="text-xs text-muted-foreground"> ({m.position})</span> : null}</span>) : <span className="text-muted-foreground">Chưa có</span>}</td>
                    <td className="px-3.5 py-2.5 tabular-nums"><Link href={`/nhan-su?phong=${d.id}`} className="hover:text-primary hover:underline">{d.member_count}</Link></td>
                    <td className="px-3.5 py-2.5 tabular-nums">{d.position_count}</td>
                    <td className="px-3.5 py-2.5">{d.active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đang hoạt động</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Ngừng hoạt động</Badge>}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pager total={res.total} page={q.page} size={q.size} href={(n) => `/phong-ban${params({ page: n })}`} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Danh mục phòng hiện là danh sách phẳng. Sơ đồ tổ chức phân cấp cần thêm quan hệ cha–con (cột departments.parent_id).</p>
    </div>
  );
}
