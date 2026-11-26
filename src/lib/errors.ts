// Chuyển lỗi PostgREST/Postgres thành thông báo tiếng Việt dễ hiểu.
type PgLikeError = { code?: string; message?: string } | null | undefined;

export function toUserMessage(err: PgLikeError, fallback = "Đã có lỗi xảy ra, vui lòng thử lại."): string {
  if (!err) return fallback;
  const msg = err.message ?? "";
  // Thông báo do hàm RPC tự đặt đã là tiếng Việt.
  if (/[à-ỹÀ-Ỹđ]/.test(msg)) return msg;
  switch (err.code) {
    case "42501":
      return "Bạn không có quyền thực hiện thao tác này.";
    case "P0002":
      return "Không tìm thấy dữ liệu.";
    case "23505":
      return "Dữ liệu đã tồn tại.";
    case "23503":
      return "Dữ liệu liên kết không hợp lệ.";
    case "PGRST301":
    case "PGRST303":
      return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
    default:
      if (/fetch failed|ECONNREFUSED|network/i.test(msg)) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
      return fallback;
  }
}
