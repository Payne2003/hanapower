import "server-only";
import { vndInWords } from "@/lib/vn-words";
import { dmy, infoBox, letterhead, MUTED, newDoc, num, pageNumbers, paragraph, signatures, table, totals, vnd, left, width, type Col, type OrgInfo } from "@/lib/pdf-common";

export type ContractPdfData = {
  org: OrgInfo;
  contract: {
    code: string; status: string; created_at: string; effective_date?: string | null; expiry_date?: string | null; duration_months?: number | null;
    current_value: number; customer_signed_date?: string | null; company_signed_date?: string | null; note?: string | null;
  };
  customer: { name: string; tax_code?: string | null; address?: string | null; representative?: string | null; rep_title?: string | null };
  company_rep?: { name?: string | null; title?: string | null };
  quote_code?: string | null;
  items: { description: string; unit?: string | null; quantity: number; unit_price: number; tax_percent: number; amount: number }[];
  payments: { name: string; amount: number; due_date?: string | null }[];
};

const ITEM_COLS: Col[] = [
  { k: "stt", t: "STT", w: 34, a: "center" }, { k: "desc", t: "Nội dung", w: 172, a: "left" }, { k: "unit", t: "ĐVT", w: 44, a: "center" },
  { k: "qty", t: "SL", w: 36, a: "right" }, { k: "price", t: "Đơn giá", w: 84, a: "right" }, { k: "tax", t: "Thuế", w: 36, a: "right" }, { k: "amt", t: "Thành tiền", w: 105, a: "right", strong: true },
];
const PAY_COLS: Col[] = [
  { k: "stt", t: "Đợt", w: 40, a: "center" }, { k: "name", t: "Nội dung thanh toán", w: 261, a: "left" }, { k: "due", t: "Hạn", w: 80, a: "center" }, { k: "amt", t: "Số tiền", w: 130, a: "right", strong: true },
];

const DRAFT = new Set(["draft", "pending"]);

/**
 * Hợp đồng PDF khổ A4. Các điều khoản chung là MẪU thông dụng cho dịch vụ sản xuất nội dung — cần pháp chế / luật sư rà soát
 * trước khi ký; điều khoản riêng của từng hợp đồng ghi ở mục Ghi chú của hợp đồng (in thành "Điều khoản bổ sung").
 */
