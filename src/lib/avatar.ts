/** Địa chỉ ảnh đại diện (có phiên bản để làm mới ngay khi đổi ảnh). undefined = dùng chữ cái đầu. */
export function avatarSrc(userId: string | null | undefined, version: string | null | undefined): string | undefined {
  if (!userId || !version) return undefined;
  const t = Date.parse(version);
  return Number.isFinite(t) ? `/anh-dai-dien/${userId}?v=${t}` : undefined;
}
