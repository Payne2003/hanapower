"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { money } from "@/lib/form-spec";
import { savePriceChangeAction, savePriceLinesAction } from "@/app/(app)/bang-gia/actions";
import type { GridLine } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Row = { product_id: string; code: string | null; name: string; unit: string | null; isNew: boolean; deleted: boolean; orig: { price: string; fee: string; tax: string } | null; price: string; fee: string; tax: string };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Cùng quy tắc với app.line_amounts ở CSDL: phí = round(giá × %phí), thuế = round((giá + phí) × %thuế). */
const amounts = (price: number, fee: number, tax: number) => { const a = r2(price); const f = r2((a * fee) / 100); const t = r2(((a + f) * tax) / 100); return { fee: f, tax: t, total: r2(a + f + t) }; };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const toRow = (l: GridLine): Row => ({ product_id: l.product_id, code: l.code, name: l.name, unit: l.unit, isNew: false, deleted: false, orig: { price: String(l.unit_price), fee: String(l.fee_percent), tax: String(l.tax_percent) }, price: String(l.unit_price), fee: String(l.fee_percent), tax: String(l.tax_percent) });

function rowError(r: Row): string | null {
  const p = num(r.price), f = num(r.fee), t = num(r.tax);
  if (Number.isNaN(p) || p < 0) return "Đơn giá phải ≥ 0 (giá 0 là hợp lệ)";
  if (!/^\d+([.,]\d{1,2})?$/.test(r.price.trim())) return "Đơn giá tối đa 2 chữ số thập phân";
  if (Number.isNaN(f) || f < 0 || f > 100) return "% phí từ 0 đến 100";
  if (Number.isNaN(t) || t < 0 || t > 100) return "% thuế từ 0 đến 100";
  return null;
}
const changed = (r: Row) => r.isNew || r.deleted || (r.orig !== null && (num(r.price) !== num(r.orig.price) || num(r.fee) !== num(r.orig.fee) || num(r.tax) !== num(r.orig.tax)));

/**
 * Bảng chỉnh sửa giá trực tiếp. Trường nhập: đơn giá, % phí, % thuế. Trường tính: tiền phí, tiền thuế, giá sau phí / thuế
 * (CSDL chỉ lưu phần trăm nên hai giá trị không thể mâu thuẫn). Bảng cần duyệt: nút chính là "Gửi đề nghị thay đổi".
 */
