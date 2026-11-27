import "server-only";
import { vndInWords } from "@/lib/vn-words";
import { dmy, infoBox, letterhead, MUTED, newDoc, num, pageNumbers, paragraph, signatures, table, totals, vnd, left, width, type Col, type OrgInfo } from "@/lib/pdf-common";

export type QuotePdfData = {
  org: OrgInfo;
  quote: { code: string; version: number; created_at: string; expiry_date?: string | null; subtotal: number; tax_amount: number; total: number; note?: string | null; recipient_name?: string | null; billing_address?: string | null };
  customer: { name: string; tax_code?: string | null };
  opportunity: string;
  items: { position: number; description: string; unit?: string | null; quantity: number; unit_price: number; fee_percent: number; tax_percent: number; amount: number }[];
  signer?: string | null;
};

const COLS: Col[] = [
  { k: "stt", t: "STT", w: 34, a: "center" }, { k: "desc", t: "Nội dung", w: 152, a: "left" }, { k: "unit", t: "ĐVT", w: 40, a: "center" },
  { k: "qty", t: "SL", w: 34, a: "right" }, { k: "price", t: "Đơn giá", w: 78, a: "right" }, { k: "fee", t: "Phí", w: 36, a: "right" },
  { k: "tax", t: "Thuế", w: 36, a: "right" }, { k: "amt", t: "Thành tiền", w: 101, a: "right", strong: true },
];

/** Báo giá PDF khổ A4, tiếng Việt (font Be Vietnam Pro nhúng trong tệp). */
export function renderQuotePdf(d: QuotePdfData): Promise<Buffer> {
  const { doc, done } = newDoc(`Báo giá ${d.quote.code}`, d.org.name);
  letterhead(doc, d.org, "BÁO GIÁ", [`Số: ${d.quote.code}${d.quote.version > 1 ? ` (phiên bản ${d.quote.version})` : ""}`, `Ngày: ${dmy(d.quote.created_at)}`, `Hiệu lực đến: ${dmy(d.quote.expiry_date)}`]);
  infoBox(doc, [["Kính gửi", d.customer.name], ["Người nhận", d.quote.recipient_name], ["Địa chỉ", d.quote.billing_address], ["Mã số thuế", d.customer.tax_code], ["Nội dung", d.opportunity]]);
  table(doc, COLS, d.items.map((it, i) => ({
    stt: String(i + 1), desc: it.description, unit: it.unit ?? "", qty: num(it.quantity), price: vnd(it.unit_price),
    fee: it.fee_percent ? `${num(it.fee_percent)}%` : "—", tax: it.tax_percent ? `${num(it.tax_percent)}%` : "—", amt: vnd(it.amount),
  })));
  totals(doc, [["Tạm tính", vnd(d.quote.subtotal)], ["Thuế", vnd(d.quote.tax_amount)], ["Tổng cộng", vnd(d.quote.total), true]]);
  doc.font("regular").fontSize(9).fillColor(MUTED).text(`Bằng chữ: ${vndInWords(d.quote.total)}.`, left(doc), doc.y + 4, { width: width(doc) });
  doc.y += 12;
  if (d.quote.note) paragraph(doc, "Ghi chú", d.quote.note);
  paragraph(doc, "Điều khoản", `Báo giá có hiệu lực đến ${dmy(d.quote.expiry_date)}. Giá đã bao gồm thuế như bảng trên. Điều kiện thanh toán và tiến độ thực hiện theo hợp đồng được hai bên thống nhất.`);
  if (d.org.bank_info) paragraph(doc, "Thông tin thanh toán", d.org.bank_info);
  signatures(doc, [{ title: "ĐẠI DIỆN KHÁCH HÀNG" }, { title: "ĐẠI DIỆN CÔNG TY", name: d.signer }]);
  pageNumbers(doc, `${d.org.name} · ${d.quote.code}`);
  doc.end();
  return done;
}
