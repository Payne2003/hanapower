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

export const U = {
  admin: "00000000-0000-4000-c000-000000000001",
  deptManager: "00000000-0000-4000-c000-000000000002", // Trần Thị Bình - trưởng phòng Kỹ thuật
  pm1: "00000000-0000-4000-c000-000000000003", // Lê Minh Châu - QLDA dự án 1, 3
  emp1: "00000000-0000-4000-c000-000000000004", // Phạm Quốc Dũng - thành viên DA1, DA2
  emp2: "00000000-0000-4000-c000-000000000005", // Hoàng Thu Hà - thành viên DA1
  pm2: "00000000-0000-4000-c000-000000000006", // Võ Thanh Hải - QLDA dự án 2
  emp3: "00000000-0000-4000-c000-000000000007", // Đỗ Khánh Linh - thành viên DA2
  outsider: "00000000-0000-4000-c000-000000000099", // doanh nghiệp khác
} as const;

export const P = {
  solar: "00000000-0000-4000-d000-000000000001",
  scada: "00000000-0000-4000-d000-000000000002",
  empty: "00000000-0000-4000-d000-000000000003",
  other: "00000000-0000-4000-d000-000000000009",
} as const;

export const T = {
  survey: "00000000-0000-4000-e000-000000000001", // done
  design: "00000000-0000-4000-e000-000000000002", // emp2, 60%, weight 2
  estimate: "00000000-0000-4000-e000-000000000003", // emp1, 40%, blocked
  permit: "00000000-0000-4000-e000-000000000004", // emp1, 0%
  cancelled: "00000000-0000-4000-e000-000000000005",
  rtu: "00000000-0000-4000-e000-000000000006", // emp3 (DA2)
  historian: "00000000-0000-4000-e000-000000000007", // emp1 (DA2), weight 3
  other: "00000000-0000-4000-e000-000000000009",
} as const;

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
