// Hồ sơ tự phục vụ: ảnh đại diện, tự sửa thông tin, tài liệu hệ thống yêu cầu nộp (giao – nộp – duyệt – nộp lại), phạm vi truy cập.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, ORG, switchUser, U, type Q } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README.");
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});

const D_EDIT = "00000000-0000-4000-b000-000000000003";
async function scenario(fn: (q: Q, as: (u: string | null) => Promise<void>) => Promise<void>) {
  await c.query("begin");
  try {
    await fn(makeQ(c), (u) => switchUser(c, u));
  } finally {
    await c.query("rollback");
  }
}
// ảnh PNG / JPEG / WebP nhỏ nhưng có chữ ký đúng
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(64, 1)]).toString("base64");
const JPG = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.alloc(64, 2)]).toString("base64");
const WEBP = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(32, 3)]).toString("base64");
const PDF = Buffer.from("%PDF-1.4 test").toString("base64");
const typeId = async (q: Q, name: string) => (await q("select id from document_types where org_id = $1 and name = $2", [ORG, name]))[0]?.id as string;
const reqOf = async (q: Q, user: string, type: string) => (await q("select * from document_requests where user_id = $1 and type_id = $2", [user, type]))[0] as Record<string, unknown> | undefined;

describe("Ảnh đại diện", () => {
  it("đặt, thay, gỡ trong một thao tác; chỉ nhận JPEG/PNG/WebP có chữ ký hợp lệ và ≤ 2 MB; lỗi vẫn giữ ảnh cũ", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      const t1 = (await q("select set_my_avatar('image/png', $1) as t", [PNG]))[0]?.t as string;
      expect((await q("select avatar_updated_at from profiles where id = $1", [U.hieu]))[0]?.avatar_updated_at).toBeTruthy();
      const first = (await q("select updated_at from user_avatars where user_id = $1", [U.hieu]))[0]?.updated_at;
      // các lần tải lỗi không đụng tới ảnh đang dùng
      await expectError(q("select set_my_avatar('image/gif', $1)", [PNG]), /JPEG, PNG hoặc WebP/);
      await expectError(q("select set_my_avatar('image/png', $1)", [JPG]), /JPEG, PNG hoặc WebP/); // sai chữ ký so với mime
      await expectError(q("select set_my_avatar('image/jpeg', $1)", [Buffer.from("<script>alert(1)</script>").toString("base64")]), /hợp lệ/);
      await expectError(q("select set_my_avatar('image/png', $1)", [Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(2 * 1024 * 1024)]).toString("base64")]), /2 MB/);
      await expectError(q("select set_my_avatar('image/png', '')"), /rỗng|không hợp lệ/);
      expect((await q("select updated_at from user_avatars where user_id = $1", [U.hieu]))[0]?.updated_at).toEqual(first);
      expect((await q("select (get_avatar($1))->>'mime' m", [U.hieu]))[0]?.m).toBe("image/png");
      // thay bằng JPEG và WebP
      await q("select set_my_avatar('image/jpeg', $1)", [JPG]);
      await q("select set_my_avatar('image/webp', $1)", [WEBP]);
      expect((await q("select mime from user_avatars where user_id = $1", [U.hieu]))[0]?.mime).toBe("image/webp");
      expect(await q("select user_id from user_avatars")).toHaveLength(1); // một ảnh / người
      expect(t1).toBeTruthy();
      // danh sách nhân viên có "phiên bản ảnh"
      await as(U.leader);
      const list = (await q("select staff_list(null, null, null, null, null, false, 'name', 'asc', 50, 0) as r"))[0]?.r as { rows: { id: string; avatar: string | null }[] };
      expect(list.rows.find((x) => x.id === U.hieu)?.avatar).toBeTruthy();
      expect(list.rows.find((x) => x.id === U.phong)?.avatar).toBeNull();
      expect((await q("select (get_avatar($1))->>'mime' m", [U.hieu]))[0]?.m).toBe("image/webp"); // đồng nghiệp xem được
      await as(U.hieu);
      await q("select remove_my_avatar()");
      expect(await q("select user_id from user_avatars")).toHaveLength(0);
      expect((await q("select avatar_updated_at from profiles where id = $1", [U.hieu]))[0]?.avatar_updated_at).toBeNull();
    });
  });

  it("mỗi người chỉ đổi ảnh của chính mình; cộng tác viên không xem ảnh người khác; doanh nghiệp khác không thấy", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await q("select set_my_avatar('image/png', $1)", [PNG]);
      await as(U.phong);
      await q("select remove_my_avatar()"); // chỉ xóa ảnh của Phong (không có), không đụng ảnh Hiếu
      expect(await q("select user_id from user_avatars where user_id = $1", [U.hieu])).toHaveLength(1);
      await expectError(q("update profiles set avatar_updated_at = now() where id = $1", [U.hieu]), /permission denied|row-level/i).catch(async () => {
        expect(await q("update profiles set avatar_updated_at = now() where id = $1 returning 1", [U.hieu])).toHaveLength(0);
      });
      await as(U.ctv);
      expect(await q("select user_id from user_avatars where user_id = $1", [U.hieu])).toHaveLength(0);
      await q("select set_my_avatar('image/jpeg', $1)", [JPG]); // vẫn đặt được ảnh của mình
      expect(await q("select user_id from user_avatars")).toHaveLength(1);
      await as(U.outsider);
      expect(await q("select user_id from user_avatars where org_id = $1", [ORG])).toHaveLength(0);
      await as(null);
      await expectError(q("select get_avatar($1)", [U.hieu]), /permission denied/);
    });
  });
});

