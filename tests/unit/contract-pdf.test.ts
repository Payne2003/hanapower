import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderContractPdf, type ContractPdfData } from "@/lib/contract-pdf";

const data = (over: Partial<ContractPdfData["contract"]> = {}, payments = 2): ContractPdfData => ({
  org: { name: "HANA MEDIA", address: "Quận 7, TP.HCM", phone: "0901 234 567", email: "lienhe@hanamedia.vn", tax_code: "0312345678", bank_info: "Vietcombank – 0011223344" },
  contract: { code: "HD0001", status: "active", created_at: "2026-11-27T02:00:00Z", effective_date: "2026-11-12", expiry_date: "2027-01-26", duration_months: 3, current_value: 60_480_000, customer_signed_date: "2026-11-12", company_signed_date: "2026-11-12", note: "Giao bản dựng đầu tiên trong 10 ngày làm việc.", ...over },
  customer: { name: "Công ty TNHH Nông sản Xanh", tax_code: "0312345678", address: "Quận 7, TP.HCM", representative: "Chị Thu Hà", rep_title: "Giám đốc marketing" },
  company_rep: { name: "Leader Sản xuất", title: "Giám đốc sản xuất" },
  quote_code: "BG0001",
  items: [{ description: "Sản xuất video 3–5 phút", unit: "Video", quantity: 4, unit_price: 12_000_000, tax_percent: 8, amount: 51_840_000 }, { description: "Dựng hậu kỳ video", unit: "Video", quantity: 2, unit_price: 4_000_000, tax_percent: 8, amount: 8_640_000 }],
  payments: Array.from({ length: payments }, (_, i) => ({ name: `Đợt ${i + 1}`, amount: 30_240_000, due_date: "2026-12-12" })),
});

function text(buf: Buffer): string | null {
  try {
    const f = join(mkdtempSync(join(tmpdir(), "pdf-")), "c.pdf");
    writeFileSync(f, buf);
    return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
  } catch { return null; }
}

describe("hợp đồng PDF", () => {
  it("có hai bên, điều khoản, giá trị bằng chữ, tiến độ thanh toán và điều khoản bổ sung; hợp đồng đang hiệu lực không có dấu 'bản nháp'", async () => {
    const buf = await renderContractPdf(data());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const t = text(buf);
    if (t) {
      for (const s of ["HỢP ĐỒNG", "BÊN A", "BÊN B", "Công ty TNHH Nông sản Xanh", "Điều 1. Nội dung công việc", "Điều 11. Điều khoản chung", "Điều khoản bổ sung", "Giao bản dựng đầu tiên",
        "60.480.000 ₫", "Sáu mươi triệu bốn trăm tám mươi nghìn đồng", "Tiến độ thanh toán", "Đợt 2", "báo giá số BG0001", "Đã ký ngày 12/11/2026"]) expect(t, s).toContain(s);
      expect(t).not.toContain("BẢN NHÁP");
    }
  });
  it("hợp đồng nháp có dấu 'BẢN NHÁP'; không có đợt thanh toán / báo giá thì dùng câu thỏa thuận chung", async () => {
    const d = data({ status: "draft", note: null }, 0);
    d.items = []; d.quote_code = null;
    const t = text(await renderContractPdf(d));
    if (t) {
      expect(t).toContain("BẢN NHÁP");
      expect(t).toContain("Tiến độ và hình thức thanh toán do hai bên thỏa thuận");
      expect(t).toContain("Chi tiết hạng mục theo thỏa thuận");
      expect(t).not.toContain("Điều khoản bổ sung");
    }
  });
});
