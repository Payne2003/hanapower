"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { money } from "@/lib/form-spec";
import { addPricedLineAction, estimateAction, listOpportunitiesAction, type AddResult, type OppOption } from "@/app/(app)/san-pham/actions";
import type { Estimate } from "@/lib/pricing";

/**
 * Ước tính báo giá cho một sản phẩm: chọn bảng giá + số lượng → đơn giá, tạm tính, phí, thuế, tổng (cùng hàm CSDL với dòng cơ hội và báo giá).
 * "Thêm vào cơ hội" chọn cơ hội trong phạm vi quyền; nếu cơ hội dùng bảng giá khác thì hiện chênh lệch và để người dùng chọn cách xử lý.
 */
export function PriceEstimator({ productId, books, defaultBookId, canAdd }: { productId: string; books: { id: string; name: string }[]; defaultBookId?: string | null; canAdd: boolean }) {
  const [book, setBook] = useState(books.find((b) => b.id === defaultBookId)?.id ?? books[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [est, setEst] = useState<Estimate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opps, setOpps] = useState<OppOption[] | null>(null);
  const [opp, setOpp] = useState("");
  const [mismatch, setMismatch] = useState<AddResult | null>(null);
  const [choice, setChoice] = useState("use_opportunity_book");
  const [done, setDone] = useState<{ opp: string; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const n = Number(qty.replace(",", "."));
    if (!book || !(n > 0)) { setEst(null); setErr(n > 0 || qty === "" ? null : "Số lượng phải lớn hơn 0."); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await estimateAction(productId, book, n);
      if (!live) return;
      if (r.ok) { setEst(r.data!); setErr(null); } else { setEst(null); setErr(r.error); }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [productId, book, qty]);

  const openPicker = () => start(async () => { const r = await listOpportunitiesAction(); if (r.ok) { setOpps(r.data!); setOpp(r.data![0]?.id ?? ""); } else setErr(r.error); });
  const add = (mode?: string) => start(async () => {
    setErr(null);
    const r = await addPricedLineAction(opp, productId, book, Number(qty.replace(",", ".")), mode);
    if (!r.ok) { setErr(r.error); return; }
    if (r.data!.status === "mismatch") { setMismatch(r.data!); return; }
    setMismatch(null); setOpps(null);
    setDone({ opp, text: `Đã thêm ${r.data!.estimate?.quantity} × ${r.data!.estimate?.product_name} (${money(r.data!.estimate?.unit_price)}/${r.data!.estimate?.unit ?? "đơn vị"}) vào cơ hội.` });
  });
  const picked = opps?.find((o) => o.id === opp);

  if (!books.length) return <Alert tone="warning">Sản phẩm chưa có dòng giá ở bảng giá nào — bổ sung dòng giá trong “Điều hành giá” hoặc trang Bảng giá trước khi ước tính.</Alert>;
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-label="Ước tính báo giá" data-testid="estimator">
      <h3 className="text-[15px] font-semibold">Ước tính báo giá</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bảng giá" htmlFor="est-book"><Select id="est-book" value={book} onChange={(e) => setBook(e.target.value)}>{books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label={`Số lượng${est?.unit ? ` (${est.unit})` : ""}`} htmlFor="est-qty"><Input id="est-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      </div>
      {err ? <Alert tone="error" role="alert">{err}</Alert> : null}
      {est ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm" data-testid="estimate">
          <dt className="text-muted-foreground">Đơn giá{est.unit ? ` / ${est.unit}` : ""}</dt><dd className="text-right tabular-nums" data-testid="est-unit-price">{money(est.unit_price)}</dd>
          <dt className="text-muted-foreground">Tạm tính (trước phí / thuế)</dt><dd className="text-right tabular-nums font-medium" data-testid="est-subtotal">{money(est.subtotal)}</dd>
          <dt className="text-muted-foreground">Phí ({est.fee_percent}%)</dt><dd className="text-right tabular-nums" data-testid="est-fee">{money(est.fee_amount)}</dd>
          <dt className="text-muted-foreground">Thuế ({est.tax_percent}%)</dt><dd className="text-right tabular-nums" data-testid="est-tax">{money(est.tax_amount)}</dd>
          <dt className="border-t pt-1.5 font-semibold">Tổng</dt><dd className="border-t pt-1.5 text-right text-base font-semibold tabular-nums" data-testid="est-total">{money(est.total)}</dd>
          {est.effective_from ? <><dt className="text-xs text-muted-foreground">Giá có hiệu lực từ</dt><dd className="text-right text-xs text-muted-foreground">{est.effective_from.split("-").reverse().join("/")}</dd></> : null}
        </dl>
      ) : null}
      {done ? <Alert tone="success">{done.text} <Link className="font-medium underline" href={`/co-hoi/${done.opp}`} data-testid="open-opp">Mở cơ hội</Link></Alert> : null}
      {canAdd && est ? (
        !opps ? <div><Button type="button" onClick={openPicker} disabled={pending} data-testid="add-to-opp">Thêm vào cơ hội</Button></div> : (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
            {opps.length === 0 ? <p className="text-sm text-muted-foreground">Không có cơ hội đang mở trong phạm vi của bạn.</p> : (
              <Field label="Chọn cơ hội" htmlFor="est-opp"><Select id="est-opp" value={opp} onChange={(e) => { setOpp(e.target.value); setMismatch(null); }}>
                {opps.map((o) => <option key={o.id} value={o.id}>{o.name}{o.account ? ` · ${o.account}` : ""}{o.price_book_name ? ` · ${o.price_book_name}` : " · chưa có bảng giá"}</option>)}</Select></Field>
            )}
            {mismatch?.status === "mismatch" ? (
              <div className="flex flex-col gap-2 text-sm" data-testid="book-mismatch">
                <Alert tone="warning">Cơ hội “{picked?.name}” đang dùng bảng giá “{picked?.price_book_name}”, khác bảng “{mismatch.selected?.book_name}” bạn đã chọn.{" "}
                  {mismatch.opportunity ? <>Giá ở bảng của cơ hội: <strong>{money(mismatch.opportunity.unit_price)}</strong> → tổng {money(mismatch.opportunity.total)}; bảng đã chọn: <strong>{money(mismatch.selected?.unit_price)}</strong> → tổng {money(mismatch.selected?.total)} (chênh lệch {money(mismatch.diff ?? 0)}).</> : <>Bảng giá của cơ hội chưa có dòng giá cho sản phẩm này.</>}</Alert>
                {([["use_opportunity_book", "Dùng giá theo bảng giá của cơ hội", !mismatch.opportunity], ["use_selected_book", "Dùng giá bảng đã chọn cho riêng dòng này (giữ bảng giá của cơ hội)", false], ["switch_book", "Đổi bảng giá của cơ hội sang bảng đã chọn (các dòng cũ giữ nguyên giá)", false]] as const).map(([v, l, dis]) => (
                  <label key={v} className="flex items-start gap-2"><input type="radio" name="mm" value={v} disabled={dis} checked={choice === v} onChange={() => setChoice(v)} className="mt-1 accent-[var(--primary)]" />{l}</label>
                ))}
                <div><Button type="button" onClick={() => add(choice)} disabled={pending}>Xác nhận thêm</Button></div>
              </div>
            ) : (
              <div className="flex gap-2"><Button type="button" onClick={() => add()} disabled={pending || !opp}>Thêm vào cơ hội đã chọn</Button><Button type="button" variant="ghost" onClick={() => { setOpps(null); setMismatch(null); }}>Đóng</Button></div>
            )}
          </div>
        )
      ) : null}
    </section>
  );
}
