// Tiện ích kiểm thử CSDL: chạy truy vấn với danh tính một người dùng (giống PostgREST),
// trong giao dịch được ROLLBACK sau mỗi lần để không làm bẩn dữ liệu mẫu.
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && !(m[1] in process.env)) process.env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
}

export const DB_URL = process.env.DATABASE_URL ?? "";

export const ORG = "00000000-0000-4000-a000-000000000001";
export const OTHER_ORG = "00000000-0000-4000-a000-000000000002";

export const U = {
  admin: "00000000-0000-4000-c000-000000000001",
  leader: "00000000-0000-4000-c000-000000000002",
  hieu: "00000000-0000-4000-c000-000000000003", // Content
  phong: "00000000-0000-4000-c000-000000000004", // Content
  duy: "00000000-0000-4000-c000-000000000005", // Editor
  hoa: "00000000-0000-4000-c000-000000000006", // Editor
  tien: "00000000-0000-4000-c000-000000000007", // Editor
  outsider: "00000000-0000-4000-c000-000000000099", // doanh nghiệp khác
} as const;

/** id video mẫu theo số thứ tự (D0001 → V(1)). */
export const V = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
export const OTHER_VIDEO = "00000000-0000-4000-9000-000000000999";
export const CHANNEL = "00000000-0000-4000-f000-000000000001";

export function newClient() {
  return new pg.Client({ connectionString: DB_URL });
}

export type Q = <R extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<R[]>;

/** Chạy fn trong giao dịch với vai trò authenticated + JWT của userId (null = anon). Luôn rollback. */
export async function withUser<T>(client: pg.Client, userId: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await setIdentity(client, userId);
    return await fn(makeQ(client));
  } finally {
    await client.query("rollback");
  }
}

/** Mỗi câu lệnh chạy trong SAVEPOINT để một lỗi mong đợi không hủy cả giao dịch kiểm thử. */
export function makeQ(client: pg.Client): Q {
  return async (sql, params) => {
    await client.query("savepoint q");
    try {
      const res = await client.query(sql, params as unknown[]);
      await client.query("release savepoint q");
      return res.rows;
    } catch (e) {
      await client.query("rollback to savepoint q");
      throw e;
    }
  };
}

export async function setIdentity(client: pg.Client, userId: string | null) {
  if (userId) {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
  } else {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
  }
}

/** Đổi danh tính giữa chừng trong cùng một giao dịch (để mô phỏng nhiều người dùng nối tiếp). */
export async function switchUser(client: pg.Client, userId: string | null) {
  await client.query("reset role");
  await setIdentity(client, userId);
}

export async function expectError(p: Promise<unknown>, match: RegExp | string): Promise<pg.DatabaseError> {
  try {
    await p;
  } catch (e) {
    const err = e as pg.DatabaseError;
    const text = `${err.code ?? ""} ${err.message}`;
    if (typeof match === "string" ? !text.includes(match) : !match.test(text)) {
      throw new Error(`Lỗi không khớp. Mong đợi ${match}, nhận: ${text}`);
    }
    return err;
  }
  throw new Error(`Mong đợi lỗi ${match} nhưng câu lệnh thành công`);
}
