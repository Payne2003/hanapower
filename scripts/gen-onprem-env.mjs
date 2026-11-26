#!/usr/bin/env node
// Tạo deploy/onprem/.env với khóa bí mật ngẫu nhiên và JWT anon/service_role ký HS256.
// Dùng: node scripts/gen-onprem-env.mjs [--domain hanapower.lan] [--force]
import { randomBytes, createHmac } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const domain = opt("--domain", "hanapower.lan");
const httpsPort = opt("--https-port", "443");
const force = args.includes("--force");
const out = resolve(opt("--out", "deploy/onprem/.env"));

if (existsSync(out) && !force) {
  console.error(`Đã có ${out}. Thêm --force để ghi đè (sẽ làm mất hiệu lực các phiên đăng nhập cũ).`);
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const secret = (n) => randomBytes(n).toString("base64url").slice(0, n);
const signJwt = (payload, key) => {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
};

const jwtSecret = secret(48);
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;
const anon = signJwt({ role: "anon", iss: "supabase", iat, exp }, jwtSecret);
const service = signJwt({ role: "service_role", iss: "supabase", iat, exp }, jwtSecret);
const publicUrl = httpsPort === "443" ? `https://${domain}` : `https://${domain}:${httpsPort}`;

const env = `# Sinh tự động bởi scripts/gen-onprem-env.mjs — GIỮ BÍ MẬT, không commit.
APP_DOMAIN=${domain}
PUBLIC_URL=${publicUrl}
HTTPS_PORT=${httpsPort}
TLS_MODE=internal
APP_TIMEZONE=Asia/Ho_Chi_Minh
POSTGRES_PASSWORD=${secret(32)}
JWT_SECRET=${jwtSecret}
JWT_EXP=3600
ANON_KEY=${anon}
SERVICE_ROLE_KEY=${service}
SECRET_KEY_BASE=${secret(64)}
# Để trống = Docker Hub. Ví dụ dùng mirror: IMAGE_REGISTRY=mirror.gcr.io/
IMAGE_REGISTRY=
`;
writeFileSync(out, env, { mode: 0o600 });
console.log(`Đã tạo ${out} cho ${publicUrl}`);
