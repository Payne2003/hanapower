// Đọc "Bảng báo cáo bộ phận content" (Google Sheet → tải .xlsx) và lập kế hoạch nhập.
// Tách 2 phần: parseWorkbook (đọc tệp) và planImport (quy tắc thuần, kiểm thử được).
import type { HandoverStatus, ItemKind, ItemStatus, VideoStage } from "./types";

export type SheetRow = {
  sheet: string;
  rowNo: number;
  report_date: string | null; // YYYY-MM-DD
  code: string;
  title: string;
  content_name: string;
  items: Record<ItemKind, string>;
  resource_url: string;
  content_status: string;
  content_note: string;
  editor_name: string;
  handover: string;
  confirmed_date: string | null;
  editor_note: string;
};

const HEADERS: Record<string, keyof SheetRow | ItemKind> = {
  "ngay bao cao": "report_date",
  "ma du an": "code",
  "ten du an / video": "title",
  "content phu trach": "content_name",
  "nguon that": "real_footage",
  "video ai": "ai_video",
  "kich ban / vo": "script_vo",
  "so do dung": "edit_map",
  "link tai nguyen": "resource_url",
  "trang thai content": "content_status",
  "ghi chu content": "content_note",
  "editor tiep nhan": "editor_name",
  "xac nhan ban giao": "handover",
  "ngay xac nhan": "confirmed_date",
  "ghi chu edit bo sung/ them bot": "editor_note",
};

/** Chuẩn hóa để so khớp: chữ thường, bỏ dấu, gộp khoảng trắng. */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) { // số ngày kiểu Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return toISODate(d);
  }
  return null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; hyperlink?: unknown; richText?: { text: string }[]; result?: unknown };
    if (o.hyperlink) return String(o.hyperlink);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