export function renderContractPdf(d: ContractPdfData): Promise<Buffer> {
  const c = d.contract;
  const { doc, done } = newDoc(`Hợp đồng ${c.code}`, d.org.name);
  letterhead(doc, d.org, "HỢP ĐỒNG", [`Số: ${c.code}`, `Ngày lập: ${dmy(c.created_at)}`, `Hiệu lực từ: ${dmy(c.effective_date)}`], DRAFT.has(c.status) ? "BẢN NHÁP — CHƯA CÓ HIỆU LỰC" : undefined);

  doc.font("regular").fontSize(9.5).fillColor(MUTED).text("Hợp đồng này được lập giữa hai bên:", left(doc), doc.y, { width: width(doc) });
  doc.y += 8;
  doc.font("bold").fontSize(10).fillColor("#0f6b3f").text("BÊN A (BÊN SỬ DỤNG DỊCH VỤ)", left(doc), doc.y);
  doc.y += 3;
  infoBox(doc, [["Tên đơn vị", d.customer.name], ["Mã số thuế", d.customer.tax_code], ["Địa chỉ", d.customer.address], ["Đại diện", d.customer.representative ? `${d.customer.representative}${d.customer.rep_title ? ` — ${d.customer.rep_title}` : ""}` : null]]);
  doc.font("bold").fontSize(10).fillColor("#0f6b3f").text("BÊN B (BÊN CUNG CẤP DỊCH VỤ)", left(doc), doc.y);
  doc.y += 3;
  infoBox(doc, [["Tên đơn vị", d.org.name], ["Mã số thuế", d.org.tax_code], ["Địa chỉ", d.org.address], ["Điện thoại", d.org.phone], ["Email", d.org.email],
    ["Đại diện", d.company_rep?.name ? `${d.company_rep.name}${d.company_rep.title ? ` — ${d.company_rep.title}` : ""}` : null], ["Tài khoản", d.org.bank_info]]);

  paragraph(doc, "Hai bên thống nhất ký kết hợp đồng với các điều khoản sau:", "", { minSpace: 80 });

  // Điều 1
  paragraph(doc, "Điều 1. Nội dung công việc", d.quote_code ? `Bên B thực hiện các hạng mục dưới đây cho Bên A theo báo giá số ${d.quote_code}:` : "Bên B thực hiện các hạng mục dưới đây cho Bên A:", { minSpace: 100 });
  if (d.items.length) {
    table(doc, ITEM_COLS, d.items.map((it, i) => ({ stt: String(i + 1), desc: it.description, unit: it.unit ?? "", qty: num(it.quantity), price: vnd(it.unit_price), tax: it.tax_percent ? `${num(it.tax_percent)}%` : "—", amt: vnd(it.amount) })));
    doc.y += 6;
  } else {
    paragraph(doc, null, "Chi tiết hạng mục theo thỏa thuận của hai bên.");
  }

  // Điều 2
  paragraph(doc, "Điều 2. Giá trị hợp đồng và thanh toán", `Tổng giá trị hợp đồng: ${vnd(c.current_value)} (bằng chữ: ${vndInWords(c.current_value)}), đã bao gồm thuế như các hạng mục trên.`, { minSpace: 90 });
  if (d.payments.length) {
    paragraph(doc, null, "Tiến độ thanh toán:");
    table(doc, PAY_COLS, d.payments.map((p, i) => ({ stt: String(i + 1), name: p.name, due: dmy(p.due_date), amt: vnd(p.amount) })));
    totals(doc, [["Tổng các đợt", vnd(d.payments.reduce((s, p) => s + p.amount, 0)), true]]);
  } else {
    paragraph(doc, null, "Tiến độ và hình thức thanh toán do hai bên thỏa thuận bằng văn bản. Bên A thanh toán qua chuyển khoản vào tài khoản của Bên B nêu trên.");
  }

  // Điều 3
  const term = c.effective_date || c.expiry_date
    ? `Hợp đồng có hiệu lực từ ${dmy(c.effective_date)}${c.expiry_date ? ` đến hết ngày ${dmy(c.expiry_date)}` : ""}${c.duration_months ? ` (khoảng ${c.duration_months} tháng)` : ""}. Tiến độ chi tiết của từng hạng mục do hai bên thống nhất khi triển khai.`
    : "Thời hạn thực hiện do hai bên thỏa thuận khi triển khai.";
  paragraph(doc, "Điều 3. Thời hạn thực hiện", term);
  paragraph(doc, "Điều 4. Trách nhiệm của Bên B", "Thực hiện công việc đúng nội dung, chất lượng và thời hạn đã thỏa thuận; thông báo kịp thời cho Bên A về mọi khó khăn ảnh hưởng đến tiến độ; chỉnh sửa sản phẩm theo góp ý hợp lý của Bên A trong phạm vi hạng mục đã ký.");
  paragraph(doc, "Điều 5. Trách nhiệm của Bên A", "Cung cấp đầy đủ, kịp thời thông tin, tư liệu và phản hồi cần thiết; thanh toán đúng hạn theo Điều 2; chịu trách nhiệm về tính hợp pháp của tư liệu do Bên A cung cấp.");
  paragraph(doc, "Điều 6. Nghiệm thu", "Bên B bàn giao sản phẩm theo từng hạng mục hoặc từng đợt. Bên A xem xét và xác nhận nghiệm thu hoặc nêu yêu cầu chỉnh sửa bằng văn bản / tin nhắn trong thời hạn hai bên thống nhất. Khoản thanh toán của đợt tương ứng phát sinh khi sản phẩm được nghiệm thu.");
  paragraph(doc, "Điều 7. Quyền sở hữu và sử dụng sản phẩm", "Sau khi Bên A thanh toán đầy đủ, Bên A được quyền sử dụng sản phẩm bàn giao cho mục đích đã thỏa thuận. Bên B được quyền giữ lại bản sao để lưu trữ và giới thiệu năng lực, trừ khi hai bên có thỏa thuận khác. Tư liệu thuộc bản quyền của bên thứ ba (nhạc, hình ảnh…) được sử dụng theo giấy phép tương ứng.");
  paragraph(doc, "Điều 8. Bảo mật", "Hai bên cam kết giữ bí mật thông tin kinh doanh, tài liệu và nội dung hợp đồng, không tiết lộ cho bên thứ ba khi chưa có sự đồng ý bằng văn bản của bên kia, trừ trường hợp pháp luật yêu cầu.");
  paragraph(doc, "Điều 9. Sửa đổi, chấm dứt hợp đồng", "Mọi sửa đổi, bổ sung phải lập bằng văn bản và có chữ ký của hai bên. Mỗi bên có quyền chấm dứt hợp đồng khi bên kia vi phạm nghiêm trọng nghĩa vụ và không khắc phục trong thời hạn hợp lý sau khi được thông báo; các khoản công việc đã thực hiện được thanh toán tương ứng.");
  paragraph(doc, "Điều 10. Giải quyết tranh chấp", "Tranh chấp phát sinh được giải quyết trước hết bằng thương lượng. Nếu không đạt thỏa thuận, các bên đưa ra Tòa án có thẩm quyền theo quy định của pháp luật Việt Nam.");
  paragraph(doc, "Điều 11. Điều khoản chung", "Hợp đồng được lập thành hai (02) bản có giá trị pháp lý như nhau, mỗi bên giữ một (01) bản, có hiệu lực kể từ ngày hai bên ký.");
  if (c.note) paragraph(doc, "Điều khoản bổ sung", c.note);

  signatures(doc, [
    { title: "ĐẠI DIỆN BÊN A", name: d.customer.representative, note: c.customer_signed_date ? `(Đã ký ngày ${dmy(c.customer_signed_date)})` : undefined },
    { title: "ĐẠI DIỆN BÊN B", name: d.company_rep?.name, note: c.company_signed_date ? `(Đã ký ngày ${dmy(c.company_signed_date)})` : undefined },
  ]);
  pageNumbers(doc, `${d.org.name} · ${c.code}`);
  doc.end();
  return done;
}
