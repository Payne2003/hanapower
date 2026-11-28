"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { savePriceChangeAction } from "@/app/(app)/bang-gia/actions";
import type { ChangeDetail } from "@/lib/pricing";

/** Người lập sửa đề nghị (nháp / được yêu cầu chỉnh sửa): đổi giá, phí, thuế từng dòng, ngày hiệu lực, lý do rồi gửi lại. */
export function RequestEditor({ d, today }: { d: ChangeDetail; today: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(d.lines.map((l) => ({ id: l.product_id, name: l.name, price: String(l.new_unit_price), fee: String(l.new_fee_percent), tax: String(l.new_tax_percent) })));
  const [effective, setEffective] = useState(d.effective_date < today ? today : d.effective_date);
  const [reason, setReason] = useState(d.reason ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (submit: boolean) => start(async () => {
    const lines = rows.map((r) => ({ product_id: r.id, unit_price: Number(r.price.replace(",", ".")), fee_percent: Number(r.fee.replace(",", ".")), tax_percent: Number(r.tax.replace(",", ".")) }));
    const r = await savePriceChangeAction({ id: d.id, book: d.book_id, reason, effective, lines, submit });
    setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Đã lưu.") : r.error });
    if (r.ok) router.refresh();
  });
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-label="Chỉnh sửa đề nghị" data-testid="request-editor">
      <h3 className="text-[15px] font-semibold">Chỉnh sửa đề nghị</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Sản phẩm</th><th className="py-1.5 text-right">Đơn giá mới (₫)</th><th className="py-1.5 text-right">% phí</th><th className="py-1.5 text-right">% thuế</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="py-1.5 font-medium">{r.name}</td>
            <td className="py-1.5 text-right"><Input aria-label={`Đơn giá mới ${r.name}`} value={r.price} onChange={(e) => set(r.id, { price: e.target.value })} className="ml-auto h-9 w-36 text-right" /></td>
            <td className="py-1.5 text-right"><Input aria-label={`% phí ${r.name}`} value={r.fee} onChange={(e) => set(r.id, { fee: e.target.value })} className="ml-auto h-9 w-20 text-right" /></td>
            <td className="py-1.5 text-right"><Input aria-label={`% thuế ${r.name}`} value={r.tax} onChange={(e) => set(r.id, { tax: e.target.value })} className="ml-auto h-9 w-20 text-right" /></td></tr>))}</tbody></table></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">Ngày hiệu lực<Input type="date" min={today} value={effective} onChange={(e) => setEffective(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">Lý do<Input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      {msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => run(false)}>Lưu nháp</Button><Button type="button" disabled={pending} onClick={() => run(true)} data-testid="resubmit">Gửi lại đề nghị ({rows.length} dòng)</Button></div>
    </section>
  );
}
