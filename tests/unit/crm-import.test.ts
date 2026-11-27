import { describe, expect, it } from "vitest";
import { normPhone, parseCsvText, parseMoney, planCrmImport, splitName, type ImportCtx, type RawRow } from "@/lib/crm-import";

const emptyEx = () => ({ accountNames: new Set<string>(), accountTax: new Set<string>(), contactEmails: new Set<string>(), contactNameAcc: new Set<string>(), leadEmails: new Set<string>(), leadPhones: new Set<string>(), leadNameCompany: new Set<string>() });
const ctx = (over: Partial<ImportCtx> = {}): ImportCtx => ({
  people: [{ id: "p1", full_name: "Leader Sản xuất" }], industries: [["i1", "Du lịch"]], sources: [["s1", "Facebook"]],
  accounts: [{ id: "a1", name: "Công ty TNHH Nông sản Xanh", tax_code: "0312345678" }], existing: emptyEx(), ...over,
});
const row = (n: number, cells: RawRow["cells"]): RawRow => ({ rowNo: n, cells });

describe("chuẩn hóa dữ liệu nhập", () => {
  it("số điện thoại: +84, mất số 0 đầu, ký tự lạ", () => {
    expect(normPhone("+84 901 234 567").value).toBe("0901234567");
    expect(normPhone("901234567").value).toBe("0901234567");
    expect(normPhone("0901.234.567").value).toBe("0901234567");
    expect(normPhone("84901234567").value).toBe("0901234567");
    expect(normPhone("abc").value).toBeNull();
    expect(normPhone("123").value).toBeNull();
  });
  it("số tiền kiểu Việt Nam và quốc tế", () => {
    expect(parseMoney("5.000.000")).toBe(5000000);
    expect(parseMoney("5,000,000")).toBe(5000000);
    expect(parseMoney("1,5")).toBe(1.5);
    expect(parseMoney("12000000 ₫")).toBe(12000000);
    expect(parseMoney("abc")).toBe("bad");
    expect(parseMoney("")).toBeNull();
  });
  it("tách họ tên: tên là từ cuối", () => {
    expect(splitName("Nguyễn Thị Thu Hà")).toEqual({ last_name: "Nguyễn Thị Thu", first_name: "Hà" });
    expect(splitName("Hà")).toEqual({ last_name: "Hà", first_name: "" });
  });
  it("CSV: dấu phân cách ; và ngoặc kép", () => {
    expect(parseCsvText('Tên;Email\r\n"Công ty A; B";a@x.vn\r\n')).toEqual([["Tên", "Email"], ["Công ty A; B", "a@x.vn"]]);
    expect(parseCsvText('a,b\n"x ""y""",2')).toEqual([["a", "b"], ['x "y"', "2"]]);
  });
});

describe("kế hoạch nhập tài khoản", () => {
  it("nhận dòng mới, bỏ trùng với hệ thống và trùng trong tệp, báo lỗi dòng thiếu tên", () => {
    const e = emptyEx(); e.accountNames.add("cong ty tnhh nong san xanh"); e.accountTax.add("0312345678");
    const plan = planCrmImport("accounts", [
      row(2, { name: "Công ty Mới A", tax_code: "0101010101", phones: "901234567; 0987654321", emails: "A@Mới.vn, sai-email", industry: "Du lịch", owner: "Leader Sản xuất", revenue: "5.000.000" }),
      row(3, { name: "CÔNG TY TNHH NÔNG SẢN XANH" }),
      row(4, { name: "Công ty Khác", tax_code: "0312345678" }),
      row(5, { name: "Công ty Mới A" }),
      row(6, { phones: "0901234567" }),
      row(7, { name: "Công ty B", industry: "Không có", owner: "Ai đó", type: "Đối tác", tax_code: "123" }),
    ], ctx({ existing: e }));
    expect(plan.map((l) => l.status)).toEqual(["new", "exists", "exists", "exists", "error", "new"]);
    expect(plan[0]!.row).toMatchObject({ name: "Công ty Mới A", tax_code: "0101010101", industry_id: "i1", owner_id: "p1", annual_revenue: 5000000, phones: ["0901234567", "0987654321"] });
    expect(plan[0]!.warnings.join()).toContain("sai-email");
    expect(plan[5]!.row).toMatchObject({ type: "partner" });
    expect(plan[5]!.warnings.join("|")).toMatch(/Ngành nghề.*chưa có/);
    expect(plan[5]!.warnings.join("|")).toMatch(/người phụ trách/);
    expect(plan[5]!.warnings.join("|")).toMatch(/mã số thuế/i);
  });
});

