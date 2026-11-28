// Lịch sử xử lý yêu cầu nộp tài liệu: giao → nộp → yêu cầu nộp lại (lý do) → nộp bản thay thế → duyệt; chỉ chính chủ / HR đọc.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { expectError, makeQ, newClient, ORG, switchUser, U, type Q } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});
async function scenario(fn: (q: Q, as: (u: string | null) => Promise<void>) => Promise<void>) {
  await c.query("begin");
  try {
    await fn(makeQ(c), (u) => switchUser(c, u));
  } finally {
    await c.query("rollback");
  }
}
const PDF = Buffer.from("%PDF-1.4 test").toString("base64");

describe("Lịch sử yêu cầu nộp tài liệu", () => {
  it("mỗi bước có một dòng lịch sử (kể cả bản đã thay thế); nhân viên khác không đọc được", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const type = (await q("select id from document_types where org_id = $1 and name = 'Hợp đồng lao động đã ký'", [ORG]))[0]!.id as string;
      await q("select assign_document_request($1, $2, null, null, 'Nộp bản quét')", [type, [U.hieu]]);
      const req = (await q("select id from document_requests where user_id = $1 and type_id = $2", [U.hieu, type]))[0]!.id as string;
      await as(U.hieu);
      await q("select submit_my_document($1, 'hop-dong-v1.pdf', 'application/pdf', $2)", [req, PDF]);
      await as(U.nhansu);
      await q("select review_document_request($1, 'reject', 'Thiếu chữ ký trang cuối')", [req]);
      await as(U.hieu);
      await q("select submit_my_document($1, 'hop-dong-v2.pdf', 'application/pdf', $2)", [req, PDF]);
      await as(U.nhansu);
      await q("select review_document_request($1, 'approve', null)", [req]);
      const ev = await q<{ action: string; note: string | null; file_name: string | null }>("select action, note, file_name from document_request_events where request_id = $1 order by id", [req]);
      expect(ev.map((e) => e.action)).toEqual(["assigned", "submitted", "rejected", "submitted", "approved"]);
      expect(ev[1]!.file_name).toBe("hop-dong-v1.pdf"); // bản cũ vẫn có dấu vết dù tệp đã bị thay
      expect(ev[2]!.note).toBe("Thiếu chữ ký trang cuối");
      expect(ev[3]!.file_name).toBe("hop-dong-v2.pdf");
      // chính chủ đọc được; người khác không
      await as(U.hieu);
      expect(await q("select id from document_request_events where request_id = $1", [req])).toHaveLength(5);
      await as(U.duy);
      expect(await q("select id from document_request_events where request_id = $1", [req])).toHaveLength(0);
      await expectError(q("insert into document_request_events (org_id, request_id, action) values ($1, $2, 'approved')", [ORG, req]), /permission denied|42501/);
    });
  });
});
