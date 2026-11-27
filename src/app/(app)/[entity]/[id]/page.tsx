import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { entityBySlug, loadLookups, type Row } from "@/lib/entities";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EntityForm, DeleteEntityButton } from "@/components/entity-form";
import { EntityRelated } from "@/components/entity-related";
import { NoAccess } from "@/components/data-table";

type Props = { params: Promise<{ entity: string; id: string }> };

export const metadata: Metadata = { title: "Chi tiết" };

export default async function EntityDetailPage({ params }: Props) {
  const { entity: slug, id } = await params;
  const e = entityBySlug(slug);
  if (!e || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx, e.view)) return <NoAccess what={e.title} />;
  const supabase = await createSupabaseServerClient();
  let q = supabase.from(e.table).select("*").eq("id", id);
  if (e.soft) q = q.is("deleted_at", null);
  const [{ data }, L] = await Promise.all([q.maybeSingle(), loadLookups(e.lookups)]);
  if (!data) notFound();
  const row = data as Row;
  const canWrite = can(ctx, e.write);
  const fields = e.fields(L).map((f) => {
    const v = row[f.name];
    return { ...f, defaultValue: (v as string | number | boolean | string[] | null | undefined) ?? (f.type === "checkbox" ? false : null) };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href={`/${e.slug}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />{e.title}</Link>
      <PageHeader title={e.titleOf(row) || e.singular} eyebrow={e.title} actions={canWrite ? <DeleteEntityButton entity={e.key} id={id} /> : null} />
      <Card><CardContent className="pt-5"><EntityForm entity={e.key} id={id} fields={fields} canWrite={canWrite && !(e.key === "lead" && row.is_converted === true)} /></CardContent></Card>
      <EntityRelated e={e} row={row} canWrite={canWrite} />
    </div>
  );
}