export function PriceGrid({ bookId, bookName, version, requiresApproval, lines, products, canEdit, today, preAdd }: {
  bookId: string; bookName: string; version: number; requiresApproval: boolean; lines: GridLine[]; products: { id: string; label: string }[]; canEdit: boolean; today: string; preAdd?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => {
    const base = lines.map(toRow);
    const p = preAdd ? products.find((x) => x.id === preAdd) : undefined;
    return p && !base.some((r) => r.product_id === p.id) ? [{ product_id: p.id, code: null, name: p.label, unit: null, isNew: true, deleted: false, orig: null, price: "", fee: "0", tax: "0" }, ...base] : base;
  });
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState(today);
  const [pending, start] = useTransition();
  const [baseVersion] = useState(version);

  const dirty = rows.filter(changed);
  const errors = rows.filter((r) => !r.deleted && rowError(r));
  const inBook = new Set(rows.map((r) => r.product_id));
  const shown = useMemo(() => rows.filter((r) => (!onlyChanged || changed(r)) && (!q || `${r.name} ${r.code ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [rows, onlyChanged, q]);
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.product_id === id ? { ...r, ...patch } : r)));
  const addRow = () => {
    const p = products.find((x) => x.id === add); if (!p || inBook.has(p.id)) return;
    setRows((rs) => [{ product_id: p.id, code: null, name: p.label, unit: null, isNew: true, deleted: false, orig: null, price: "", fee: "0", tax: "0" }, ...rs]); setAdd("");
  };
  const payload = () => rows.filter((r) => !r.deleted && changed(r)).map((r) => ({ product_id: r.product_id, unit_price: num(r.price), fee_percent: num(r.fee), tax_percent: num(r.tax) }));
  const save = () => start(async () => {
    setMsg(null);
    if (requiresApproval) {
      const r = await savePriceChangeAction({ book: bookId, reason, effective, lines: payload(), submit: true });
      if (r.ok) { setMsg({ ok: true, text: r.message ?? "Đã gửi." }); router.push(`/bang-gia/de-nghi/${r.data!.id}`); } else setMsg({ ok: false, text: r.error });
      return;
    }
    const r = await savePriceLinesAction({ book: bookId, baseVersion, lines: payload(), deleted: rows.filter((x) => x.deleted && !x.isNew).map((x) => x.product_id) });
    if (r.ok) { setMsg({ ok: true, text: r.message ?? "Đã lưu." }); router.refresh(); setTimeout(() => window.location.reload(), 600); } else setMsg({ ok: false, text: r.error });
  });
  const n = dirty.length;
  useEffect(() => {
    if (!n) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [n]);
  const label = requiresApproval ? `Gửi đề nghị thay đổi (${n} dòng)` : `Lưu ${n} dòng giá`;

  return (
    <div className="flex flex-col gap-4" data-testid="price-grid">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Tìm trong bảng giá" placeholder="Tìm sản phẩm trong bảng giá…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-72" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="size-4 accent-[var(--primary)]" />Chỉ dòng đã sửa</label>
        {canEdit ? (
          <div className="ml-auto flex items-center gap-2">
            <Select aria-label="Thêm sản phẩm vào bảng giá" value={add} onChange={(e) => setAdd(e.target.value)} className="w-64"><option value="">Thêm sản phẩm…</option>{products.filter((p) => !inBook.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
            <Button type="button" variant="outline" onClick={addRow} disabled={!add}><Plus className="size-4" aria-hidden />Thêm dòng</Button>
          </div>
        ) : null}
      </div>
      {requiresApproval ? <Alert tone="info">Bảng giá này áp dụng quy trình phê duyệt: giá đang có hiệu lực chỉ đổi khi đề nghị được duyệt và tới ngày hiệu lực. Dòng cần xóa không thực hiện qua đề nghị.</Alert> : null}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[980px] text-sm" data-testid="price-grid-table">
          <thead className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3.5 py-2.5">Sản phẩm</th><th className="px-3.5 py-2.5">Đơn vị</th><th className="px-3.5 py-2.5 text-right">Đơn giá (₫)</th><th className="px-3.5 py-2.5 text-right">% phí</th><th className="px-3.5 py-2.5 text-right">Tiền phí</th>
              <th className="px-3.5 py-2.5 text-right">% thuế</th><th className="px-3.5 py-2.5 text-right">Tiền thuế</th><th className="px-3.5 py-2.5 text-right">Giá sau phí / thuế</th><th className="px-3.5 py-2.5">Thay đổi</th><th className="px-3.5 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => {
              const err = r.deleted ? null : rowError(r);
              const a = err ? null : amounts(num(r.price), num(r.fee), num(r.tax));
              const o = r.orig ? amounts(num(r.orig.price), num(r.orig.fee), num(r.orig.tax)) : null;
              const diff = r.orig && !err ? num(r.price) - num(r.orig.price) : null;
              const pct = diff !== null && num(r.orig!.price) > 0 ? r2((diff / num(r.orig!.price)) * 100) : null;
              return (
                <tr key={r.product_id} data-product={r.product_id} className={cn(changed(r) && "bg-amber-50/60", r.deleted && "opacity-50 line-through")}>
                  <td className="px-3.5 py-2"><span className="font-medium">{r.name}</span>{r.code ? <span className="ml-1.5 text-xs text-muted-foreground">{r.code}</span> : null}{r.isNew ? <span className="ml-2 rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">Dòng mới</span> : null}</td>
                  <td className="px-3.5 py-2 text-muted-foreground">{r.unit ?? "—"}</td>
                  <td className="px-3.5 py-2 text-right"><Input aria-label={`Đơn giá ${r.name}`} inputMode="decimal" value={r.price} disabled={!canEdit || r.deleted} onChange={(e) => set(r.product_id, { price: e.target.value })} className={cn("h-9 w-32 text-right tabular-nums", err && "border-destructive")} /></td>
                  <td className="px-3.5 py-2 text-right"><Input aria-label={`% phí ${r.name}`} inputMode="decimal" value={r.fee} disabled={!canEdit || r.deleted} onChange={(e) => set(r.product_id, { fee: e.target.value })} className="h-9 w-20 text-right tabular-nums" /></td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-muted-foreground">{a ? money(a.fee) : "—"}</td>
                  <td className="px-3.5 py-2 text-right"><Input aria-label={`% thuế ${r.name}`} inputMode="decimal" value={r.tax} disabled={!canEdit || r.deleted} onChange={(e) => set(r.product_id, { tax: e.target.value })} className="h-9 w-20 text-right tabular-nums" /></td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-muted-foreground">{a ? money(a.tax) : "—"}</td>
                  <td className="px-3.5 py-2 text-right tabular-nums font-medium">{a ? money(a.total) : "—"}</td>
                  <td className="px-3.5 py-2 text-xs">
                    {err ? <span role="alert" className="text-destructive">{err}</span> : r.deleted ? "Sẽ xóa khỏi bảng giá" : r.orig && changed(r) ? <span>Giá cũ {money(num(r.orig.price))} → {money(num(r.price))}{diff !== null ? ` (${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}${pct !== null ? `, ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%` : ""})` : ""}{o && a ? <span className="block text-muted-foreground">Sau phí / thuế: {money(o.total)} → {money(a.total)}</span> : null}</span> : r.isNew ? "Giá mới" : ""}
                  </td>
                  <td className="px-3.5 py-2 text-right">
                    {canEdit && !requiresApproval ? <Button type="button" variant="ghost" size="icon-sm" aria-label={r.isNew ? `Bỏ dòng ${r.name}` : `Xóa dòng ${r.name}`} onClick={() => (r.isNew ? setRows((rs) => rs.filter((x) => x.product_id !== r.product_id)) : set(r.product_id, { deleted: !r.deleted }))}><Trash2 className="text-destructive" aria-hidden /></Button> : null}
                    {canEdit && r.orig && changed(r) && !r.deleted ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hoàn tác ${r.name}`} onClick={() => set(r.product_id, { price: r.orig!.price, fee: r.orig!.fee, tax: r.orig!.tax })}><RotateCcw aria-hidden /></Button> : null}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 ? <tr><td colSpan={10} className="px-3.5 py-8 text-center text-muted-foreground">{rows.length === 0 ? "Bảng giá chưa có dòng nào. Thêm sản phẩm để bắt đầu." : "Không có dòng khớp bộ lọc."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {requiresApproval && n > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">Ngày hiệu lực<Input type="date" min={today} value={effective} onChange={(e) => setEffective(e.target.value)} data-testid="effective-date" /></label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">Lý do đề nghị<Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: điều chỉnh theo chi phí sản xuất" data-testid="change-reason" /></label>
        </div>
      ) : null}
      {msg ? <Alert tone={msg.ok ? "success" : "error"} role={msg.ok ? "status" : "alert"}>{msg.text}</Alert> : null}
      {canEdit ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-sm" data-testid="dirty-count">{n ? <><strong>{n}</strong> dòng có thay đổi chưa lưu{errors.length ? <span className="text-destructive"> · {errors.length} dòng lỗi</span> : null}</> : "Chưa có thay đổi"}</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" disabled={!n || pending} onClick={() => { setRows(lines.map(toRow)); setMsg(null); }}>Hủy thay đổi</Button>
            <Button type="button" disabled={!n || errors.length > 0 || pending || (requiresApproval && !effective)} onClick={save} data-testid="save-prices">{pending ? "Đang lưu…" : label}</Button>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">Bạn chỉ có quyền xem bảng giá “{bookName}”.</p>}
    </div>
  );
}
