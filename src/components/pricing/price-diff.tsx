import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/form-spec";
import { Alert } from "@/components/ui/alert";
import { RpcButton } from "@/components/rpc-button";

type Line = { line_id: string; description: string; quantity: number; old_unit_price: number; new_unit_price: number | null; old_total: number; new_total: number; diff: number | null; changed: boolean; missing?: boolean };
const sign = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

/**
 * Đối chiếu giá của cơ hội / báo giá nháp với giá đang hiệu lực: chỉ hiển thị khi có chênh lệch; người dùng xem rồi xác nhận mới cập nhật.
 * Báo giá đã gửi không hiển thị (giữ nguyên giá đã chào).
 */
export async function PriceDiffPanel({ kind, id, canWrite, revalidate }: { kind: "opportunity" | "quote"; id: string; canWrite: boolean; revalidate: string[] }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc(kind === "opportunity" ? "opportunity_price_diff" : "quote_price_diff", kind === "opportunity" ? { p_opp: id } : { p_quote: id });
  const d = data as { editable?: boolean; lines: Line[] } | null;
  if (!d || (kind === "quote" && !d.editable)) return null;
  const changed = d.lines.filter((l) => l.changed);
  const missing = d.lines.filter((l) => l.missing);
  if (!changed.length && !missing.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50/50 p-4" aria-label="Chênh lệch giá" data-testid="price-diff">
      <h3 className="text-sm font-semibold">Giá trong bảng giá đã thay đổi so với giá đang dùng</h3>
      {changed.length ? (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Dòng</th><th className="py-1 text-right">Đơn giá đang dùng</th><th className="py-1 text-right">Giá hiện hành</th><th className="py-1 text-right">Thành tiền: cũ → mới</th><th className="py-1 text-right">Chênh lệch</th></tr></thead>
          <tbody>{changed.map((l) => <tr key={l.line_id}><td className="py-1">{l.description}</td><td className="py-1 text-right tabular-nums">{money(l.old_unit_price)}</td><td className="py-1 text-right tabular-nums">{money(l.new_unit_price)}</td><td className="py-1 text-right tabular-nums">{money(l.old_total)} → {money(l.new_total)}</td><td className="py-1 text-right tabular-nums font-medium">{l.diff === null ? "—" : sign(l.diff)}</td></tr>)}</tbody></table></div>
      ) : null}
      {missing.length ? <Alert tone="warning">{missing.length} dòng chưa có giá trong bảng giá của cơ hội: {missing.map((m) => m.description).join(", ")}. Bổ sung dòng giá trong bảng giá.</Alert> : null}
      {canWrite && changed.length ? (
        <div><RpcButton rpc={kind === "opportunity" ? "refresh_opportunity_prices" : "refresh_quote_prices"} args={kind === "opportunity" ? { p_opp: id, p_lines: changed.map((c) => c.line_id) } : { p_quote: id }}
          label={`Cập nhật ${changed.length} dòng theo giá hiện hành`} variant="default" confirm={`Cập nhật ${changed.length} dòng (tổng ${sign(changed.reduce((s, l) => s + (l.diff ?? 0), 0))})?`} revalidate={revalidate} /></div>
      ) : null}
    </section>
  );
}
