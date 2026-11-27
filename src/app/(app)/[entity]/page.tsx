import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { entityBySlug, loadLookups, type Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { EntityForm } from "@/components/entity-form";
import { DataTable, ListToolbar, NoAccess } from "@/components/data-table";
import { EmptyState } from "@/components/ui/alert";

type Props = { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; f?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = entityBySlug((await params).entity);
  return { title: e?.title ?? "Không tìm thấy" };
}

export default async function EntityListPage({ params, searchParams }: Props) {
  const { entity: slug } = await params;
  const e = entityBySlug(slug);
  if (!e) notFound();
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (!can(ctx, e.view)) return <div className="mx-auto max-w-3xl"><PageHeader title={e.title} /><div className="mt-5"><NoAccess what={e.title} /></div></div>;

  const supabase = await createSupabaseServerClient();
  let q = supabase.from(e.table).select("*").order(e.order[0], { ascending: e.order[1] }).limit(300);
  if (e.soft) q = q.is("deleted_at", null);
  const term = (sp.q ?? "").replace(/[%*,()\\]/g, " ").trim().slice(0, 80);
  if (term) q = q.or(e.searchCols.map((c) => `${c}.ilike.%${term}%`).join(","));
  if (sp.f && e.filter && /^[a-z_]+$/.test(sp.f)) q = q.eq(e.filter.col, sp.f);
  const [{ data, error }, L] = await Promise.all([q, loadLookups(e.lookups)]);
  if (error) throw new Error(`Không tải được ${e.title}: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const canWrite = can(ctx, e.write);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={e.title} description={e.description} eyebrow={`${rows.length} bản ghi`} />
      {e.creatable && canWrite ? (
        <Disclosure summary={`Thêm ${e.singular}`} icon={<Plus className="size-4" aria-hidden />}>
          <EntityForm entity={e.key} fields={e.fields(L)} />
        </Disclosure>
      ) : null}
      <ListToolbar action={`/${e.slug}`} q={sp.q} filter={e.filter} filterValue={sp.f} />
      <DataTable
        rows={rows as (Row & { id: string })[]}
        cols={e.columns.map((c) => ({ label: c.label, className: c.className, cell: (r) => c.cell(r, L) }))}
        href={(r) => `/${e.slug}/${r.id}`}
        empty={<EmptyState title={term || sp.f ? "Không có kết quả phù hợp" : `Chưa có ${e.singular} nào`} description={canWrite && !term ? `Bấm "Thêm ${e.singular}" để bắt đầu.` : undefined} />}
        testId={`list-${e.key}`}
      />
    </div>
  );
}
