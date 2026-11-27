import { describe, expect, it } from "vitest";
import { vndInWords } from "@/lib/vn-words";

describe("đọc số tiền thành chữ", () => {
  it.each([
    [0, "Không đồng"],
    [5, "Năm đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [105, "Một trăm lẻ năm đồng"],
    [1_000, "Một nghìn đồng"],
    [1_500_000, "Một triệu năm trăm nghìn đồng"],
    [30_240_000, "Ba mươi triệu hai trăm bốn mươi nghìn đồng"],
    [60_480_000, "Sáu mươi triệu bốn trăm tám mươi nghìn đồng"],
    [1_000_005, "Một triệu không trăm lẻ năm đồng"],
    [2_000_000_000, "Hai tỷ đồng"],
    [12_345_678_901, "Mười hai tỷ ba trăm bốn mươi lăm triệu sáu trăm bảy mươi tám nghìn chín trăm lẻ một đồng"],
  ])("%i → %s", (n, w) => expect(vndInWords(n)).toBe(w));
});