describe("kế hoạch nhập liên hệ và lead", () => {
  it("liên hệ: gắn công ty có sẵn theo tên (không phân biệt dấu/hoa thường); công ty lạ giữ lại tên để tạo mới", () => {
    const plan = planCrmImport("contacts", [
      row(2, { full_name: "Nguyễn Thu Hà", company: "cong ty tnhh nong san xanh", emails: "ha@x.vn", dob: "15/08/1990" }),
      row(3, { full_name: "Trần Văn Bình", company: "Công ty Chưa Có" }),
      row(4, { last_name: "Lê Thị", name_or_first: "Mai", emails: "ha@x.vn" }),
    ], ctx());
    expect(plan[0]!.row).toMatchObject({ last_name: "Nguyễn Thu", first_name: "Hà", account_id: "a1", date_of_birth: "1990-08-15" });
    expect(plan[1]!.row).toMatchObject({ account_name: "Công ty Chưa Có" });
    expect(plan[1]!.row).not.toHaveProperty("account_id");
    expect(plan[2]).toMatchObject({ status: "exists" }); // trùng email với dòng 2 trong tệp
  });
  it("lead: trùng email hoặc điện thoại với dữ liệu có sẵn; nhận trạng thái / mức độ / nguồn tiếng Việt", () => {
    const e = emptyEx(); e.leadPhones.add("0912000111"); e.contactEmails.add("c@x.vn");
    const plan = planCrmImport("leads", [
      row(2, { full_name: "Trần Minh Quang", phones: "0912 000 111" }),
      row(3, { full_name: "Phạm Lan", emails: "c@x.vn" }),
      row(4, { full_name: "Hoàng Nam", company: "Studio X", status: "Đã liên hệ", rating: "Nóng", source: "facebook" }),
      row(5, { full_name: "Đỗ Hùng", status: "lạ" }),
    ], ctx({ existing: e }));
    expect(plan.map((l) => l.status)).toEqual(["exists", "exists", "new", "new"]);
    expect(plan[2]!.row).toMatchObject({ status: "contacted", rating: "hot", source_id: "s1", company: "Studio X" });
    expect(plan[3]!.warnings.join()).toContain("Trạng thái");
  });
});

describe("đọc tệp", () => {
  it("xlsx: tìm dòng tiêu đề (có dòng tiêu đề phụ phía trên), cột sai thứ tự, số điện thoại dạng số", async () => {
    const { parseCrmFile } = await import("@/lib/crm-import");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Khách");
    ws.addRow(["DANH SÁCH KHÁCH HÀNG 2026"]);
    ws.addRow([]);
    ws.addRow(["Điện thoại", "Tên công ty", "Email", "Cột lạ", "MST"]);
    ws.addRow([901234567, "Công ty Thử", "thu@x.vn", "abc", "0101010101"]);
    ws.addRow([null, null, null, null, null]);
    ws.addRow(["0987654321", "Công ty Hai", "", "", ""]);
    const buf = await wb.xlsx.writeBuffer();
    const p = await parseCrmFile("accounts", "k.xlsx", buf as ArrayBuffer);
    expect(p?.rows).toHaveLength(2);
    expect(p?.unknownHeaders).toEqual(["Cột lạ"]);
    const plan = planCrmImport("accounts", p!.rows, ctx());
    expect(plan[0]!.row).toMatchObject({ name: "Công ty Thử", phones: ["0901234567"], tax_code: "0101010101" });
    expect(plan[1]!.row).toMatchObject({ name: "Công ty Hai", phones: ["0987654321"] });
  });
  it("csv và tệp không có tiêu đề nhận ra được", async () => {
    const { parseCrmFile } = await import("@/lib/crm-import");
    const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    const ok = await parseCrmFile("contacts", "a.csv", enc("Họ và tên,Email\nNguyễn A,a@x.vn\n"));
    expect(ok?.rows[0]?.cells).toMatchObject({ full_name: "Nguyễn A", emails: "a@x.vn" });
    expect(await parseCrmFile("contacts", "b.csv", enc("foo,bar\n1,2\n"))).toBeNull();
  });
});
