import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getPositions } from "@/lib/hr";
import { entityBySlug, loadLookups } from "@/lib/entities";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { EntityForm } from "@/components/entity-form";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { TABLE, THEAD } from "@/components/hr/ui";

export const metadata: Metadata = { title: "Chức vụ" };

export default async function PositionsPage() {
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Danh mục chức vụ" />;
  const e = entityBySlug("chuc-vu")!;
  const [rows, L] = await Promise.all([getPositions(), loadLookups(e.lookups)]);
  const canEdit = can(ctx, "users.manage");
  const used = rows.filter((r) => r.staff_count > 0).length;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-5">
      <PageHeader title="Chức vụ" eyebrow={`${rows.length} chức vụ`} description="Danh mục chức vụ trong công ty. Chức vụ gắn với từng phòng ban của nhân viên; một nhân viên có thể giữ nhiều chức vụ." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Chức vụ" value={rows.length} tone="green" />
        <StatCard label="Đang có người giữ" value={used} tone="sky" />
        <StatCard label="Chưa có người giữ" value={rows.length - used} tone={rows.length - used ? "orange" : "slate"} />
      </section>
      {canEdit ? <Disclosure summary="Thêm chức vụ" icon={<Plus className="size-4" aria-hidden />}><EntityForm entity="position" fields={e.fields(L)} /></Disclosure> : null}
      {rows.length === 0 ? <EmptyState title="Chưa có chức vụ" description="Thêm chức vụ đầu tiên ở khung phía trên." /> : (
        <div className={TABLE}>
          <table className="w-full min-w-[480px] text-sm" data-testid="position-table">
            <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Chức vụ</th><th className="px-3.5 py-2.5">Nhân viên đang giữ</th><th className="px-3.5 py-2.5">Số phòng đang dùng</th><th className="px-3.5 py-2.5">Trạng thái</th>{canEdit ? <th /> : null}</tr></thead>
            <tbody className="divide-y">{rows.map((p) => (
              <tr key={p.id} data-position={p.id} className="hover:bg-muted/30">
                <td className="px-3.5 py-2.5 font-medium">{p.name}</td>
                <td className="px-3.5 py-2.5 tabular-nums"><Link href={`/nhan-su?chuc-vu=${p.id}`} className="text-primary hover:underline" data-testid="position-staff-link">{p.staff_count}</Link></td>
                <td className="px-3.5 py-2.5 tabular-nums">{p.dept_count}</td>
                <td className="px-3.5 py-2.5">{p.active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đang dùng</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Ngừng</Badge>}</td>
                {canEdit ? <td className="px-3.5 py-2.5 text-right"><Link href={`/chuc-vu/${p.id}`} className="text-sm text-primary hover:underline">Sửa</Link></td> : null}
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
