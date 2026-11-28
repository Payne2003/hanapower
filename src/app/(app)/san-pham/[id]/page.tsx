import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/form-spec";
import { safeBack } from "@/lib/finance-ui";
import { getPriceCompare, getPricingLookups, getProduct } from "@/lib/pricing";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { NoAccess } from "@/components/data-table";
import { FileUpload } from "@/components/finance/file-upload";
import { PriceEstimator } from "@/components/pricing/price-estimator";
import { ISSUE_ACTION, ISSUE_LABEL, ProductThumb, Tabs } from "@/components/pricing/ui";
import { uploadProductFileAction } from "../actions";

export const metadata: Metadata = { title: "Sản phẩm / dịch vụ" };
const TABS: [string, string][] = [["tong-quan", "Tổng quan"], ["bang-gia", "Bảng giá"], ["tep", "Tệp đính kèm"]];

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; tu?: string }> }) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, requireContext()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!can(ctx, "crm.view")) return <div className="mx-auto max-w-3xl"><NoAccess what="Sản phẩm / dịch vụ" /></div>;
  const p = await getProduct(id);
  if (!p) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? String(sp.tab) : "tong-quan";
  const back = safeBack(sp.tu);
  const canWrite = can(ctx, "crm.manage");
  const [cmp, L, filesRes, hist] = await Promise.all([
    getPriceCompare(id), getPricingLookups(),
    createSupabaseServerClient().then((s) => s.from("product_files").select("id, kind, name, size_bytes, created_at").eq("product_id", id).order("created_at", { ascending: false })),
    createSupabaseServerClient().then((s) => s.from("price_book_line_history").select("id, price_book_id, unit_price, fee_percent, tax_percent, effective_from, request_id").eq("product_id", id).order("effective_from", { ascending: false }).limit(50)),
  ]);
  const files = (filesRes.data ?? []) as { id: string; kind: string; name: string; size_bytes: number; created_at: string }[];
  const bookName = new Map(L.books.map((b) => [b.id, b.name]));
  const unit = L.units.find((u) => u.id === p.unit_id)?.name ?? null;
  const category = L.categories.find((c) => c.id === p.category_id)?.name ?? null;
  const defBook = L.books.find((b) => b.id === p.default_price_book_id);
  const issue = !p.is_active ? null : !p.default_price_book_id ? "no_default" : !defBook || !defBook.is_active ? "default_inactive" : !cmp.rows.some((r) => r.book_id === p.default_price_book_id) ? "no_line" : null;
  const active = cmp.rows.filter((r) => r.is_active);
  const rev = [`/san-pham/${id}`, "/san-pham"];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href={`/san-pham${back}${back ? `#row-${id}` : ""}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-list"><ArrowLeft className="size-4" aria-hidden />Sản phẩm / dịch vụ{back ? " (giữ bộ lọc)" : ""}</Link>
      <PageHeader title={<span className="flex items-center gap-3"><ProductThumb id={(p.image_file_id as string) ?? null} name={p.name} size={52} />{p.name}</span>} eyebrow={String(p.code ?? "Chưa có mã")}
        actions={<Badge className={p.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{p.is_active ? "Đang kinh doanh" : "Ngừng kinh doanh"}</Badge>} />
      <Tabs items={TABS} current={tab} hrefOf={(k) => `/san-pham/${id}?tab=${k}${back ? `&tu=${encodeURIComponent(back)}` : ""}`} />

      {tab === "tong-quan" ? (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <Card><CardHeader><CardTitle>Thông tin chính</CardTitle></CardHeader><CardContent>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Mã</dt><dd>{String(p.code ?? "—")}</dd><dt className="text-muted-foreground">Danh mục</dt><dd>{category ?? "—"}</dd><dt className="text-muted-foreground">Đơn vị tính</dt><dd>{unit ?? "—"}</dd>
                <dt className="text-muted-foreground">Bảng giá mặc định</dt><dd>{defBook?.name ?? "Chưa chọn"}</dd><dt className="text-muted-foreground">Mô tả</dt><dd className="whitespace-pre-line">{String(p.description ?? "—")}</dd>
              </dl>
              {issue ? <Alert tone="warning" className="mt-4" data-testid="price-issue">{ISSUE_LABEL[issue]}. {canWrite ? ISSUE_ACTION[issue] + " ở khung bên dưới hoặc trong “Điều hành giá”." : ""}</Alert> : null}
            </CardContent></Card>
            {canWrite ? (
              <>
                <Disclosure summary="Chọn / đổi bảng giá mặc định">
                  <RpcForm rpc="set_product_default_book" fixed={{ p_product: id }} submitLabel="Lưu bảng mặc định" revalidate={rev} columns={1}
                    fields={[{ name: "p_book", label: "Bảng giá mặc định", type: "select", as: "uuid", options: L.books.filter((b) => b.is_active).map((b) => [b.id, b.name]), defaultValue: (p.default_price_book_id as string) ?? "" }]} />
                </Disclosure>
                <Disclosure summary="Sửa thông tin / chuyển trạng thái">
                  <RpcForm rpc="save_product" fixed={{ p_id: id }} submitLabel="Lưu sản phẩm" revalidate={rev} columns={2}
                    fields={[
                      { name: "p_name", label: "Tên *", required: true, defaultValue: p.name, wide: true }, { name: "p_code", label: "Mã", defaultValue: (p.code as string) ?? "" },
                      { name: "p_category", label: "Danh mục", type: "select", as: "uuid", options: L.categories.filter((c) => c.is_active || c.id === p.category_id).map((c) => [c.id, c.name]), defaultValue: (p.category_id as string) ?? "" },
                      { name: "p_unit", label: "Đơn vị tính", type: "select", as: "uuid", options: L.units.filter((c) => c.is_active || c.id === p.unit_id).map((c) => [c.id, c.name]), defaultValue: (p.unit_id as string) ?? "" },
                      { name: "p_default_book", label: "Bảng giá mặc định", type: "select", as: "uuid", options: L.books.filter((b) => b.is_active || b.id === p.default_price_book_id).map((b) => [b.id, b.name]), defaultValue: (p.default_price_book_id as string) ?? "" },
                      { name: "p_active", label: "Tình trạng", type: "checkbox", placeholder: "Đang kinh doanh", defaultValue: !!p.is_active, hint: "Ngừng kinh doanh vẫn tra cứu được trên báo giá, hợp đồng cũ" }, { name: "p_description", label: "Mô tả", type: "textarea", defaultValue: (p.description as string) ?? "" },
                    ]} />
                </Disclosure>
              </>
            ) : null}
          </div>
          <PriceEstimator productId={id} books={active.map((r) => ({ id: r.book_id, name: r.book_name }))} defaultBookId={p.default_price_book_id as string | null} canAdd={canWrite && !!p.is_active} />
        </div>
      ) : null}

      {tab === "bang-gia" ? (
        <div className="flex flex-col gap-5">
          <Card><CardHeader><CardTitle>So sánh giá{cmp.unit ? ` (₫ / ${cmp.unit})` : ""}</CardTitle>
            <p className="text-sm text-muted-foreground">Cùng sản phẩm, cùng đơn vị. Giá tham chiếu = giá ở bảng mặc định{cmp.reference !== null ? `: ${money(cmp.reference)}` : ""}.</p></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {cmp.pct_unavailable_reason ? <Alert tone="info" data-testid="pct-reason">{cmp.pct_unavailable_reason}.</Alert> : null}
              {cmp.rows.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có bảng giá nào chứa sản phẩm này.</p> : (
                <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[720px] text-sm" data-testid="price-compare">
                  <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-3.5 py-2.5">Bảng giá</th><th className="px-3.5 py-2.5 text-right">Đơn giá</th><th className="px-3.5 py-2.5 text-right">% phí</th><th className="px-3.5 py-2.5 text-right">% thuế</th><th className="px-3.5 py-2.5 text-right">Chênh lệch (₫)</th><th className="px-3.5 py-2.5 text-right">Chênh lệch (%)</th><th className="px-3.5 py-2.5">Hiệu lực từ</th></tr></thead>
                  <tbody className="divide-y">{cmp.rows.map((r) => (
                    <tr key={r.book_id}><td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/bang-gia/${r.book_id}`}>{r.book_name}</Link>{r.is_default ? <Badge className="ml-2 bg-primary-soft text-primary ring-primary/30">Tham chiếu</Badge> : null}{!r.is_active ? <span className="ml-2 text-xs text-muted-foreground">ngừng</span> : null}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums">{money(r.unit_price)}</td><td className="px-3.5 py-2.5 text-right tabular-nums">{r.fee_percent}%</td><td className="px-3.5 py-2.5 text-right tabular-nums">{r.tax_percent}%</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums">{r.is_default ? "—" : r.diff === null ? "—" : `${r.diff >= 0 ? "+" : "−"}${money(Math.abs(r.diff))}`}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums">{r.is_default ? "—" : r.diff_pct === null ? <span className="text-xs text-muted-foreground" title={cmp.pct_unavailable_reason ?? ""}>Không tính được</span> : `${r.diff_pct >= 0 ? "+" : "−"}${Math.abs(r.diff_pct)}%`}</td>
                      <td className="px-3.5 py-2.5">{r.effective_from ? formatDate(r.effective_from) : "—"}</td></tr>))}</tbody>
                </table></div>)}
            </CardContent></Card>
          <Card><CardHeader><CardTitle>Lịch sử phiên bản giá</CardTitle><p className="text-sm text-muted-foreground">Mỗi dòng là một phiên bản bắt đầu hiệu lực vào một ngày; tại mỗi thời điểm chỉ có một phiên bản hiệu lực.</p></CardHeader><CardContent>
            <ul className="divide-y text-sm" data-testid="price-history">{(hist.data ?? []).map((h) => (
              <li key={String(h.id)} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{bookName.get(String(h.price_book_id)) ?? "Bảng giá"} · từ {formatDate(String(h.effective_from))}{h.request_id ? <Link className="ml-2 text-primary hover:underline" href={`/bang-gia/de-nghi/${h.request_id}`}>đề nghị</Link> : null}</span><span className="tabular-nums">{money(h.unit_price as number)} · phí {String(h.fee_percent)}% · thuế {String(h.tax_percent)}%</span></li>))}
              {(hist.data ?? []).length === 0 ? <li className="py-2 text-muted-foreground">Chưa có lịch sử giá.</li> : null}</ul>
          </CardContent></Card>
        </div>
      ) : null}

      {tab === "tep" ? (
        <Card><CardHeader><CardTitle>Tệp đính kèm ({files.length})</CardTitle><p className="text-sm text-muted-foreground">Ảnh sản phẩm (PNG / JPG / WebP, tối đa 2 MB) và tài liệu bán hàng (tối đa 5 MB). Tải lỗi không làm mất ảnh hiện tại.</p></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="divide-y rounded-xl border text-sm" data-testid="product-files">{files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"><span className="flex items-center gap-2 font-medium">{f.kind === "image" ? <Badge className="bg-sky-50 text-sky-800 ring-sky-300">Ảnh{p.image_file_id === f.id ? " chính" : ""}</Badge> : <Badge className="bg-muted text-foreground ring-border">Tài liệu</Badge>}{f.name}</span>
                <span className="flex flex-wrap items-center gap-2"><a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/san-pham/tep/${f.id}?xem=1`} target="_blank" rel="noreferrer"><Eye className="size-3.5" aria-hidden />Xem</a><a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/san-pham/tep/${f.id}`}><Download className="size-3.5" aria-hidden />Tải</a>
                  {canWrite && f.kind === "image" && p.image_file_id !== f.id ? <RpcButton rpc="set_product_image" args={{ p_product: id, p_file: f.id }} label="Đặt làm ảnh chính" variant="ghost" revalidate={rev} /> : null}
                  {canWrite ? <RpcButton rpc="delete_product_file" args={{ p_id: f.id }} label="Xóa" variant="ghost" confirm="Xóa tệp này?" revalidate={rev} /> : null}</span></li>))}
              {files.length === 0 ? <li className="px-3.5 py-3 text-muted-foreground">Chưa có tệp nào.</li> : null}</ul>
            {canWrite ? <FileUpload id="pf" action={uploadProductFileAction} hidden={{ product: id }} kinds={[["image", "Ảnh sản phẩm"], ["document", "Tài liệu bán hàng"]]} label="Chọn tệp" /> : null}
          </CardContent></Card>
      ) : null}
    </div>
  );
}
