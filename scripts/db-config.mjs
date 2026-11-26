// Đọc chuỗi kết nối Postgres "dễ tính": chấp nhận mật khẩu có ký tự đặc biệt (@ # / ? % :) chưa mã hóa,
// tự bỏ dấu ngoặc [ ] (khi dán nguyên mẫu của Supabase), khoảng trắng và dấu nháy thừa.
// Trả về cấu hình cho pg.Client; KHÔNG bao giờ in mật khẩu ra màn hình.
export function pgConfig(raw) {
  if (!raw) throw new Error("Thiếu chuỗi kết nối (DATABASE_URL / SUPABASE_DB_URL).");
  let s = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  s = s.replace(/^psql\s+/i, "").trim();
  const m = /^(postgres(?:ql)?):\/\/([^:/?#]+):(.*)@([^@/?#:]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?(.*))?$/i.exec(s);
  if (!m) {
    throw new Error(
      "Chuỗi kết nối không đúng dạng postgresql://USER:MẬT_KHẨU@HOST:PORT/postgres — hãy sao chép lại từ Supabase (Connect → Session pooler).",
    );
  }
  let [, , user, password, host, port, database, query] = m;
  password = password.replace(/^\[(.*)\]$/, "$1"); // bỏ [ ] của mẫu [YOUR-PASSWORD]
  try {
    password = decodeURIComponent(password);
  } catch {
    /* mật khẩu chứa % nhưng không phải mã hóa URL — dùng nguyên văn */
  }
  if (/YOUR-PASSWORD/i.test(password)) {
    throw new Error("Chuỗi kết nối vẫn còn chữ [YOUR-PASSWORD] — thay bằng mật khẩu cơ sở dữ liệu thật.");
  }
  const params = new URLSearchParams(query ?? "");
  const local = /^(localhost|127\.0\.0\.1|db|host\.docker\.internal)$/i.test(host);
  const sslmode = params.get("sslmode");
  return {
    user: decodeURIComponent(user),
    password,
    host,
    port: Number(port || 5432),
    database: database || "postgres",
    ssl: sslmode === "disable" || (local && !sslmode) ? false : { rejectUnauthorized: false },
  };
}

/** Mô tả an toàn (che mật khẩu) để in nhật ký. */
export function describe(cfg) {
  return `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}${cfg.ssl ? " (SSL)" : ""}`;
}
