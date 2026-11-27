import "server-only";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// Thành phần dùng chung cho báo giá / hợp đồng PDF: font tiếng Việt nhúng, định dạng, đầu trang, bảng, chữ ký, số trang.
export type Doc = InstanceType<typeof PDFDocument>;
export type OrgInfo = { name: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; tax_code?: string | null; bank_info?: string | null };

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

export const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n))} ₫`;
export const num = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
export const dmy = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

export const GREEN = "#0f6b3f";
export const INK = "#1c2420";
export const MUTED = "#5b6660";
export const LINE = "#d5dbd7";
export const SOFT = "#eef5f0";
const PAD = 5;

export function newDoc(title: string, author: string) {
  const f = loadFonts();
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, font: f.regular as unknown as string, info: { Title: title, Author: author, Producer: "HANA Studio" } });
  doc.registerFont("regular", f.regular);
  doc.registerFont("semi", f.semi);
  doc.registerFont("bold", f.bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  return { doc, done };
}

export const left = (doc: Doc) => doc.page.margins.left;
export const width = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
export const bottom = (doc: Doc) => doc.page.height - 64;

/** Công ty bên trái; tiêu đề tài liệu + dòng thông tin bên phải; đường kẻ xanh. */
export function letterhead(doc: Doc, org: OrgInfo, title: string, meta: string[], badge?: string) {
  const L = left(doc), W = width(doc);
  const top = doc.y;
  doc.font("bold").fontSize(15).fillColor(GREEN).text(org.name.toUpperCase(), L, top, { width: W * 0.58 });
  doc.font("regular").fontSize(8.5).fillColor(MUTED);
  const contact = [org.address, [org.phone && `ĐT: ${org.phone}`, org.email && `Email: ${org.email}`].filter(Boolean).join("  ·  "), [org.website, org.tax_code && `MST: ${org.tax_code}`].filter(Boolean).join("  ·  ")].filter(Boolean) as string[];
  for (const line of contact) doc.text(line, L, doc.y + 1, { width: W * 0.58 });
  const leftEnd = doc.y;
  doc.font("bold").fontSize(22).fillColor(INK).text(title, L + W * 0.55, top, { width: W * 0.45, align: "right" });
  doc.font("regular").fontSize(9).fillColor(MUTED);
  meta.forEach((m, i) => doc.text(m, L + W * 0.55, doc.y + (i === 0 ? 2 : 0), { width: W * 0.45, align: "right" }));
  if (badge) doc.font("bold").fontSize(9).fillColor("#b42318").text(badge, L + W * 0.55, doc.y + 2, { width: W * 0.45, align: "right" });
  doc.y = Math.max(leftEnd, doc.y) + 10;
  doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(1.2).strokeColor(GREEN).stroke();
  doc.y += 12;
}

/** Khung thông tin dạng "Nhãn: giá trị". */
export function infoBox(doc: Doc, pairs: [string, string | null | undefined][]) {
  const L = left(doc), W = width(doc);
  const top = doc.y;
  doc.y = top + 8;
  for (const [k, v] of pairs) {
    if (!v) continue;
    doc.font("semi").fontSize(9).fillColor(INK).text(`${k}: `, L + 10, doc.y + 1, { continued: true, width: W - 20 }).font("regular").fillColor(INK).text(v);
  }
  const h = doc.y - top + 8;
  doc.rect(L, top, W, h).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.y = top + h + 14;
}

export type Col = { k: string; t: string; w: number; a: "left" | "right" | "center"; strong?: boolean };

/** Bảng có tiêu đề lặp lại khi sang trang, dòng xen kẽ màu. */
export function table(doc: Doc, cols: Col[], rows: Record<string, string>[]) {
  const L = left(doc), W = width(doc);
  const header = () => {
    const y = doc.y;
    doc.rect(L, y, W, 22).fill(GREEN);
    let x = L;
    doc.font("semi").fontSize(8.5).fillColor("#ffffff");
    for (const c of cols) { doc.text(c.t, x + PAD, y + 7, { width: c.w - PAD * 2, align: c.a, lineBreak: false }); x += c.w; }
    doc.y = y + 22;
  };
  header();
  rows.forEach((cells, i) => {
    doc.font("regular").fontSize(9);
    const h = Math.max(...cols.map((c) => doc.heightOfString(cells[c.k] ?? "", { width: c.w - PAD * 2, align: c.a }))) + 10;
    if (doc.y + h > bottom(doc)) { doc.addPage(); header(); }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(L, y, W, h).fill(SOFT);
    let x = L;
    for (const c of cols) {
      doc.font(c.strong ? "semi" : "regular").fontSize(9).fillColor(INK).text(cells[c.k] ?? "", x + PAD, y + 5, { width: c.w - PAD * 2, align: c.a });
      x += c.w;
    }
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.4).strokeColor(LINE).stroke();
    doc.y = y + h;
  });
}

/** Khối tổng tiền căn phải: [nhãn, giá trị, nhấn mạnh?]. */
export function totals(doc: Doc, lines: [string, string, boolean?][]) {
  const L = left(doc), W = width(doc);
  if (doc.y + 24 * lines.length + 40 > bottom(doc)) doc.addPage();
  doc.y += 10;
  const tx = L + W - 250;
  for (const [label, value, strong] of lines) {
    if (strong) { doc.moveTo(tx, doc.y).lineTo(L + W, doc.y).lineWidth(0.6).strokeColor(LINE).stroke(); doc.y += 4; }
    const y = doc.y;
    doc.font(strong ? "bold" : "regular").fontSize(strong ? 11 : 9.5).fillColor(strong ? GREEN : INK).text(label, tx, y, { width: 110, lineBreak: false });
    doc.text(value, tx + 110, y, { width: 140, align: "right", lineBreak: false });
    doc.y = y + (strong ? 20 : 16);
  }
}

export function paragraph(doc: Doc, title: string | null, body: string, opts: { minSpace?: number } = {}) {
  const L = left(doc), W = width(doc);
  if (doc.y + (opts.minSpace ?? 50) > bottom(doc)) doc.addPage();
  if (title) doc.font("semi").fontSize(9.5).fillColor(INK).text(title, L, doc.y);
  doc.font("regular").fontSize(9).fillColor(MUTED).text(body, L, doc.y + (title ? 2 : 0), { width: W });
  doc.y += 8;
}

/** Hai ô chữ ký cạnh nhau. */
export function signatures(doc: Doc, sides: { title: string; name?: string | null; note?: string | null }[]) {
  const L = left(doc), W = width(doc);
  if (doc.y + 120 > bottom(doc)) doc.addPage();
  doc.y += 8;
  const sy = doc.y;
  const w = W / sides.length;
  sides.forEach((s, i) => {
    doc.font("semi").fontSize(9.5).fillColor(INK).text(s.title, L + i * w, sy, { width: w, align: "center" });
    doc.font("regular").fontSize(8).fillColor(MUTED).text(s.note ?? "(Ký, ghi rõ họ tên)", L + i * w, sy + 14, { width: w, align: "center" });
    if (s.name) doc.font("semi").fontSize(9.5).fillColor(INK).text(s.name, L + i * w, sy + 84, { width: w, align: "center" });
  });
  doc.y = sy + 104;
}

export function pageNumbers(doc: Doc, prefix: string) {
  const L = left(doc), W = width(doc);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font("regular").fontSize(8).fillColor(MUTED).text(`${prefix} · Trang ${i + 1}/${range.count}`, L, doc.page.height - 36, { width: W, align: "center", lineBreak: false });
  }
}
