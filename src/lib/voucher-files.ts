import "server-only";
import { checkFile } from "@/lib/files";

export const VOUCHER_EXTS = ["pdf", "png", "jpg", "jpeg", "webp", "docx", "xlsx", "pptx", "zip", "txt", "csv"];
export const VOUCHER_MAX_MB = 5;

/** Đọc các tệp hợp lệ trong biểu mẫu (nhiều tệp, mỗi tệp ≤ 5 MB, chữ ký khớp đuôi tệp). */
export async function readFiles(fd: FormData, field = "file"): Promise<{ files: { name: string; mime: string; base64: string }[]; error?: string }> {
  const out: { name: string; mime: string; base64: string }[] = [];
  for (const f of fd.getAll(field)) {
    if (!(f instanceof File) || f.size === 0) continue;
    const bytes = Buffer.from(await f.arrayBuffer());
    const bad = checkFile(f.name, bytes, VOUCHER_EXTS, VOUCHER_MAX_MB);
    if (bad) return { files: [], error: `${f.name}: ${bad}` };
    out.push({ name: f.name, mime: f.type || "application/octet-stream", base64: bytes.toString("base64") });
  }
  return { files: out };
}

/** Kiểu nội dung an toàn để xem trực tiếp trong trình duyệt (chỉ PDF / ảnh); còn lại luôn tải xuống. */
export function inlineMime(name: string): string | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[ext] ?? null;
}
