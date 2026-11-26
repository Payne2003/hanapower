#!/usr/bin/env node
// Chạy migration SQL có phiên bản trong supabase/migrations theo thứ tự tên tệp.
// Bảng theo dõi trùng với Supabase CLI (supabase_migrations.schema_migrations),
// nên có thể dùng xen kẽ với `supabase db push` / `supabase db reset`.
//
//   node scripts/migrate.mjs                 # áp dụng migration chưa chạy
//   node scripts/migrate.mjs --seed          # + nạp supabase/seed.sql
//   node scripts/migrate.mjs --seed-only     # chỉ nạp dữ liệu mẫu
//   node scripts/migrate.mjs --reset --yes --seed   # XÓA dữ liệu ứng dụng rồi chạy lại (chỉ dùng khi phát triển)
//   node scripts/migrate.mjs --status        # liệt kê trạng thái
//
// Kết nối: DATABASE_URL (ưu tiên) — ví dụ postgres://postgres:postgres@127.0.0.1:54322/postgres
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { describe, pgConfig } from "./db-config.mjs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL (xem .env.example).");
  process.exit(1);
}
const dir = resolve("supabase/migrations");
let cfg;
try {
  cfg = pgConfig(url);
} catch (e) {
  console.error(`LỖI: ${e.message}`);
  process.exit(1);
}
console.log(`Kết nối: ${describe(cfg)}`);
const client = new pg.Client(cfg);

async function reset() {
  if (!args.has("--yes")) {
    console.error("--reset sẽ XÓA toàn bộ dữ liệu ứng dụng. Thêm --yes để xác nhận.");
    process.exit(1);
  }
  if (process.env.APP_ENV === "production") {
    console.error("Từ chối --reset khi APP_ENV=production.");
    process.exit(1);
  }
  console.log("• Xóa đối tượng ứng dụng trong schema public/app…");
  await client.query(`
    do $$
    declare r record;
    begin
      for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'v' loop
        execute format('drop view if exists public.%I cascade', r.relname);
      end loop;
      for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('drop table if exists public.%I cascade', r.tablename);
      end loop;
      for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
               where n.nspname = 'public' and d.objid is null loop
        execute format('drop function if exists %s cascade', r.sig);
      end loop;
      for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
               left join pg_depend d on d.objid = t.oid and d.deptype = 'e'
               where n.nspname = 'public' and t.typtype = 'e' and d.objid is null loop
        execute format('drop type if exists public.%I cascade', r.typname);
      end loop;
      drop schema if exists app cascade;
      if to_regclass('supabase_migrations.schema_migrations') is not null then
        delete from supabase_migrations.schema_migrations;
      end if;
      -- Không xóa trực tiếp bảng storage: Supabase bản mới chặn việc này (storage.protect_delete).
      -- Ứng dụng chưa tạo bucket nào nên không cần dọn.
      delete from auth.users where id::text like '00000000-0000-4000-c000-%';
    end $$;`);
}

async function migrate() {
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text)`);
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const done = new Set(rows.map((r) => r.version));
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  let applied = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (done.has(version)) {
      if (args.has("--status")) console.log(`  ✓ ${file}`);
      continue;
    }
    if (args.has("--status")) {
      console.log(`  · ${file} (chưa chạy)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`• Áp dụng ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, rest.join("_"), [sql]],
      );
      await client.query("commit");
      console.log("xong");
      applied++;
    } catch (e) {
      await client.query("rollback");
      console.log("LỖI");
      throw e;
    }
  }
  if (!args.has("--status")) console.log(applied ? `Đã áp dụng ${applied} migration.` : "Không có migration mới.");
}

async function seed() {
  const file = resolve("supabase/seed.sql");
  process.stdout.write("• Nạp dữ liệu mẫu supabase/seed.sql … ");
  await client.query("begin");
  try {
    await client.query(readFileSync(file, "utf8"));
    await client.query("commit");
    console.log("xong");
  } catch (e) {
    await client.query("rollback");
    console.log("LỖI");
    throw e;
  }
}

try {
  await client.connect();
  if (args.has("--reset")) await reset();
  if (!args.has("--seed-only")) await migrate();
  if (args.has("--seed") || args.has("--seed-only")) await seed();
} catch (e) {
  console.error(`\n${e.message}`);
  if (e.where) console.error(e.where);
  process.exitCode = 1;
} finally {
  await client.end();
}