describe("Tự sửa thông tin cá nhân", () => {
  it("nhân viên chỉ sửa địa chỉ của chính mình; các trường do HR quản lý không bị đụng tới", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      await q("select save_staff_personal($1, '1995-04-12', 'male', 'Địa chỉ cũ', '079095001234', '8012345678')", [U.hieu]);
      await as(U.hieu);
      await q("select save_my_profile('  12 Lê Lợi, Q.1  ')");
      expect((await q("select address, tax_code, id_number, date_of_birth::text d from staff_personal where user_id = $1", [U.hieu]))[0]).toMatchObject({ address: "12 Lê Lợi, Q.1", tax_code: "8012345678", id_number: "079095001234", d: "1995-04-12" });
      await expectError(q("select save_my_profile($1)", ["x".repeat(301)]), /300 ký tự/);
      // người chưa có hồ sơ cá nhân vẫn tự điền được địa chỉ
      await as(U.phong);
      await q("select save_my_profile('Số 5 Hai Bà Trưng')");
      expect((await q("select address from staff_personal where user_id = $1", [U.phong]))[0]?.address).toBe("Số 5 Hai Bà Trưng");
      expect(await q("select user_id from staff_personal where user_id = $1", [U.hieu])).toHaveLength(0); // không đọc được hồ sơ cá nhân người khác
      // không có đường tự sửa hồ sơ làm việc / mã NV
      await expectError(q("select save_staff_profile($1, 'NV-TUSUA', 'working', 'remote', 'official', null, null)", [U.phong]), /42501|Chỉ quản trị/);
      await expectError(q("update profiles set employee_code = 'NV-X' where id = $1", [U.phong]), /permission denied|row-level/i).catch(async () => {
        expect(await q("update profiles set employee_code = 'NV-X' where id = $1 returning 1", [U.phong])).toHaveLength(0);
      });
    });
  });
});

