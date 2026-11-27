// Đọc số tiền VND thành chữ: 60480000 → "Sáu mươi triệu bốn trăm tám mươi nghìn đồng".
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const UNITS = ["", "nghìn", "triệu", "tỷ"];

function readTriple(n: number, full: boolean): string {
  const tram = Math.floor(n / 100), chuc = Math.floor((n % 100) / 10), dv = n % 10;
  const out: string[] = [];
  if (tram > 0 || full) out.push(`${DIGITS[tram]} trăm`);
  if (chuc > 1) out.push(`${DIGITS[chuc]} mươi`);
  else if (chuc === 1) out.push("mười");
  else if (tram > 0 || full) if (dv > 0) out.push("lẻ");
  if (dv > 0) {
    if (dv === 1 && chuc > 1) out.push("mốt");
    else if (dv === 5 && chuc > 0) out.push("lăm");
    else out.push(DIGITS[dv]!);
  }
  return out.join(" ");
}

export function vndInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (!Number.isFinite(n) || n > 999_999_999_999_999) return "";
  if (n === 0) return "Không đồng";
  // tách thành các nhóm 3 chữ số, từ phải sang trái; nhóm "tỷ" có thể lặp (nghìn tỷ…)
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) continue;
    const higherNonZero = groups.slice(i + 1).some((x) => x > 0);
    const unit = i % 3 === 0 && i > 0 ? "tỷ" : UNITS[i % 3]!;
    parts.push(`${readTriple(g, higherNonZero)}${unit ? ` ${unit}` : ""}`.trim());
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
}