/** Đọc mọi tab có dòng tiêu đề "Mã dự án". */
export async function parseWorkbook(buf: ArrayBuffer): Promise<{ rows: SheetRow[]; sheets: string[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const rows: SheetRow[] = [];
  const sheets: string[] = [];
  wb.eachSheet((ws) => {
    let headerRow = 0;
    const col: Partial<Record<string, number>> = {};
    ws.eachRow((row, rn) => {
      if (headerRow) return;
      const vals = (row.values as unknown[]).map((v) => norm(cellText(v)));
      if (vals.includes("ma du an")) {
        headerRow = rn;
        vals.forEach((v, i) => { const key = HEADERS[v]; if (key) col[key] = i; });
      }
    });
    if (!headerRow || !col.code) return;
    sheets.push(ws.name);
    ws.eachRow((row, rn) => {
      if (rn <= headerRow) return;
      const get = (k: string) => (col[k] ? row.getCell(col[k]!).value : null);
      const code = cellText(get("code")).toUpperCase();
      const title = cellText(get("title"));
      if (!code && !title) return;
      rows.push({
        sheet: ws.name,
        rowNo: rn,
        report_date: toISODate(get("report_date") instanceof Date ? get("report_date") : cellText(get("report_date"))),
        code,
        title,
        content_name: cellText(get("content_name")),
        items: {
          real_footage: cellText(get("real_footage")),
          ai_video: cellText(get("ai_video")),
          script_vo: cellText(get("script_vo")),
          edit_map: cellText(get("edit_map")),
        },
        resource_url: cellText(get("resource_url")),
        content_status: cellText(get("content_status")),
        content_note: cellText(get("content_note")),
        editor_name: cellText(get("editor_name")),
        handover: cellText(get("handover")),
        confirmed_date: toISODate(get("confirmed_date") instanceof Date ? get("confirmed_date") : cellText(get("confirmed_date"))),
        editor_note: cellText(get("editor_note")),
      });
    });
  });
  return { rows, sheets };
}

export type Person = { id: string; full_name: string; roles: string[] };

export type PlannedVideo = {
  code: string;
  title: string;
  report_date: string;
  stage: VideoStage;
  content_owner_id: string | null;
  editor_id: string | null;
  resource_url: string | null;
  content_note: string | null;
  handover_status: HandoverStatus | null;
  handover_confirmed_at: string | null;
  editor_note: string | null;
  supplement_count: number;
  items: Record<ItemKind, ItemStatus>;
  source: string;
};

export type PlanLine = {
  sheet: string;
  rowNo: number;
  code: string;
  title: string;
  content_name: string;
  editor_name: string;
  status: "new" | "exists" | "error";
  warnings: string[];
  video?: PlannedVideo;
};

function itemStatus(s: string): ItemStatus {
  const n = norm(s);
  if (n.startsWith("hoan thanh")) return "done";
  if (n.startsWith("dang lam")) return "doing";
  return "todo";
}

/** Tìm người theo tên trong bảng (vd. "Hiếu") khớp họ tên đầy đủ hoặc tên gọi (từ cuối). */
export function matchPerson(name: string, people: Person[], role: "content" | "editor"): Person | null {
  const n = norm(name);
  if (!n) return null;
  const pool = people.filter((p) => p.roles.includes(role));
  const exact = (f: (p: Person) => string) => {
    const hits = pool.filter((p) => f(p) === n);
    return hits.length === 1 ? hits[0]! : null;
  };
  const lower = name.trim().toLowerCase().normalize("NFC");
  const withAccents = pool.filter((p) => p.full_name.toLowerCase().normalize("NFC") === lower || p.full_name.toLowerCase().normalize("NFC").split(/\s+/).pop() === lower);
  if (withAccents.length === 1) return withAccents[0]!;
  return exact((p) => norm(p.full_name)) ?? exact((p) => norm(p.full_name).split(" ").pop() ?? "");
}

export function planImport(rows: SheetRow[], people: Person[], existingCodes: Set<string>, today: string): PlanLine[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const warnings: string[] = [];
    const base = { sheet: r.sheet, rowNo: r.rowNo, code: r.code, title: r.title, content_name: r.content_name, editor_name: r.editor_name };
    if (!/^D\d{1,6}$/i.test(r.code)) return { ...base, status: "error" as const, warnings: ["Mã dự án phải có dạng D0001"] };
    if (!r.title) return { ...base, status: "error" as const, warnings: ["Thiếu tên video"] };
    if (seen.has(r.code)) return { ...base, status: "error" as const, warnings: ["Mã bị trùng trong tệp (chỉ nhập dòng đầu)"] };
    seen.add(r.code);
    if (existingCodes.has(r.code)) return { ...base, status: "exists" as const, warnings: ["Đã có trong hệ thống — bỏ qua"] };

    const owner = matchPerson(r.content_name, people, "content");
    const editor = matchPerson(r.editor_name, people, "editor");
    if (r.content_name && !owner) warnings.push(`Không tìm thấy Content "${r.content_name}" (cần tạo tài khoản vai trò Content) — để trống người phụ trách`);
    if (r.editor_name && !editor) warnings.push(`Không tìm thấy Editor "${r.editor_name}" (cần tạo tài khoản vai trò Editor) — để trống Editor`);

    let url = r.resource_url.trim();
    if (url && !/^https?:\/\//i.test(url)) { warnings.push("Link tài nguyên không hợp lệ — bỏ qua link"); url = ""; }

    const items = {
      real_footage: itemStatus(r.items.real_footage),
      ai_video: itemStatus(r.items.ai_video),
      script_vo: itemStatus(r.items.script_vo),
      edit_map: itemStatus(r.items.edit_map),
    };
    const h = norm(r.handover);
    const cs = norm(r.content_status);
    let stage: VideoStage;
    let handover: HandoverStatus | null = null;
    let supplement = 0;
    if (h.startsWith("da nhan du")) {
      if (editor) { stage = "editing"; handover = "received"; }
      else { stage = "preparing"; warnings.push("Đã nhận đủ nhưng chưa xác định được Editor — để ở Đang chuẩn bị"); }
    } else if (h.startsWith("yeu cau bo sung")) {
      stage = "preparing"; handover = "needs_more"; supplement = 1;
    } else if ((cs.startsWith("cho ban giao") || cs.startsWith("da ban giao")) && editor) {
      stage = "handover"; handover = "pending";
    } else {
      stage = Object.values(items).every((s) => s === "todo") && !url ? "idea" : "preparing";
    }
    if (cs.startsWith("da ban giao") && handover === "pending") warnings.push("Bảng ghi Đã bàn giao nhưng Editor chưa xác nhận — để ở Chờ bàn giao");

    return {
      ...base,
      status: "new" as const,
      warnings,
      video: {
        code: r.code.toUpperCase(),
        title: r.title,
        report_date: r.report_date ?? today,
        stage,
        content_owner_id: owner?.id ?? null,
        editor_id: editor?.id ?? null,
        resource_url: url || null,
        content_note: r.content_note || null,
        handover_status: handover,
        handover_confirmed_at: handover === "received" || handover === "needs_more" ? r.confirmed_date ?? r.report_date ?? today : null,
        editor_note: r.editor_note || null,
        supplement_count: supplement,
        items,
        source: `${r.sheet}, dòng ${r.rowNo}`,
      },
    };
  });
}
