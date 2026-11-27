// Mô tả trường biểu mẫu dùng chung cho giao diện (client) và các server action chung.
export type UiType = "text" | "textarea" | "number" | "date" | "datetime" | "select" | "checkbox" | "checks" | "tags" | "url" | "email" | "tel";
export type ArgKind = "text" | "number" | "date" | "datetime" | "bool" | "uuid" | "uuids" | "tags";

export type FormField = {
  name: string;
  label: string;
  type?: UiType;
  /** Kiểu của tham số RPC (mặc định suy từ `type`). Select chọn bản ghi dùng "uuid". */
  as?: ArgKind;
  options?: [value: string, label: string][];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string | number | boolean | string[] | null;
  wide?: boolean;
  min?: number;
  step?: string;
};

export function argKind(f: FormField): ArgKind {
  if (f.as) return f.as;
  switch (f.type) {
    case "number": return "number";
    case "date": return "date";
    case "datetime": return "datetime";
    case "checkbox": return "bool";
    case "checks": return "uuids";
    case "tags": return "tags";
    default: return "text";
  }
}

/** Tiền VND: 1234567 -> "1.234.567 ₫". */
export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(v)} ₫`;
}
