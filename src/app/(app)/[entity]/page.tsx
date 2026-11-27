import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, FileSpreadsheet, KanbanSquare, List, Plus } from "lucide-react";
import { KIND_BY_SLUG } from "@/lib/crm-import";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { entityBySlug, loadLookups, type Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { EntityForm } from "@/components/entity-form";
import { DataTable, ListToolbar, NoAccess } from "@/components/data-table";
import { EmptyState } from "@/components/ui/alert";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { compactVnd } from "@/components/charts";

type Props = { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; f?: string; view?: string }> };

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
  const board = e.kanban && sp.view === "kanban" ? e.kanban : null;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.f ? { f: sp.f } : {}), ...extra }).toString();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={e.title} description={e.description} eyebrow={`${rows.length} bản ghi`}
        actions={<>
          {e.kanban ? (
            <div className="inline-flex overflow-hidden rounded-lg border bg-card text-sm font-medium" role="group" aria-label="Kiểu hiển thị">
              <Link href={`/${e.slug}?${qs({})}`} aria-current={board ? undefined : "true"} className={`inline-flex h-10 items-center gap-1.5 px-3 ${board ? "hover:bg-muted" : "bg-primary-soft text-primary"}`}><List className="size-4" aria-hidden />Danh sách</Link>
              <Link href={`/${e.slug}?${qs({ view: "kanban" })}`} aria-current={board ? "true" : undefined} className={`inline-flex h-10 items-center gap-1.5 border-l px-3 ${board ? "bg-primary-soft text-primary" : "hover:bg-muted"}`}><KanbanSquare className="size-4" aria-hidden />Kanban</Link>
            </div>
          ) : null}
          {e.exportable !== false && e.view === "crm.view" ? <a href={`/xuat/${e.slug}?${qs({})}`} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Xuất CSV</a> : null}
          {canWrite && KIND_BY_SLUG[e.slug] ? <Link href={`/nhap-khach-hang/${e.slug}`} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><FileSpreadsheet className="size-4" aria-hidden />Nhập từ Excel</Link> : null}
        </>} />
      {e.creatable && canWrite ? (
        <Disclosure summary={`Thêm ${e.singular}`} icon={<Plus className="size-4" aria-hidden />}>
          <EntityForm entity={e.key} fields={e.fields(L)} />
        </Disclosure>
      ) : null}
      <ListToolbar action={`/${e.slug}`} q={sp.q} filter={e.filter} filterValue={sp.f} hidden={board ? { view: "kanban" } : undefined} />
      {board ? (
        <KanbanBoard
          key={`${sp.q}|${sp.f}|${rows.length}|${rows.map((r) => String(r[board.col])).join("")}`}
          rpc={board.rpc} idArg={board.idArg} statusArg={board.statusArg} prompt={board.prompt} revalidate={[`/${e.slug}`]}
          columns={board.columns.map((c): KanbanColumn => {
            const list = rows.filter((r) => String(r[board.col]) === c.value);
            return { ...c, cards: list.map((r) => ({ id: String(r.id), href: `/${e.slug}/${r.id}`, ...board.card(r, L) })), total: board.amount ? compactVnd(list.reduce((s, r) => s + board.amount!(r), 0)) : undefined };
          })}
        />
      ) : <DataTable
        rows={rows as (Row & { id: string })[]}
        cols={e.columns.map((c) => ({ label: c.label, className: c.className, cell: (r) => c.cell(r, L) }))}
        href={(r) => `/${e.slug}/${r.id}`}
        empty={<EmptyState title={term || sp.f ? "Không có kết quả phù hợp" : `Chưa có ${e.singular} nào`} description={canWrite && !term ? `Bấm "Thêm ${e.singular}" để bắt đầu.` : undefined} />}
        testId={`list-${e.key}`}
      />}
    </div>
  );
}
