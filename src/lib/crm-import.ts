// Nhập khách hàng từ Excel / CSV: đọc tệp → chuẩn hóa → loại trùng → kế hoạch nhập (chưa ghi gì).
// Phần thuần (planCrmImport, chuẩn hóa) kiểm thử được; đọc tệp dùng exceljs.
import { cellText, norm, toISODate } from "./sheet-import";

export type ImportKind = "accounts" | "contacts" | "leads";
export const KIND_BY_SLUG: Record<string, ImportKind> = { "tai-khoan": "accounts", "lien-he": "contacts", lead: "leads" };
export const KIND_LABEL: Record<ImportKind, string> = { accounts: "tài khoản (công ty)", contacts: "liên hệ", leads: "lead" };
export const SLUG_BY_KIND: Record<ImportKind, string> = { accounts: "tai-khoan", contacts: "lien-he", leads: "lead" };

type Field =
  | "name" | "full_name" | "last_name" | "first_name" | "name_or_first" | "salutation" | "company" | "job_title" | "type" | "industry" | "tax_code" | "phones" | "emails" | "websites"
  | "address" | "employees" | "revenue" | "owner" | "note" | "dob" | "status" | "rating" | "source";

// Tên cột (đã bỏ dấu, chữ thường) → trường. Mỗi loại dữ liệu có bộ riêng để tránh nhầm "Tên".
const ALIASES: Record<ImportKind, Record<string, Field>> = {
  accounts: {
    "ten cong ty": "name", "cong ty": "name", "ten khach hang": "name", "khach hang": "name", ten: "name", name: "name", company: "name", account: "name", "ten doanh nghiep": "name", "ten don vi": "name", "doanh nghiep": "name",
    loai: "type", "phan loai": "type", type: "type", "nganh nghe": "industry", nganh: "industry", industry: "industry", "linh vuc": "industry",
    "ma so thue": "tax_code", mst: "tax_code", "tax code": "tax_code", tax_code: "tax_code",
    "dien thoai": "phones", "so dien thoai": "phones", sdt: "phones", phone: "phones", hotline: "phones", tel: "phones",
    email: "emails", "e-mail": "emails", mail: "emails", "thu dien tu": "emails", website: "websites", web: "websites", "trang web": "websites",
    "dia chi": "address", "dia chi xuat hoa don": "address", address: "address", "so nhan vien": "employees", "quy mo": "employees", employees: "employees",
    "doanh thu": "revenue", "doanh thu nam": "revenue", revenue: "revenue", "nguoi phu trach": "owner", "phu trach": "owner", owner: "owner", "nhan vien phu trach": "owner",
    "ghi chu": "note", note: "note", notes: "note",
  },
  contacts: {
    "ho ten": "full_name", "ho va ten": "full_name", "ten lien he": "full_name", "ten nguoi lien he": "full_name", "nguoi lien he": "full_name", "lien he": "full_name", "full name": "full_name", name: "full_name",
    ho: "last_name", "ho dem": "last_name", "ho va ten dem": "last_name", "last name": "last_name", ten: "name_or_first", "first name": "first_name",
    "xung ho": "salutation", "danh xung": "salutation",
    "cong ty": "company", "ten cong ty": "company", "khach hang": "company", "doanh nghiep": "company", company: "company", account: "company", "tai khoan": "company",
    "chuc vu": "job_title", "chuc danh": "job_title", "vi tri": "job_title", "job title": "job_title",
    "dien thoai": "phones", "so dien thoai": "phones", sdt: "phones", phone: "phones", mobile: "phones", email: "emails", "e-mail": "emails", mail: "emails",
    "ngay sinh": "dob", "sinh nhat": "dob", dob: "dob", "nguoi phu trach": "owner", "phu trach": "owner", owner: "owner", "ghi chu": "note", note: "note",
  },
  leads: {
    "ho ten": "full_name", "ho va ten": "full_name", "ten khach": "full_name", "ten lien he": "full_name", "full name": "full_name", name: "full_name",
    ho: "last_name", "ho dem": "last_name", "ho va ten dem": "last_name", "last name": "last_name", ten: "name_or_first", "first name": "first_name",
    "xung ho": "salutation", "danh xung": "salutation", "cong ty": "company", "ten cong ty": "company", "doanh nghiep": "company", company: "company",
    "chuc vu": "job_title", "chuc danh": "job_title", "vi tri": "job_title", "job title": "job_title",
    "trang thai": "status", status: "status", "muc do": "rating", "muc do quan tam": "rating", "danh gia": "rating", rating: "rating",
    nguon: "source", "nguon lead": "source", source: "source", "nganh nghe": "industry", nganh: "industry", industry: "industry",
    "dien thoai": "phones", "so dien thoai": "phones", sdt: "phones", phone: "phones", email: "emails", "e-mail": "emails", mail: "emails", website: "websites", web: "websites",
    "dia chi": "address", address: "address", "so nhan vien": "employees", "doanh thu": "revenue", "nguoi phu trach": "owner", "phu trach": "owner", owner: "owner", "ghi chu": "note", note: "note",
  },
};

