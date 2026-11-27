import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UserCog } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getOrgStructure } from "@/lib/org-data";
import { ROLE_LABEL } from "@/lib/labels";
import { PageHeader, StatCard, Avatar } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { EntityForm } from "@/components/entity-form";
import { entityBySlug, loadLookups } from "@/lib/entities";
import { NoAccess } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Phòng ban" };

export default async function DepartmentsPage() {
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Cơ cấu phòng ban" />;
  const e = entityBySlug("phong-ban")!;
  const [org, L] = await Promise.all([getOrgStructure(), loadLookups(["people"])]);
  const canEdit = can(ctx, "users.manage");
  const assigned = new Set(org.departments.flatMap((d) => org.membersOf(d.id).map((m) => m.id)));
  const unassigned = org.staff.filter((s) => !assigned.has(s.id));
  const name = new Map(org.staff.map((s) => [s.id, s.full_name]));
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Phòng ban" eyebrow={`${org.departments.length} phòng ban · ${org.staff.length} nhân viên`} description="Cơ cấu tổ chức: mỗi phòng ban gồm các nhân viên với chức vụ riêng; một nhân viên có thể thuộc nhiều phòng ban." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Phòng ban" value={org.departments.length} tone="green" />
        <StatCard label="Nhân viên" value={org.staff.length} tone="sky" />
        <StatCard label="Chưa phân bổ" value={unassigned.length} tone={unassigned.length ? "orange" : "slate"} />
        <StatCard label="Đã có trưởng phòng" value={`${org.departments.filter((d) => d.manager_id).length}/${org.departments.length}`} tone="violet" />
      </section>
      {canEdit ? (
        <Disclosure summary="Thêm phòng ban" icon={<Plus className="size-4" aria-hidden />}><EntityForm entity="department" fields={e.fields(L)} /></Disclosure>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="department-cards">
        {org.departments.map((d) => {
          const members = org.membersOf(d.id);
          const roleCount = new Map<string, number>();
          for (const m of members) for (const r of m.roles) roleCount.set(r, (roleCount.get(r) ?? 0) + 1);
          return (
            <Link key={d.id} href={`/phong-ban/${d.id}`} className="group flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate text-[15px] font-semibold group-hover:text-primary">{d.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><UserCog className="size-3.5" aria-hidden />{d.manager_id ? `Trưởng phòng: ${name.get(d.manager_id) ?? "—"}` : "Chưa có trưởng phòng"}</p></div>
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{members.length} người</span>
              </div>
              <div className="flex -space-x-1.5">
                {members.slice(0, 8).map((m) => <Avatar key={m.id} name={m.full_name} className="size-8 ring-2 ring-white" />)}
                {members.length > 8 ? <span className="grid size-8 place-items-center rounded-full bg-muted text-[11px] font-medium ring-2 ring-white">+{members.length - 8}</span> : null}
                {members.length === 0 ? <span className="text-xs text-muted-foreground">Chưa có nhân viên</span> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">{[...roleCount].map(([r, n]) => <Badge key={r} className="bg-muted text-foreground/80 ring-border">{ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r} · {n}</Badge>)}</div>
            </Link>
          );
        })}
      </div>
      {unassigned.length ? (
        <section className="rounded-xl border border-dashed bg-card/60 p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Chưa thuộc phòng ban nào ({unassigned.length})</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{unassigned.map((s) => <li key={s.id} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1"><Avatar name={s.full_name} className="size-5 text-[9px]" />{s.full_name}</li>)}</ul>
          {canEdit ? <p className="mt-2 text-xs text-muted-foreground">Mở một phòng ban để thêm nhân viên vào.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
