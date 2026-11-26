#!/usr/bin/env node
// In ra "dấu vân tay" của mã nguồn để biết có bản mới cần build lại hay không.
//   node scripts/fingerprint.mjs          → mã nguồn ứng dụng (src, public, migrations, cấu hình)
//   node scripts/fingerprint.mjs --deps   → chỉ package-lock.json (có cần cài lại phụ thuộc)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const deps = process.argv.includes("--deps");
const roots = deps ? ["package-lock.json"] : ["src", "public", "supabase/migrations", "package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"];
const files = [];
const walk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f));
  else files.push(p);
};
roots.forEach(walk);
const h = createHash("sha256");
for (const f of files) {
  h.update(f.replaceAll("\\", "/"));
  // Bỏ khác biệt xuống dòng CRLF/LF giữa Windows và Linux
  h.update(readFileSync(f).toString("latin1").replace(/\r\n/g, "\n"));
}
process.stdout.write(h.digest("hex").slice(0, 16));