export type RawRow = { rowNo: number; cells: Partial<Record<Field, string>> };
export type Parsed = { rows: RawRow[]; sheet: string; unknownHeaders: string[]; recognized: string[] };

const KEY_FIELDS: Record<ImportKind, Field[]> = { accounts: ["name"], contacts: ["full_name", "last_name", "name_or_first"], leads: ["full_name", "last_name", "name_or_first"] };

function scoreHeader(kind: ImportKind, vals: string[]) {
  const map: Record<number, Field> = {};
  vals.forEach((v, i) => { const f = ALIASES[kind][v]; if (f && !Object.values(map).includes(f)) map[i] = f; });
  const fields = Object.values(map);
  const hasKey = KEY_FIELDS[kind].some((k) => fields.includes(k));
  const onlyOneHeader = vals.filter(Boolean).length === 1; // tệp chỉ có một cột tên
  return { map, ok: hasKey && (fields.length >= 2 || onlyOneHeader) };
}

function cellStr(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return toISODate(v) ?? "";
  return cellText(v);
}

/** Đọc bảng tính (hàng đầu tiên trong 10 hàng đầu có ≥2 cột nhận ra được là dòng tiêu đề). */
function rowsFromMatrix(kind: ImportKind, sheet: string, matrix: unknown[][]): Parsed | null {
  for (let h = 0; h < Math.min(matrix.length, 10); h++) {
    const vals = (matrix[h] ?? []).map((v) => norm(cellStr(v)));
    const { map, ok } = scoreHeader(kind, vals);
    if (!ok) continue;
    const rows: RawRow[] = [];
    for (let r = h + 1; r < matrix.length; r++) {
      const cells: Partial<Record<Field, string>> = {};
      let any = false;
      for (const [ci, f] of Object.entries(map)) {
        const s = cellStr((matrix[r] ?? [])[Number(ci)]).trim();
        if (s) { cells[f] = s; any = true; }
      }
      if (any) rows.push({ rowNo: r + 1, cells });
    }
    const raw = (matrix[h] ?? []).map((v) => cellStr(v).trim());
    return { rows, sheet, recognized: Object.keys(map).map((i) => raw[Number(i)] ?? ""), unknownHeaders: raw.filter((t, i) => t && !(i in map)) };
  }
  return null;
}

export function parseCsvText(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}

