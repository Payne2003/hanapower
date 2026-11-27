import "server-only";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { vndInWords } from "@/lib/vn-words";

export type QuotePdfData = {
  org: { name: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; tax_code?: string | null; bank_info?: string | null };
  quote: { code: string; version: number; created_at: string; expiry_date?: string | null; subtotal: number; tax_amount: number; total: number; note?: string | null; recipient_name?: string | null; billing_address?: string | null };
  customer: { name: string; tax_code?: string | null };
  opportunity: string;
  items: { position: number; description: string; unit?: string | null; quantity: number; unit_price: number; fee_percent: number; tax_percent: number; amount: number }[];
  signer?: string | null;
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fonts: { regular: Buffer; semi: Buffer; bold: Buffer } | null = null;
function loadFonts() {
  fonts ??= {
    regular: fs.readFileSync(path.join(FONT_DIR, "BeVietnamPro_400Regular.ttf")),
    semi: fs.readFileSync(path.join(FONT_DIR, "BeVietnamPro_600SemiBold.ttf")),
    bold: fs.readFileSync(path.join(FONT_DIR, "BeVietnamPro_700Bold.ttf")),
  };
  return fonts;
}

const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n))} ₫`;
const num = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
const dmy = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

const GREEN = "#0f6b3f";
const INK = "#1c2420";
const MUTED = "#5b6660";
const LINE = "#d5dbd7";
const SOFT = "#eef5f0";

/** Báo giá PDF khổ A4, tiếng Việt (font Be Vietnam Pro nhúng trong tệp). */
export function renderQuotePdf(d: QuotePdfData): Promise<Buffer> {
  const f = loadFonts();
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, font: f.regular as unknown as string, info: { Title: `Báo giá ${d.quote.code}`, Author: d.org.name, Producer: "HANA Studio" } });
  doc.registerFont("regular", f.regular);
  doc.registerFont("semi", f.semi);
  doc.registerFont("bold", f.bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - 64;

  // --- Đầu trang: công ty bên trái, tiêu đề báo giá bên phải
  const headTop = doc.y;
  doc.font("bold").fontSize(15).fillColor(GREEN).text(d.org.name.toUpperCase(), L, headTop, { width: W * 0.58 });
  doc.font("regular").fontSize(8.5).fillColor(MUTED);
  const contact = [d.org.address, [d.org.phone && `ĐT: ${d.org.phone}`, d.org.email && `Email: ${d.org.email}`].filter(Boolean).join("  ·  "), [d.org.website, d.org.tax_code && `MST: ${d.org.tax_code}`].filter(Boolean).join("  ·  ")].filter(Boolean) as string[];
  for (const line of contact) doc.text(line, L, doc.y + 1, { width: W * 0.58 });
  const leftEnd = doc.y;
  doc.font("bold").fontSize(22).fillColor(INK).text("BÁO GIÁ", L + W * 0.6, headTop, { width: W * 0.4, align: "right" });
  doc.font("regular").fontSize(9).fillColor(MUTED)
    .text(`Số: ${d.quote.code}${d.quote.version > 1 ? ` (phiên bản ${d.quote.version})` : ""}`, L + W * 0.6, doc.y + 2, { width: W * 0.4, align: "right" })
    .text(`Ngày: ${dmy(d.quote.created_at)}`, { width: W * 0.4, align: "right" })
    .text(`Hiệu lực đến: ${dmy(d.quote.expiry_date)}`, { width: W * 0.4, align: "right" });
  doc.y = Math.max(leftEnd, doc.y) + 10;
  doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(1.2).strokeColor(GREEN).stroke();
  doc.y += 12;

  // --- Khách hàng
  const boxTop = doc.y;
  const kv = (k: string, v?: string | null) => { if (!v) return; doc.font("semi").fontSize(9).fillColor(INK).text(`${k}: `, L + 10, doc.y + 1, { continued: true, width: W - 20 }).font("regular").fillColor(INK).text(v); };
  doc.y = boxTop + 8;
  kv("Kính gửi", d.customer.name);
  kv("Người nhận", d.quote.recipient_name);
  kv("Địa chỉ", d.quote.billing_address);
  kv("Mã số thuế", d.customer.tax_code);
  kv("Nội dung", d.opportunity);
  const boxH = doc.y - boxTop + 8;
  doc.rect(L, boxTop, W, boxH).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.y = boxTop + boxH + 14;

  // --- Bảng hạng mục
  const cols = [
    { k: "stt", t: "STT", w: 34, a: "center" as const }, { k: "desc", t: "Nội dung", w: 152, a: "left" as const }, { k: "unit", t: "ĐVT", w: 40, a: "center" as const },
    { k: "qty", t: "SL", w: 34, a: "right" as const }, { k: "price", t: "Đơn giá", w: 78, a: "right" as const }, { k: "fee", t: "Phí", w: 36, a: "right" as const },
    { k: "tax", t: "Thuế", w: 36, a: "right" as const }, { k: "amt", t: "Thành tiền", w: 101, a: "right" as const },
  ];
  const pad = 5;
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(L, y, W, 22).fill(GREEN);
    let x = L;
    doc.font("semi").fontSize(8.5).fillColor("#ffffff");
    for (const c of cols) { doc.text(c.t, x + pad, y + 7, { width: c.w - pad * 2, align: c.a, lineBreak: false }); x += c.w; }
    doc.y = y + 22;
  };
  drawHeader();
  d.items.forEach((it, i) => {
    const cells: Record<string, string> = {
      stt: String(i + 1), desc: it.description, unit: it.unit ?? "", qty: num(it.quantity), price: vnd(it.unit_price),
      fee: it.fee_percent ? `${num(it.fee_percent)}%` : "—", tax: it.tax_percent ? `${num(it.tax_percent)}%` : "—", amt: vnd(it.amount),
    };
    doc.font("regular").fontSize(9);
    const h = Math.max(...cols.map((c) => doc.heightOfString(cells[c.k]!, { width: c.w - pad * 2, align: c.a }))) + 10;
    if (doc.y + h > bottom()) { doc.addPage(); drawHeader(); }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(L, y, W, h).fill(SOFT);
    let x = L;
    for (const c of cols) {
      doc.font(c.k === "amt" ? "semi" : "regular").fontSize(9).fillColor(INK).text(cells[c.k]!, x + pad, y + 5, { width: c.w - pad * 2, align: c.a });
      x += c.w;
    }
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.4).strokeColor(LINE).stroke();
    doc.y = y + h;
  });

  // --- Tổng cộng
  if (doc.y + 120 > bottom()) doc.addPage();
  doc.y += 10;
  const tx = L + W - 250;
  const total = (label: string, value: string, strong = false) => {
    const y = doc.y;
    doc.font(strong ? "bold" : "regular").fontSize(strong ? 11 : 9.5).fillColor(strong ? GREEN : INK).text(label, tx, y, { width: 110, lineBreak: false });
    doc.text(value, tx + 110, y, { width: 140, align: "right", lineBreak: false });
    doc.y = y + (strong ? 20 : 16);
  };
  total("Tạm tính", vnd(d.quote.subtotal));
  total("Thuế", vnd(d.quote.tax_amount));
  doc.moveTo(tx, doc.y).lineTo(L + W, doc.y).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.y += 4;
  total("Tổng cộng", vnd(d.quote.total), true);
  doc.font("regular").fontSize(9).fillColor(MUTED).text(`Bằng chữ: ${vndInWords(d.quote.total)}.`, L, doc.y + 4, { width: W });

  // --- Điều khoản, ghi chú, thanh toán
  doc.y += 12;
  const block = (title: string, body: string) => {
    if (doc.y + 50 > bottom()) doc.addPage();
    doc.font("semi").fontSize(9.5).fillColor(INK).text(title, L, doc.y);
    doc.font("regular").fontSize(9).fillColor(MUTED).text(body, L, doc.y + 2, { width: W });
    doc.y += 8;
  };
  if (d.quote.note) block("Ghi chú", d.quote.note);
  block("Điều khoản", `Báo giá có hiệu lực đến ${dmy(d.quote.expiry_date)}. Giá đã bao gồm thuế như bảng trên. Điều kiện thanh toán và tiến độ thực hiện theo hợp đồng được hai bên thống nhất.`);
  if (d.org.bank_info) block("Thông tin thanh toán", d.org.bank_info);

  // --- Chữ ký
  if (doc.y + 110 > bottom()) doc.addPage();
  doc.y += 8;
  const sy = doc.y;
  const half = W / 2;
  doc.font("semi").fontSize(9.5).fillColor(INK).text("ĐẠI DIỆN KHÁCH HÀNG", L, sy, { width: half, align: "center" }).text("ĐẠI DIỆN CÔNG TY", L + half, sy, { width: half, align: "center" });
  doc.font("regular").fontSize(8).fillColor(MUTED).text("(Ký, ghi rõ họ tên)", L, sy + 14, { width: half, align: "center" }).text("(Ký, ghi rõ họ tên)", L + half, sy + 14, { width: half, align: "center" });
  if (d.signer) doc.font("semi").fontSize(9.5).fillColor(INK).text(d.signer, L + half, sy + 80, { width: half, align: "center" });

  // --- Số trang
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font("regular").fontSize(8).fillColor(MUTED).text(`${d.org.name} · ${d.quote.code} · Trang ${i + 1}/${range.count}`, L, doc.page.height - 36, { width: W, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}
