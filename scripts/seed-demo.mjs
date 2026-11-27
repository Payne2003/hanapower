#!/usr/bin/env node
// Nạp / gỡ dữ liệu ảo để xem demo (xem supabase/demo/demo-data.sql).
//   node scripts/seed-demo.mjs --password "MatKhauDemo#1" [--org "Tên doanh nghiệp"]   # nạp
//   node scripts/seed-demo.mjs --remove [--org "Tên doanh nghiệp"]                      # gỡ
// Cần DATABASE_URL (đọc từ môi trường hoặc .env.local). Mặc định: doanh nghiệp đầu tiên trong hệ thống.
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
const remove = argv.includes("--remove");
const orgName = opt("org");
const password = opt("password") ?? process.env.DEMO_PASSWORD;
if (!process.env.DATABASE_URL) { console.error("Thiếu DATABASE_URL."); process.exit(1); }
if (!remove && (!password || password.length < 8)) { console.error('Cần --password (tối thiểu 8 ký tự) — mật khẩu chung cho các tài khoản demo.'); process.exit(1); }

const client = new pg.Client(pgConfig(process.env.DATABASE_URL));
await client.connect();
try {
  const { rows } = orgName
    ? await client.query("select id, name from public.organizations where name = $1", [orgName])
    : await client.query("select id, name from public.organizations order by created_at, id limit 1");
  if (!rows[0]) { console.error(orgName ? `Không có doanh nghiệp "${orgName}".` : "Chưa có doanh nghiệp nào."); process.exit(1); }
  const org = rows[0];
  console.log(`${remove ? "Gỡ" : "Nạp"} dữ liệu demo cho "${org.name}" (${org.id})`);
  client.on("notice", (n) => console.log("  ·", n.message));
  const sql = readFileSync(new URL(`../supabase/demo/${remove ? "demo-remove" : "demo-data"}.sql`, import.meta.url), "utf8");
  await client.query("begin");
  await client.query("select set_config('demo.org', $1, true), set_config('demo.password', $2, true)", [org.id, password ?? ""]);
  await client.query(sql);
  await client.query("commit");
  if (!remove) {
    console.log("Xong. Đăng nhập thử bằng một tài khoản demo, ví dụ:");
    console.log("  demo.quanly@hanamedia.demo    (quản lý + quản trị)");
    console.log("  demo.ketoan@hanamedia.demo    (kế toán)     demo.nhansu@hanamedia.demo (nhân sự)");
    console.log("  demo.content1@hanamedia.demo  (Content)     demo.editor1@hanamedia.demo (Editor)");
    console.log("  demo.ctv1@hanamedia.demo      (cộng tác viên)");
    console.log("Gỡ sau khi demo:  node scripts/seed-demo.mjs --remove");
  }
} catch (e) {
  await client.query("rollback").catch(() => undefined);
  console.error("Lỗi:", e.message, e.position ? `(vị trí ${e.position})` : "");
  process.exitCode = 1;
} finally {
  await client.end();
}
