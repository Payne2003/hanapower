import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FilePlus2, Search, Settings2 } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { getDocStatus, getDocTypes } from "@/lib/hr-docs";
import { getLookups, getStaffList, parseStaffQuery } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

import { Disclosure } from "@/components/disclosure";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";
import { NoAccess } from "@/components/data-table";
import { Chip, Pager, SELECT, TABLE, THEAD } from "@/components/hr/ui";

export const metadata: Metadata = { title: "Giấy tờ nhân viên" };

type SP = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: [string, string][] = [["", "Mọi tình trạng"], ["incomplete", "Chưa đủ giấy tờ"], ["complete", "Đủ giấy tờ"], ["missing", "Còn tài liệu chưa nộp"], ["review", "Có tài liệu chờ duyệt"], ["rejected", "Có tài liệu cần nộp lại"], ["none", "Chưa giao yêu cầu"]];
const STATE_BADGE: Record<string, [string, string]> = {
  complete: ["Đủ giấy tờ", "bg-emerald-50 text-emerald-800 ring-emerald-300"], incomplete: ["Chưa đủ", "bg-amber-50 text-amber-800 ring-amber-300"], none: ["Chưa giao", "bg-neutral-100 text-neutral-700 ring-neutral-300"],
};

export default async function DocStatusPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  if (hasRole(ctx, "collaborator") || !(can(ctx, "staff.manage") || can(ctx, "users.manage"))) return <NoAccess what="Giấy tờ nhân viên" />;
  const dept = sp.phong && UUID.test(sp.phong) ? sp.phong : undefined;
  const status = STATUSES.some(([k]) => k === sp["tinh-trang"]) && sp["tinh-trang"] ? sp["tinh-trang"] : undefined;
  const q = (sp.q ?? "").slice(0, 80);
  const page = Math.max(1, Math.floor(Number(sp.trang) || 1));
  const size = 20;
  const [res, types, lookups, everyone] = await Promise.all([getDocStatus({ q, dept, status, page, size }), getDocTypes(), getLookups(), getStaffList({ ...parseStaffQuery({}, 500), size: 500 })]);
  const s = res.summary;
  const href = (o: Record<string, string | undefined>) => {
    const m: Record<string, string | undefined> = { q: q || undefined, phong: dept, "tinh-trang": status, ...o };
    const e = Object.entries(m).filter(([, v]) => v);
    return `/nhan-su/giay-to${e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : ""}`;
  };
  const rev = ["/nhan-su/giay-to", "/nhan-su"];
  const activeTypes = types.filter((t) => t.is_active);
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <Link href="/nhan-su" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Nhân viên</Link>
      <PageHeader title="Giấy tờ nhân viên" eyebrow={`${res.total} nhân viên${status || dept || q ? " khớp bộ lọc" : ""}`}
        description="Giao yêu cầu nộp tài liệu theo phòng ban hoặc từng người, theo dõi ai còn thiếu giấy tờ. Hoàn thành = mọi tài liệu bắt buộc đã được duyệt." />

      <section aria-label="Tổng hợp" className="flex flex-wrap gap-2" data-testid="doc-summary">
        <Chip label="Đủ giấy tờ" count={s.complete} href={href({ "tinh-trang": "complete", trang: undefined })} active={status === "complete"} />
        <Chip label="Chưa đủ" count={s.incomplete} href={href({ "tinh-trang": "incomplete", trang: undefined })} active={status === "incomplete"} />
        <Chip label="Chờ duyệt" count={s.review} href={href({ "tinh-trang": "review", trang: undefined })} active={status === "review"} />
        <Chip label="Cần nộp lại" count={s.rejected} href={href({ "tinh-trang": "rejected", trang: undefined })} active={status === "rejected"} />
        <Chip label="Chưa giao yêu cầu" count={s.none} href={href({ "tinh-trang": "none", trang: undefined })} active={status === "none"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Disclosure summary="Giao yêu cầu tài liệu" icon={<FilePlus2 className="size-4" aria-hidden />} defaultOpen={false}>
          <div data-testid="assign-bulk">
            <RpcForm rpc="assign_document_request" submitLabel="Giao yêu cầu" okMessage="Đã giao yêu cầu." revalidate={rev} columns={2} resetOnSuccess
              fields={[
                { name: "p_type", label: "Loại tài liệu", type: "select", as: "uuid", required: true, options: activeTypes.map((t) => [t.id, `${t.name}${t.is_required ? " (bắt buộc)" : ""}`] as [string, string]) },
                { name: "p_dept", label: "Cả phòng ban", type: "select", as: "uuid", options: lookups.departments.filter((d) => d.is_active).map((d) => [d.id, d.name] as [string, string]), hint: "Giao cho mọi thành viên đang làm việc của phòng" },
                { name: "p_due", label: "Hạn nộp", type: "date" },
                { name: "p_note", label: "Ghi chú hướng dẫn", type: "textarea", wide: true },
                { name: "p_users", label: "Hoặc chọn từng người", type: "checks", options: everyone.rows.filter((r) => r.status !== "resigned").map((r) => [r.id, `${r.code} · ${r.name}`] as [string, string]) },
              ]} />
          </div>
        </Disclosure>
        <Disclosure summary="Loại tài liệu (mẫu yêu cầu)" icon={<Settings2 className="size-4" aria-hidden />} defaultOpen={false}>
          <div className="flex flex-col gap-4" data-testid="doc-types">
            {types.map((t) => (
              <details key={t.id} className="rounded-lg border p-3"><summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">{t.name}
                <Badge className={t.is_required ? "bg-red-50 text-red-700 ring-red-200" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{t.is_required ? "Bắt buộc" : "Tùy chọn"}</Badge>
                {!t.is_active ? <Badge className="bg-neutral-100 text-neutral-700 ring-neutral-300">Ngừng dùng</Badge> : null}
                <span className="text-xs font-normal text-muted-foreground">{t.allowed_exts.join(", ")} · ≤ {t.max_mb} MB</span></summary>
                <TypeForm t={t} rev={rev} /></details>
            ))}
            <details className="rounded-lg border border-dashed p-3"><summary className="cursor-pointer text-sm font-medium text-primary">+ Thêm loại tài liệu</summary><TypeForm rev={rev} /></details>
          </div>
        </Disclosure>
      </div>

      <form action="/nhan-su/giay-to" method="get" role="search" aria-label="Lọc giấy tờ" className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mã nhân viên…" aria-label="Tìm theo tên hoặc mã nhân viên" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
        </div>
        <select name="phong" defaultValue={dept ?? ""} aria-label="Lọc theo phòng ban" className={SELECT}><option value="">Mọi phòng ban</option>{lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="tinh-trang" defaultValue={status ?? ""} aria-label="Lọc theo tình trạng hồ sơ" className={SELECT}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Lọc</button>
        {q || dept || status ? <Link href="/nhan-su/giay-to" className="px-2 text-sm text-muted-foreground underline">Xóa lọc</Link> : null}
      </form>

      {res.rows.length === 0 ? <EmptyState title="Không có nhân viên phù hợp" description="Thử đổi bộ lọc." /> : (
        <div className="flex flex-col gap-3">
          <div className={TABLE}>
            <table className="w-full min-w-[720px] text-sm" data-testid="doc-status-table">
              <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Mã NV</th><th className="px-3.5 py-2.5">Họ tên</th><th className="px-3.5 py-2.5">Phòng ban</th><th className="px-3.5 py-2.5">Bắt buộc đã duyệt</th><th className="px-3.5 py-2.5">Chờ duyệt</th><th className="px-3.5 py-2.5">Cần nộp lại</th><th className="px-3.5 py-2.5">Chưa nộp</th><th className="px-3.5 py-2.5">Tình trạng</th></tr></thead>
              <tbody className="divide-y">{res.rows.map((r) => (
                <tr key={r.id} data-staff={r.id} className="hover:bg-muted/30">
                  <td className="px-3.5 py-2.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                  <td className="px-3.5 py-2.5"><Link href={`/nhan-su?xem=chi-tiet&id=${r.id}&muc=tai-lieu`} className="font-medium text-primary hover:underline" data-testid="doc-staff-link">{r.name}</Link></td>
                  <td className="px-3.5 py-2.5 text-muted-foreground">{r.depts.join(", ") || "—"}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{r.approved}/{r.required}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{r.submitted}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{r.rejected}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{r.pending}</td>
                  <td className="px-3.5 py-2.5"><Badge data-state={r.state} className={cn(STATE_BADGE[r.state]?.[1])}>{STATE_BADGE[r.state]?.[0]}</Badge></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Pager total={res.total} page={page} size={size} href={(n) => href({ trang: n > 1 ? String(n) : undefined })} />
        </div>
      )}
    </div>
  );
}

function TypeForm({ t, rev }: { t?: { id: string; name: string; instructions: string | null; is_required: boolean; allowed_exts: string[]; max_mb: number; is_active: boolean }; rev: string[] }) {
  return (
    <RpcForm rpc="save_document_type" fixed={{ p_id: t?.id ?? null }} submitLabel={t ? "Lưu loại tài liệu" : "Thêm loại tài liệu"} okMessage="Đã lưu." revalidate={rev} columns={2} className="mt-3" variant="soft" resetOnSuccess={!t}
      fields={[
        { name: "p_name", label: "Tên tài liệu", required: true, defaultValue: t?.name ?? "", wide: true },
        { name: "p_instructions", label: "Hướng dẫn nộp", type: "textarea", defaultValue: t?.instructions ?? "" },
        { name: "p_exts", label: "Định dạng cho phép", type: "tags", defaultValue: t?.allowed_exts ?? ["pdf", "jpg", "png"], hint: "Cách nhau bằng dấu phẩy, vd. pdf, jpg" },
        { name: "p_max_mb", label: "Dung lượng tối đa (MB)", type: "number", as: "number", min: 1, defaultValue: t?.max_mb ?? 5, hint: "Từ 1 đến 5" },
        { name: "p_required", label: "Bắt buộc", type: "checkbox", placeholder: "Tài liệu bắt buộc", defaultValue: t?.is_required ?? true },
        { name: "p_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang dùng", defaultValue: t?.is_active ?? true },
      ]} />
  );
}

