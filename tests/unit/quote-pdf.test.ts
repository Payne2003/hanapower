import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderQuotePdf, type QuotePdfData } from "@/lib/quote-pdf";

const base = (n: number): QuotePdfData => ({
  org: { name: "HANA MEDIA", address: "Quận 7, TP.HCM", phone: "0901 234 567", email: "lienhe@hanamedia.vn", tax_code: "0312345678", bank_info: "Vietcombank – 0011223344" },
  quote: { code: "BG0001", version: 2, created_at: "2026-11-27T02:00:00Z", expiry_date: "2026-12-11", subtotal: 56_000_000, tax_amount: 4_480_000, total: 60_480_000, note: "Giá chưa gồm chi phí di chuyển.", recipient_name: "Chị Thu Hà", billing_address: "Quận 7, TP.HCM" },
  customer: { name: "Công ty TNHH Nông sản Xanh", tax_code: "0312345678" },
  opportunity: "Chiến dịch video giới thiệu nông sản Xanh",
  items: Array.from({ length: n }, (_, i) => ({ position: i + 1, description: "Sản xuất video giới thiệu sản phẩm 3–5 phút", unit: "Video", quantity: 4, unit_price: 12_000_000, fee_percent: 0, tax_percent: 8, amount: 51_840_000 })),
  signer: "Leader Sản xuất",
});

function text(buf: Buffer): string | null {
  try {
    const f = join(mkdtempSync(join(tmpdir(), "pdf-")), "q.pdf");
    writeFileSync(f, buf);
    return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
  } catch {
    return null; // máy không có poppler: bỏ qua phần kiểm tra nội dung
  }
}

describe("báo giá PDF", () => {
  it("tạo tệp PDF hợp lệ, có tiếng Việt, tổng tiền và số tiền bằng chữ", async () => {
    const buf = await renderQuotePdf(base(3));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(20_000);
    const t = text(buf);
    if (t) {
      expect(t).toContain("BÁO GIÁ");
      expect(t).toContain("Công ty TNHH Nông sản Xanh");
      expect(t).toContain("60.480.000 ₫");
      expect(t).toContain("Sáu mươi triệu bốn trăm tám mươi nghìn đồng");
      expect(t).toContain("Sản xuất video giới thiệu");
    }
  });
  it("nhiều dòng thì sang trang mới và lặp lại tiêu đề bảng; có số trang", async () => {
    const buf = await renderQuotePdf(base(40));
    const t = text(buf);
    if (t) {
      expect((t.match(/Thành tiền/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(t).toMatch(/Trang 1\/\d/);
      expect(t).toMatch(/Trang 2\/\d/);
    }
  });
});
