import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getOrgStructure } from "@/lib/org-data";
import { ROLE_LABEL } from "@/lib/labels";
import { entityBySlug, loadLookups } from "@/lib/entities";
import { PageHeader, StatCard, Avatar } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { EntityForm, DeleteEntityButton } from "@/components/entity-form";
import { DataTable, NoAccess } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Badge } from "@/components/ui/badge";
import { DonutChart } from "@/components/charts";

export const metadata: Metadata = { title: "Phòng ban" };

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Cơ cấu phòng ban" />;
  const org = await getOrgStructure();
  const d = org.departments.find((x) => x.id === id);
  if (!d) notFound();
  const e = entityBySlug("phong-ban")!;
  const L = await loadLookups(["people"]);
  const canEdit = can(ctx, "users.manage");
  const members = org.membersOf(id);
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = org.staff.filter((s) => !memberIds.has(s.id)).map((s) => [s.id, `${s.full_name}${s.job_title ? ` — ${s.job_title}` : ""}`] as [string, string]);
  const roleCount = new Map<string, number>();
  for (const m of members) for (const r of m.roles) roleCount.set(r, (roleCount.get(r) ?? 0) + 1);
  const rev = [`/phong-ban/${id}`, "/phong-ban", "/nhan-su"];
  const mgr = members.find((m) => m.id === d.manager_id) ?? org.staff.find((s) => s.id === d.manager_id);
  const rows = [...members].sort((a, b) => (a.id === d.manager_id ? -1 : b.id === d.manager_id ? 1 : a.full_name.localeCompare(b.full_name, "vi")));
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/phong-ban" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Phòng ban</Link>
      <PageHeader title={d.name} eyebrow={mgr ? `Trưởng phòng: ${mgr.full_name}` : "Chưa có trưởng phòng"} actions={canEdit && members.length === 0 ? <DeleteEntityButton entity="department" id={id} /> : null} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Nhân viên" value={members.length} tone="green" />
        <StatCard label="Thuộc chính phòng này" value={members.filter((m) => m.department_id === id).length} tone="sky" hint="Phòng ban chính của nhân viên" />
        <StatCard label="Kiêm nhiệm" value={members.filter((m) => m.department_id !== id).length} tone="violet" />
        <StatCard label="Trưởng phòng" value={mgr?.full_name ?? "—"} tone="amber" />
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader><CardTitle>Nhân viên ({members.length})</CardTitle></CardHeader>
          <CardContent>
            <DataTable testId="department-members" rows={rows} empty={<p className="text-sm text-muted-foreground">Phòng ban chưa có nhân viên. {canEdit ? "Thêm ở khung bên dưới." : ""}</p>}
              cols={[
                { label: "Nhân viên", cell: (m) => <div className="flex items-center gap-2.5"><Avatar name={m.full_name} className="size-8" /><div className="min-w-0"><p className="flex items-center gap-1.5 font-medium">{m.full_name}{m.id === d.manager_id ? <Crown className="size-3.5 text-amber-600" aria-label="Trưởng phòng" /> : null}</p><p className="truncate text-xs text-muted-foreground">{m.email}</p></div></div> },
                { label: "Chức vụ", cell: (m) => m.positions[id] ?? m.job_title ?? "—" },
                { label: "Vai trò", cell: (m) => <div className="flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}</div>, className: "hidden md:table-cell" },
                { label: "Loại", cell: (m) => (m.department_id === id ? "Chính" : "Kiêm nhiệm"), className: "hidden lg:table-cell" },
                ...(canEdit ? [{ label: "", cell: (m: (typeof rows)[number]) => (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {m.id !== d.manager_id ? <RpcButton rpc="set_department_manager" args={{ p_dept: id, p_user: m.id }} label="Đặt làm trưởng phòng" variant="ghost" revalidate={rev} /> : null}
                    <RpcButton rpc="remove_department_member" args={{ p_dept: id, p_user: m.id }} label="Gỡ khỏi phòng" variant="ghost" confirm={`Gỡ ${m.full_name} khỏi phòng ban này?`} revalidate={rev} />
                  </div>) }] : []),
              ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cơ cấu vai trò</CardTitle></CardHeader>
          <CardContent>{roleCount.size ? <DonutChart label="Vai trò trong phòng" center="vai trò" data={[...roleCount].map(([r, n]) => ({ label: ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r, value: n }))} /> : <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}</CardContent>
        </Card>
      </div>
      {canEdit ? (
        <>
          <Card>
            <CardHeader><CardTitle>Thêm nhân viên vào phòng</CardTitle></CardHeader>
            <CardContent>
              <RpcForm rpc="add_department_member" fixed={{ p_dept: id }} submitLabel="Thêm vào phòng" revalidate={rev} resetOnSuccess columns={3}
                fields={[
                  { name: "p_user", label: "Nhân viên", type: "select", as: "uuid", required: true, options: candidates },
                  { name: "p_position", label: "Chức vụ trong phòng", type: "select", as: "uuid", options: org.positions },
                  { name: "p_primary", label: "Phòng ban chính", type: "checkbox", placeholder: "Đặt làm phòng ban chính của nhân viên", defaultValue: true },
                ]} />
              {candidates.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Mọi nhân viên đều đã thuộc phòng ban này.</p> : null}
            </CardContent>
          </Card>
          <Disclosure summary="Đổi tên / trưởng phòng"><EntityForm entity="department" id={id} fields={e.fields(L).map((f) => ({ ...f, defaultValue: (f.name === "name" ? d.name : d.manager_id) as string | null }))} /></Disclosure>
        </>
      ) : null}
    </div>
  );
}
