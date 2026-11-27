// Kiểm tra tệp tải lên ở máy chủ: chữ ký (magic bytes) khớp phần mở rộng, không chỉ tin vào tên tệp hay mime do trình duyệt gửi.
export type Sniff = "png" | "jpg" | "webp" | "pdf" | "zip" | "exe" | "unknown";

export function sniff(b: Buffer): Sniff {
  const h = (n: number[]) => n.every((v, i) => b[i] === v);
  if (h([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (h([0xff, 0xd8, 0xff])) return "jpg";
  if (h([0x52, 0x49, 0x46, 0x46]) && b.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (h([0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (h([0x4d, 0x5a]) || h([0x7f, 0x45, 0x4c, 0x46]) || h([0x23, 0x21])) return "exe"; // PE / ELF / script
  return "unknown";
}

const KIND_OF_EXT: Record<string, Sniff> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", pdf: "pdf", docx: "zip", xlsx: "zip", pptx: "zip", zip: "zip" };

/** Trả về thông báo lỗi tiếng Việt nếu tệp không hợp lệ; null nếu đạt. */
export function checkFile(name: string, bytes: Buffer, allowedExts: string[], maxMb: number): string | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (!name.includes(".") || !ext) return "Tên tệp cần có phần mở rộng (vd. .pdf).";
  if (!allowedExts.includes(ext)) return `Chỉ nhận định dạng: ${allowedExts.join(", ")}.`;
  if (bytes.length === 0) return "Tệp rỗng.";
  if (bytes.length > maxMb * 1048576) return `Tệp vượt quá ${maxMb} MB.`;
  const kind = sniff(bytes);
  if (kind === "exe") return "Tệp thực thi không được chấp nhận.";
  const want = KIND_OF_EXT[ext];
  if (want && kind !== want) return `Nội dung tệp không phải .${ext} hợp lệ.`;
  return null;
}

export const AVATAR_MAX = 2 * 1024 * 1024;
export const AVATAR_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
