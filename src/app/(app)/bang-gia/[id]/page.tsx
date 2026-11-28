import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { getChanges, getGrid, getPricingLookups } from "@/lib/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { NoAccess } from "@/components/data-table";
import { PriceGrid } from "@/components/pricing/price-grid";
import { RequestBadge, Tabs } from "@/components/pricing/ui";

export const metadata: Metadata = { title: "Bảng giá" };
const TABS: [string, string][] = [["dong-gia", "Dòng giá"], ["de-nghi", "Đề nghị thay đổi"], ["thong-tin", "Thông tin"]];

export default async function PriceBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; them?: string }> }) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, requireContext()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><NoAccess what="Bảng giá" /></div>;
  let grid;
  try { grid = await getGrid(id); } catch { notFound(); }
  const tab = TABS.some(([k]) => k === sp.tab) ? String(sp.tab) : "dong-gia";
  const canWrite = can(ctx, "crm.manage");
  const canApprove = can(ctx, "pricing.approve");
  const b = grid.book;
  const supabase = await createSupabaseServerClient();
  const [{ data: prods }, changes] = await Promise.all([
    supabase.from("products").select("id, name, code").is("deleted_at", null).eq("is_active", true).order("name").limit(1000),
    tab === "de-nghi" ? getChanges(undefined, false, id) : Promise.resolve(null),
  ]);
  const products = ((prods ?? []) as { id: string; name: string; code: string | null }[]).map((p) => ({ id: p.id, label: p.code ? `${p.name} (${p.code})` : p.name }));
  await getPricingLookups();
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <Link href="/bang-gia" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Bảng giá</Link>
      <PageHeader title={b.name} eyebrow={`Phiên bản ${b.version} · ${grid.lines.length} dòng giá`} description={b.description ?? undefined}
        actions={<><Badge className={b.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{b.is_active ? "Đang áp dụng" : "Ngừng"}</Badge>
          {b.requires_approval ? <Badge className="bg-amber-50 text-amber-800 ring-amber-300">Cần phê duyệt</Badge> : <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Sửa trực tiếp</Badge>}</>} />
      <Tabs items={TABS} current={tab} hrefOf={(k) => `/bang-gia/${id}?tab=${k}`} />
      {grid.pending.length ? <Alert tone="info">Có {grid.pending.length} đề nghị chưa hoàn tất cho bảng giá này: {grid.pending.map((r) => <Link key={r.id} className="mr-2 font-medium underline" href={`/bang-gia/de-nghi/${r.id}`}>{r.code}</Link>)}</Alert> : null}

      {tab === "dong-gia" ? <PriceGrid key={`${b.id}-${b.version}`} bookId={b.id} bookName={b.name} version={b.version} requiresApproval={b.requires_approval} lines={grid.lines} products={products} canEdit={canWrite} today={ctx.today} preAdd={sp.them} /> : null}

      {tab === "de-nghi" && changes ? (
        changes.rows.length === 0 ? <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Chưa có đề nghị nào cho bảng giá này.</p> : (
          <ul className="divide-y rounded-xl border bg-card shadow-[var(--shadow-card)]">{changes.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span><Link className="font-medium text-primary hover:underline" href={`/bang-gia/de-nghi/${r.id}`}>{r.code}</Link> · {r.line_count} dòng · hiệu lực {formatDate(r.effective_date)} · {r.requester ?? "—"}</span><RequestBadge s={r.display_status} /></li>))}</ul>)
      ) : null}

      {tab === "thong-tin" ? (
        <div className="flex max-w-2xl flex-col gap-4">
          {canWrite ? (
            <RpcForm rpc="save_price_book" fixed={{ p_id: id }} submitLabel="Lưu thông tin bảng giá" revalidate={[`/bang-gia/${id}`, "/bang-gia"]} columns={1}
              fields={[{ name: "p_name", label: "Tên bảng giá *", required: true, defaultValue: b.name }, { name: "p_description", label: "Mô tả", type: "textarea", defaultValue: b.description ?? "" }, { name: "p_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang áp dụng", defaultValue: b.is_active, hint: "Bảng ngừng áp dụng không chọn làm bảng mặc định được" }]} />
          ) : <p className="text-sm text-muted-foreground">Bạn chỉ có quyền xem thông tin bảng giá.</p>}
          {canApprove ? (
            <Disclosure summary={b.requires_approval ? "Chuyển sang sửa trực tiếp (bỏ phê duyệt)" : "Bật quy trình phê duyệt giá"}>
              <p className="mb-3 text-sm text-muted-foreground">{b.requires_approval ? "Người có quyền lập giá sẽ sửa trực tiếp, không cần duyệt." : "Mọi thay đổi giá phải gửi đề nghị, được người duyệt (khác người lập) phê duyệt và có hiệu lực theo ngày hiệu lực."}</p>
              <RpcButton rpc="set_price_book_options" args={{ p_book: id, p_requires_approval: !b.requires_approval }} label={b.requires_approval ? "Bỏ phê duyệt" : "Bật phê duyệt"} variant="outline" confirm="Đổi chế độ phê duyệt của bảng giá này?" revalidate={[`/bang-gia/${id}`, "/bang-gia"]} />
            </Disclosure>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