describe("Tài liệu hệ thống yêu cầu nộp", () => {
  it("mẫu có sẵn; HR giao theo phòng và theo người; thông báo; người thường không giao được; yêu cầu chỉ hiện cho chính chủ và HR", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      expect((await q("select name from document_types where org_id = $1 order by name", [ORG])).length).toBe(3);
      const cccd = await typeId(q, "Căn cước công dân (2 mặt)");
      const n = (await q("select assign_document_request($1, $2, $3, current_date + 7, 'Nộp trong tuần này') as n", [cccd, [U.hieu], D_EDIT]))[0]?.n;
      expect(n).toBe(4); // Hiếu + Duy, Hòa, Tiện của phòng Edit
      await q("select assign_document_request($1, '{}', $2, null, null)", [cccd, D_EDIT]); // giao lại: cập nhật, không nhân đôi
      expect((await q("select count(*)::int n from document_requests where type_id = $1", [cccd]))[0]?.n).toBe(4);
      await expectError(q("select assign_document_request($1, '{}', null, null, null)", [cccd]), /Chọn ít nhất/);
      await expectError(q("select assign_document_request($1, $2, null, '2020-01-01', null)", [cccd, [U.hieu]]), /quá khứ/);
      await expectError(q("select assign_document_request(gen_random_uuid(), $1, null, null, null)", [[U.hieu]]), /loại tài liệu/);
      // cộng tác viên không nhận yêu cầu
      expect((await q("select assign_document_request($1, $2, null, null, null) as n", [cccd, [U.duy]]))[0]?.n).toBe(1);
      await expectError(q("select assign_document_request($1, $2, null, null, null)", [cccd, [U.ctv]]), /Chọn ít nhất/);
      await as(U.duy);
      expect((await q("select message, link from notifications where kind = 'doc_request'"))[0]).toMatchObject({ link: "/cai-dat/ho-so#tai-lieu" });
      expect((await q("select id from document_requests")).length).toBe(1); // chỉ thấy yêu cầu của mình
      expect(await q("select id from document_requests where user_id = $1", [U.hoa])).toHaveLength(0);
      for (const u of [U.duy, U.hieu, U.leader, U.ketoan, U.truongnhom]) {
        await as(u);
        await expectError(q("select assign_document_request($1, $2, null, null, null)", [cccd, [U.phong]]), /42501|Chỉ quản trị/);
        await expectError(q("select save_document_type(null, 'Giả', null, true, '{pdf}', 5, true)"), /42501|Chỉ quản trị/);
        await expectError(q("select doc_status_list()"), /Chỉ quản trị/);
      }
      await as(U.admin);
      expect((await q("select id from document_requests")).length).toBe(4);
    });
  });

  it("vòng đời: nộp → chờ duyệt → yêu cầu nộp lại (lý do) → nộp bản mới → chờ duyệt → duyệt; kiểm tra định dạng, dung lượng, chủ sở hữu", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const hd = await typeId(q, "Hợp đồng lao động đã ký"); // chỉ nhận PDF
      await q("select assign_document_request($1, $2, null, null, null)", [hd, [U.hoa, U.duy]]);
      const req = (await reqOf(q, U.hoa, hd))!;
      const dReq = (await reqOf(q, U.duy, hd))!;
      expect(req.status).toBe("pending");
      // Hòa nộp: sai định dạng / thiếu đuôi / quá lớn / yêu cầu của người khác đều bị từ chối
      await as(U.hoa);
      await expectError(q("select submit_my_document($1, 'hd.exe', 'application/octet-stream', $2)", [req.id, PDF]), /chỉ nhận định dạng/);
      await expectError(q("select submit_my_document($1, 'hd', 'application/pdf', $2)", [req.id, PDF]), /phần mở rộng/);
      await expectError(q("select submit_my_document($1, 'hd.pdf', 'application/pdf', $2)", [req.id, Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")]), /5 MB/);
      await expectError(q("select submit_my_document($1, 'hd.pdf', 'application/pdf', '')", [req.id]), /rỗng|không hợp lệ/);
      await as(U.hoa);
      expect(await q("select id from document_requests where id = $1", [dReq.id])).toHaveLength(0);
      await expectError(q("select submit_my_document($1, 'hd.pdf', 'application/pdf', $2)", [dReq.id, PDF]), /Không tìm thấy yêu cầu/);
      expect((await reqOf(q, U.hoa, hd))?.status).toBe("pending"); // lỗi không đổi trạng thái
      // nộp hợp lệ
      const doc1 = (await q("select submit_my_document($1, 'hd-hoa.pdf', 'application/pdf', $2) as id", [req.id, PDF]))[0]?.id as string;
      expect(await reqOf(q, U.hoa, hd)).toMatchObject({ status: "submitted", document_id: doc1 });
      expect(((await q("select get_user_document($1) as r", [doc1]))[0]?.r as { name: string }).name).toBe("hd-hoa.pdf");
      // HR nhận thông báo; chưa duyệt thì không "yêu cầu nộp lại" mơ hồ
      await as(U.nhansu);
      expect((await q("select message from notifications where kind = 'doc_submitted'"))[0]?.message).toContain("đã nộp tài liệu");
      await expectError(q("select review_document_request($1, 'reject', '  ')", [req.id]), /lý do/);
      await expectError(q("select review_document_request($1, 'maybe', null)", [req.id]), /không hợp lệ/);
      await q("select review_document_request($1, 'reject', 'Thiếu chữ ký bên B')", [req.id]);
      expect(await reqOf(q, U.hoa, hd)).toMatchObject({ status: "rejected", reject_reason: "Thiếu chữ ký bên B" });
      expect((await reqOf(q, U.hoa, hd))?.reviewed_by).toBe(U.nhansu);
      await expectError(q("select review_document_request($1, 'approve', null)", [req.id]), /đang chờ duyệt/); // không duyệt bản đã trả lại
      // Hòa thấy lý do + được thông báo, nộp bản mới → quay về "Chờ duyệt", lý do cũ được xóa, bản cũ được thay
      await as(U.hoa);
      expect((await q("select message from notifications where kind = 'doc_rejected'"))[0]?.message).toContain("Thiếu chữ ký bên B");
      const doc2 = (await q("select submit_my_document($1, 'hd-hoa-v2.pdf', 'application/pdf', $2) as id", [req.id, PDF]))[0]?.id as string;
      expect(await reqOf(q, U.hoa, hd)).toMatchObject({ status: "submitted", document_id: doc2, reject_reason: null, reviewed_by: null });
      expect(await q("select id from user_documents where request_id = $1", [req.id])).toHaveLength(1);
      // người khác không tải được tệp của Hòa; HR tải được
      await as(U.duy);
      await expectError(q("select get_user_document($1)", [doc2]), /Không tìm thấy/);
      await as(U.nhansu);
      expect(((await q("select get_user_document($1) as r", [doc2]))[0]?.r as { name: string }).name).toBe("hd-hoa-v2.pdf");
      await q("select review_document_request($1, 'approve', null)", [req.id]);
      expect(await reqOf(q, U.hoa, hd)).toMatchObject({ status: "approved", reject_reason: null });
      await as(U.hoa);
      expect((await q("select message from notifications where kind = 'doc_approved'"))[0]?.message).toContain("đã được duyệt");
      await expectError(q("select submit_my_document($1, 'hd-moi.pdf', 'application/pdf', $2)", [req.id, PDF]), /đã được duyệt/);
      // người thường không duyệt / xóa được
      await as(U.duy);
      await expectError(q("select review_document_request($1, 'approve', null)", [dReq.id]), /42501|Chỉ quản trị/);
      await expectError(q("select delete_document_request($1)", [dReq.id]), /42501|Chỉ quản trị/);
    });
  });

  it("tình trạng hồ sơ: hoàn thành khi mọi tài liệu BẮT BUỘC đã duyệt; lọc theo phòng và tình trạng; xóa yêu cầu xóa cả tệp", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const cccd = await typeId(q, "Căn cước công dân (2 mặt)"), hd = await typeId(q, "Hợp đồng lao động đã ký"), bc = await typeId(q, "Bằng cấp / chứng chỉ");
      for (const t of [cccd, hd, bc]) await q("select assign_document_request($1, '{}', $2, null, null)", [t, D_EDIT]);
      type Row = { id: string; state: string; required: number; approved: number; pending: number; submitted: number; rejected: number };
      const list = async (dept: string | null, st: string | null = null) => (await q("select doc_status_list(null, $1, $2, 50, 0) as r", [dept, st]))[0]?.r as { total: number; rows: Row[]; summary: Record<string, number> };
      let r = await list(D_EDIT);
      expect(r.total).toBe(3);
      expect(r.rows.every((x) => x.required === 2 && x.approved === 0 && x.state === "incomplete")).toBe(true);
      expect((await list(null)).rows.find((x) => x.id === U.hieu)?.state).toBe("none"); // chưa giao yêu cầu
      // Duy nộp + được duyệt cả hai tài liệu bắt buộc (bằng cấp không bắt buộc → vẫn hoàn thành)
      for (const t of [cccd, hd]) {
        const rq = (await reqOf(q, U.duy, t))!;
        await as(U.duy);
        await q("select submit_my_document($1, 'file.pdf', 'application/pdf', $2)", [rq.id, PDF]);
        await as(U.nhansu);
        if (t === cccd) expect((await list(D_EDIT, "review")).rows.map((x) => x.id)).toEqual([U.duy]);
        await q("select review_document_request($1, 'approve', null)", [rq.id]);
      }
      r = await list(D_EDIT);
      expect(r.rows.find((x) => x.id === U.duy)).toMatchObject({ state: "complete", approved: 2 });
      expect((await list(D_EDIT, "complete")).rows.map((x) => x.id)).toEqual([U.duy]);
      expect((await list(D_EDIT, "incomplete")).rows.map((x) => x.id).sort()).toEqual([U.hoa, U.tien].sort());
      expect((await list(D_EDIT, "missing")).total).toBe(3); // còn yêu cầu chưa nộp (bằng cấp của Duy cũng chưa nộp)
      expect((await list(D_EDIT)).summary).toMatchObject({ total: 3, complete: 1, incomplete: 2 });
      expect((await list(D_EDIT, "complete")).summary.total).toBe(3); // tổng hợp theo toàn bộ tập lọc phòng, không theo trang
      // phân trang
      expect(((await q("select doc_status_list(null, $1, null, 2, 0) as r", [D_EDIT]))[0]?.r as { rows: unknown[]; total: number })).toMatchObject({ total: 3 });
      expect(((await q("select doc_status_list(null, $1, null, 2, 2) as r", [D_EDIT]))[0]?.r as { rows: unknown[] }).rows).toHaveLength(1);
      // xóa yêu cầu → xóa tệp đã nộp
      const rq = (await reqOf(q, U.duy, hd))!;
      expect(await q("select id from user_documents where request_id = $1", [rq.id])).toHaveLength(1);
      await q("select delete_document_request($1)", [rq.id]);
      expect(await q("select id from user_documents where request_id = $1", [rq.id])).toHaveLength(0);
    });
  });

  it("tệp hồ sơ cũ (không gắn yêu cầu) vẫn truy cập như trước; doanh nghiệp khác không thấy mẫu / yêu cầu", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const id = (await q("select save_user_document($1, 'cu.pdf', 'application/pdf', $2) as id", [U.hieu, PDF]))[0]?.id as string;
      expect((await q("select request_id from user_documents where id = $1", [id]))[0]?.request_id).toBeNull();
      await as(U.hieu);
      expect(((await q("select get_user_document($1) as r", [id]))[0]?.r as { name: string }).name).toBe("cu.pdf");
      await as(U.phong);
      await expectError(q("select get_user_document($1)", [id]), /Không tìm thấy/);
      await as(U.ctv);
      expect(await q("select id from document_types")).toHaveLength(0);
      await as(U.outsider);
      expect(await q("select id from document_types where org_id = $1", [ORG])).toHaveLength(0);
      expect(await q("select id from document_requests where org_id = $1", [ORG])).toHaveLength(0);
    });
  });

  it("quản lý loại tài liệu: HR tạo / sửa / ngừng; tên trùng, định dạng sai bị từ chối; loại ngừng dùng không giao được", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const id = (await q("select save_document_type(null, 'Sơ yếu lý lịch', 'Có xác nhận địa phương', true, '{.PDF,docx}', 3, true) as id"))[0]?.id as string;
      expect((await q("select allowed_exts, max_mb from document_types where id = $1", [id]))[0]).toMatchObject({ allowed_exts: ["docx", "pdf"], max_mb: 3 });
      await expectError(q("select save_document_type(null, 'Sơ yếu lý lịch', null, true, '{pdf}', 5, true)"), /Đã có loại tài liệu/);
      await expectError(q("select save_document_type(null, 'X', null, true, '{pd f}', 5, true)"), /Định dạng/);
      await expectError(q("select save_document_type(null, 'X', null, true, '{pdf}', 9, true)"), /check|violates|max_mb/i);
      await q("select assign_document_request($1, $2, null, null, null)", [id, [U.hieu]]);
      await as(U.hieu);
      const rq = (await q("select id from document_requests where type_id = $1", [id]))[0]?.id as string;
      await expectError(q("select submit_my_document($1, 'a.pdf', 'application/pdf', $2)", [rq, Buffer.alloc(3 * 1048576 + 1).toString("base64")]), /3 MB/); // giới hạn theo loại
      await q("select submit_my_document($1, 'a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', $2)", [rq, Buffer.from("PK\u0003\u0004zzzz").toString("base64")]);
      await as(U.nhansu);
      await q("select save_document_type($1, 'Sơ yếu lý lịch', null, false, '{pdf}', 3, false)", [id]);
      await expectError(q("select assign_document_request($1, $2, null, null, null)", [id, [U.phong]]), /ngừng dùng/);
      expect(Boolean((await q("select is_required from document_types where id = $1", [id]))[0]?.is_required)).toBe(false);
    });
  });
});