export async function parseCrmFile(kind: ImportKind, name: string, buf: ArrayBuffer): Promise<Parsed | null> {
  if (/\.csv$/i.test(name)) return rowsFromMatrix(kind, "CSV", parseCsvText(new TextDecoder("utf-8").decode(buf)));
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  for (const ws of wb.worksheets) {
    const matrix: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => { matrix[rn - 1] = (row.values as unknown[]).slice(1); });
    const p = rowsFromMatrix(kind, ws.name, matrix);
    if (p && p.rows.length) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Chuẩn hóa giá trị
// ---------------------------------------------------------------------------------------------
export const splitList = (s: string | undefined): string[] => (s ?? "").split(/[,;\n|]|\s\/\s/).map((x) => x.trim()).filter(Boolean);

export function normPhone(raw: string): { value: string | null; warn?: string } {
  let d = raw.replace(/[\s.\-()]/g, "");
  if (d.startsWith("+84")) d = `0${d.slice(3)}`;
  else if (/^84\d{9,10}$/.test(d)) d = `0${d.slice(2)}`;
  if (!/^\+?\d+$/.test(d)) return { value: null, warn: `Số điện thoại "${raw}" không hợp lệ (bỏ qua)` };
  if (/^[1-9]\d{8}$/.test(d)) d = `0${d}`; // Excel làm mất số 0 đầu của số di động 10 số
  if (d.replace(/\D/g, "").length < 8 || d.replace(/\D/g, "").length > 15) return { value: null, warn: `Số điện thoại "${raw}" không hợp lệ (bỏ qua)` };
  return { value: d };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseMoney(s: string | undefined): number | null | "bad" {
  if (!s) return null;
  let t = s.replace(/[\s₫đvndVND]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "bad";
}

export function splitName(full: string): { last_name: string; first_name: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { last_name: parts[0]!, first_name: "" };
  return { first_name: parts[parts.length - 1]!, last_name: parts.slice(0, -1).join(" ") };
}

const ACCOUNT_TYPES: Record<string, string> = { "khach hang": "customer", customer: "customer", "doi thu": "competitor", competitor: "competitor", "doi tac": "partner", partner: "partner" };
const LEAD_STATUS: Record<string, string> = { moi: "new", new: "new", "da lien he": "contacted", contacted: "contacted", "dang theo": "working", "dang theo doi": "working", working: "working", "dat chuan": "qualified", qualified: "qualified", "nuoi duong": "nurturing", nurturing: "nurturing", "khong dat": "unqualified", unqualified: "unqualified" };
const RATING: Record<string, string> = { nong: "hot", hot: "hot", am: "warm", warm: "warm", lanh: "cold", cold: "cold" };

// ---------------------------------------------------------------------------------------------
// Kế hoạch nhập
// ---------------------------------------------------------------------------------------------
export type ImportCtx = {
  people: { id: string; full_name: string }[];
  industries: [string, string][];
  sources: [string, string][];
  accounts: { id: string; name: string; tax_code: string | null }[];
  existing: {
    accountNames: Set<string>; accountTax: Set<string>;
    contactEmails: Set<string>; contactNameAcc: Set<string>;
    leadEmails: Set<string>; leadPhones: Set<string>; leadNameCompany: Set<string>;
  };
};

export type ImportRow = Record<string, unknown>;
export type PlanLine = { rowNo: number; label: string; status: "new" | "exists" | "error"; warnings: string[]; row: ImportRow | null };

const lookup = (list: [string, string][], v: string | undefined) => (v ? list.find(([, n]) => norm(n) === norm(v))?.[0] ?? null : null);

export function planCrmImport(kind: ImportKind, raw: RawRow[], ctx: ImportCtx): PlanLine[] {
  const seen = new Set<string>();
  const accByName = new Map(ctx.accounts.map((a) => [norm(a.name), a.id]));
  const out: PlanLine[] = [];

  for (const r of raw) {
    const c = r.cells;
    const warnings: string[] = [];
    const row: ImportRow = {};

    // người phụ trách, ngành, nguồn
    if (c.owner) {
      const p = ctx.people.find((x) => norm(x.full_name) === norm(c.owner));
      if (p) row.owner_id = p.id; else warnings.push(`Không tìm thấy người phụ trách "${c.owner}" — sẽ gán cho bạn`);
    }
    if (c.industry) {
      const id = lookup(ctx.industries, c.industry);
      if (id) row.industry_id = id; else warnings.push(`Ngành nghề "${c.industry}" chưa có trong danh mục (bỏ trống)`);
    }
    // liên lạc
    const phones: string[] = [];
    for (const p of splitList(c.phones)) { const n = normPhone(p); if (n.value) { if (!phones.includes(n.value)) phones.push(n.value); } else if (n.warn) warnings.push(n.warn); }
    const emails: string[] = [];
    for (const e of splitList(c.emails)) { const l = e.toLowerCase(); if (EMAIL.test(l)) { if (!emails.includes(l)) emails.push(l); } else warnings.push(`Email "${e}" không hợp lệ (bỏ qua)`); }
    row.phones = phones; row.emails = emails; row.websites = splitList(c.websites);
    const rev = parseMoney(c.revenue); if (rev === "bad") warnings.push(`Doanh thu "${c.revenue}" không đọc được (bỏ qua)`); else if (rev !== null) row.annual_revenue = rev;
    const emp = parseMoney(c.employees); if (emp === "bad" || (emp !== null && !Number.isInteger(emp))) warnings.push(`Số nhân viên "${c.employees}" không đọc được (bỏ qua)`); else if (emp !== null) row.employee_count = emp;
    if (c.note) row.note = c.note;

    let label = "";
    let dupe: string | null = null;

    if (kind === "accounts") {
      if (!c.name) { out.push({ rowNo: r.rowNo, label: "(không có tên)", status: "error", warnings: ["Thiếu tên công ty"], row: null }); continue; }
      label = c.name;
      row.name = c.name;
      const t = (c.tax_code ?? "").replace(/\s/g, "");
      if (t) { if (!/^\d{10}(-\d{3})?$/.test(t)) warnings.push(`Mã số thuế "${t}" không đúng dạng 10 hoặc 13 số`); row.tax_code = t; }
      if (c.type) { const ty = ACCOUNT_TYPES[norm(c.type)]; if (ty) row.type = ty; else warnings.push(`Loại "${c.type}" không nhận ra (dùng Khách hàng)`); }
      if (c.address) row.billing_address = c.address;
      const nk = norm(c.name);
      if (ctx.existing.accountNames.has(nk) || (t && ctx.existing.accountTax.has(t))) dupe = "Đã có trong hệ thống (trùng tên hoặc mã số thuế)";
      else if (seen.has(`n:${nk}`) || (t && seen.has(`t:${t}`))) dupe = "Trùng với một dòng khác trong tệp";
      seen.add(`n:${nk}`); if (t) seen.add(`t:${t}`);
    } else {
      // tách họ tên
      let last = c.last_name ?? "", first = c.first_name ?? "";
      if (c.full_name) ({ last_name: last, first_name: first } = splitName(c.full_name));
      else if (c.name_or_first) { if (last) first = c.name_or_first; else ({ last_name: last, first_name: first } = splitName(c.name_or_first)); }
      if (!last) { out.push({ rowNo: r.rowNo, label: "(không có tên)", status: "error", warnings: ["Thiếu họ tên"], row: null }); continue; }
      label = `${last} ${first}`.trim();
      row.last_name = last; row.first_name = first;
      if (c.salutation) row[kind === "leads" ? "title" : "salutation"] = c.salutation;
      if (c.job_title) row.job_title = c.job_title;

      if (kind === "contacts") {
        if (c.dob) { const d = toISODate(c.dob); if (d) row.date_of_birth = d; else warnings.push(`Ngày sinh "${c.dob}" không đọc được (bỏ qua)`); }
        let accId: string | null = null;
        if (c.company) {
          accId = accByName.get(norm(c.company)) ?? null;
          if (accId) row.account_id = accId; else { row.account_name = c.company; warnings.push(`Chưa có tài khoản "${c.company}" — ${"tạo mới nếu bạn chọn bên dưới, nếu không liên hệ sẽ không gắn công ty"}`); }
        }
        const nk = `${norm(`${first} ${last}`)}|${accId ?? ""}`;
        if (emails.some((e) => ctx.existing.contactEmails.has(e)) || ctx.existing.contactNameAcc.has(nk)) dupe = "Đã có trong hệ thống (trùng email hoặc họ tên + công ty)";
        else if (emails.some((e) => seen.has(`e:${e}`)) || seen.has(`n:${nk}`)) dupe = "Trùng với một dòng khác trong tệp";
        emails.forEach((e) => seen.add(`e:${e}`)); seen.add(`n:${nk}`);
      } else {
        if (c.company) row.company = c.company;
        if (c.status) { const s = LEAD_STATUS[norm(c.status)]; if (s) row.status = s; else warnings.push(`Trạng thái "${c.status}" không nhận ra (dùng Mới)`); }
        if (c.rating) { const s = RATING[norm(c.rating)]; if (s) row.rating = s; else warnings.push(`Mức độ "${c.rating}" không nhận ra (dùng Ấm)`); }
        if (c.source) { const id = lookup(ctx.sources, c.source); if (id) row.source_id = id; else warnings.push(`Nguồn "${c.source}" chưa có trong danh mục (bỏ trống)`); }
        if (c.address) row.address = c.address;
        const nk = `${norm(`${first} ${last}`)}|${norm(c.company ?? "")}`;
        if (emails.some((e) => ctx.existing.leadEmails.has(e) || ctx.existing.contactEmails.has(e)) || phones.some((p) => ctx.existing.leadPhones.has(p)) || ctx.existing.leadNameCompany.has(nk)) dupe = "Đã có trong hệ thống (trùng email, điện thoại hoặc họ tên + công ty)";
        else if (emails.some((e) => seen.has(`e:${e}`)) || phones.some((p) => seen.has(`p:${p}`)) || seen.has(`n:${nk}`)) dupe = "Trùng với một dòng khác trong tệp";
        emails.forEach((e) => seen.add(`e:${e}`)); phones.forEach((p) => seen.add(`p:${p}`)); seen.add(`n:${nk}`);
      }
    }
    out.push(dupe ? { rowNo: r.rowNo, label, status: "exists", warnings: [dupe, ...warnings], row: null } : { rowNo: r.rowNo, label, status: "new", warnings, row });
  }
  return out;
}

export const TEMPLATES: Record<ImportKind, { headers: string[]; sample: string[] }> = {
  accounts: { headers: ["Tên công ty", "Loại", "Ngành nghề", "Mã số thuế", "Điện thoại", "Email", "Website", "Địa chỉ", "Số nhân viên", "Doanh thu năm", "Người phụ trách", "Ghi chú"], sample: ["Công ty TNHH Ví Dụ", "Khách hàng", "Thương mại điện tử", "0312345678", "0901234567", "lienhe@vidu.vn", "https://vidu.vn", "Quận 7, TP.HCM", "50", "5000000000", "Leader Sản xuất", ""] },
  contacts: { headers: ["Họ và tên", "Xưng hô", "Công ty", "Chức danh", "Điện thoại", "Email", "Ngày sinh", "Người phụ trách", "Ghi chú"], sample: ["Nguyễn Thu Hà", "Chị", "Công ty TNHH Ví Dụ", "Giám đốc marketing", "0901234567", "ha@vidu.vn", "15/08/1990", "Leader Sản xuất", ""] },
  leads: { headers: ["Họ và tên", "Xưng hô", "Công ty", "Chức danh", "Trạng thái", "Mức độ", "Nguồn", "Ngành nghề", "Điện thoại", "Email", "Địa chỉ", "Người phụ trách", "Ghi chú"], sample: ["Trần Minh Quang", "Anh", "Studio Ví Dụ", "Giám đốc", "Mới", "Nóng", "Facebook", "Truyền thông / Quảng cáo", "0912000111", "quang@studio.vn", "Đà Nẵng", "Leader Sản xuất", ""] },
};
