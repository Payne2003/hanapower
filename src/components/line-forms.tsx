"use client";
import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addOpportunityLine, addPriceBookLine, deleteLine } from "@/app/(app)/_actions/entity";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";

export function DeleteLineButton({ table, id, path }: { table: "opportunity_products" | "price_book_products"; id: string; path: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa dòng" disabled={pending} onClick={() => start(async () => { const r = await deleteLine(table, id, path); if (!r.ok) setErr(r.error); })}>
        <Trash2 className="text-destructive" aria-hidden />
      </Button>
      {err ? <span role="alert" className="text-xs text-destructive">{err}</span> : null}
    </span>
  );
}

export function PriceBookLineForm({ priceBookId, products }: { priceBookId: string; products: [string, string][] }) {
  const [state, action] = useActionState(addPriceBookLine, null);
  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-5">
      <input type="hidden" name="price_book_id" value={priceBookId} />
      <Field label="Sản phẩm" htmlFor="pb-product" className="sm:col-span-2">
        <Select id="pb-product" name="product_id" required defaultValue=""><option value="" disabled>Chọn…</option>{products.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </Field>
      <Field label="Đơn giá (₫)" htmlFor="pb-price"><Input id="pb-price" name="unit_price" type="number" min={0} step="any" required /></Field>
      <Field label="Phí %" htmlFor="pb-fee"><Input id="pb-fee" name="fee_percent" type="number" min={0} max={100} step="any" defaultValue={0} /></Field>
      <Field label="Thuế %" htmlFor="pb-tax"><Input id="pb-tax" name="tax_percent" type="number" min={0} max={100} step="any" defaultValue={0} /></Field>
      <div className="sm:col-span-5 flex flex-col gap-2"><FormMessage state={state} /><div><SubmitButton size="sm">Thêm / cập nhật</SubmitButton></div></div>
    </form>
  );
}

export function OpportunityLineForm({ opportunityId, products }: { opportunityId: string; products: [string, string][] }) {
  const [state, action] = useActionState(addOpportunityLine, null);
  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-6">
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <Field label="Sản phẩm" htmlFor="ol-product" className="sm:col-span-2">
        <Select id="ol-product" name="product_id" defaultValue=""><option value="">— Nhập tay —</option>{products.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </Field>
      <Field label="Nội dung (nếu nhập tay)" htmlFor="ol-desc" className="sm:col-span-2"><Input id="ol-desc" name="description" placeholder="Để trống nếu chọn sản phẩm" /></Field>
      <Field label="Số lượng" htmlFor="ol-qty"><Input id="ol-qty" name="quantity" type="number" min={0} step="any" defaultValue={1} required /></Field>
      <Field label="Đơn giá (₫)" htmlFor="ol-price"><Input id="ol-price" name="unit_price" type="number" min={0} step="any" placeholder="Theo bảng giá" /></Field>
      <Field label="Phí %" htmlFor="ol-fee"><Input id="ol-fee" name="fee_percent" type="number" min={0} max={100} step="any" /></Field>
      <Field label="Thuế %" htmlFor="ol-tax"><Input id="ol-tax" name="tax_percent" type="number" min={0} max={100} step="any" /></Field>
      <Field label="Đơn vị" htmlFor="ol-unit"><Input id="ol-unit" name="unit" placeholder="Tự lấy theo sản phẩm" /></Field>
      <div className="sm:col-span-6 flex flex-col gap-2"><FormMessage state={state} /><div><SubmitButton size="sm">Thêm dòng</SubmitButton></div></div>
    </form>
  );
}
