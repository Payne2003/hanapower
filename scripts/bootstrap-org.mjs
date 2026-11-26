#!/usr/bin/env node
// Tạo doanh nghiệp và tài khoản quản trị hệ thống đầu tiên cho môi trường mới (cloud hoặc tại văn phòng).
//   node scripts/bootstrap-org.mjs --org "Công ty ABC" --email admin@abc.vn --name "Nguyễn Văn A" --password "..." [--timezone Asia/Ho_Chi_Minh]
// Cần: DATABASE_URL, SUPABASE_PUBLIC_URL (hoặc SUPABASE_INTERNAL_URL), SUPABASE_SERVICE_ROLE_KEY (đọc từ môi trường hoặc .env.local).
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { pgConfig } from "./db-config.mjs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const org = opt("org"), email = opt("email")?.toLowerCase(), name = opt("name");
// Mật khẩu có thể truyền qua biến môi trường BOOTSTRAP_PASSWORD để không lộ trong danh sách tiến trình.
const password = opt("password") ?? process.env.BOOTSTRAP_PASSWORD;
const timezone = opt("timezone") ?? "Asia/Ho_Chi_Minh";
if (!org || !email || !name || !password) {
  console.error('Thiếu tham số. Ví dụ: --org "Công ty ABC" --email admin@abc.vn --name "Nguyễn Văn A" --password "..."');
  process.exit(1);
}
if (password.length < 8) { console.error("Mật khẩu tối thiểu 8 ký tự."); process.exit(1); }
const url = process.env.SUPABASE_INTERNAL_URL || process.env.SUPABASE_PUBLIC_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.DATABASE_URL) { console.error("Thiếu SUPABASE_*_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL."); process.exit(1); }

const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name } }),
});
const body = await res.json();
if (!res.ok) { console.error("Không tạo được tài khoản Auth:", body.msg ?? body.message ?? body); process.exit(1); }
const userId = body.id;

const client = new pg.Client(pgConfig(process.env.DATABASE_URL));
await client.connect();
try {
  await client.query("begin");
  const { rows: [o] } = await client.query("insert into public.organizations (name, timezone) values ($1, $2) returning id", [org, timezone]);
  await client.query("insert into public.profiles (id, org_id, full_name, email, job_title) values ($1, $2, $3, $4, 'Quản trị hệ thống')", [userId, o.id, name, email]);
  await client.query("insert into public.user_roles (org_id, user_id, role) values ($1, $2, 'system_admin'), ($1, $2, 'manager')", [o.id, userId]);
  await client.query("insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details) values ($1, $2, 'org.bootstrap', 'organization', $1, $3)", [o.id, userId, { email }]);
  await client.query("commit");
  console.log(`Đã tạo doanh nghiệp "${org}" (${o.id}) và quản trị hệ thống ${email}.`);
} catch (e) {
  await client.query("rollback");
  console.error("Lỗi ghi CSDL:", e.message, "— tài khoản Auth đã tạo:", userId);
  process.exitCode = 1;
} finally {
  await client.end();
}
