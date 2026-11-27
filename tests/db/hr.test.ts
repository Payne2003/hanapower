// Kiểm thử phân hệ Nhân sự trên CSDL thật: phòng ban – nhân viên – chức vụ, liên hệ, tài liệu, quyền theo phạm vi.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, ORG, OTHER_ORG, switchUser, U, type Q } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README.");
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});

const D = { admin: "00000000-0000-4000-b000-000000000001", content: "00000000-0000-4000-b000-000000000002", edit: "00000000-0000-4000-b000-000000000003" };

async function scenario(fn: (q: Q, as: (u: string | null) => Promise<void>) => Promise<void>) {
  await c.query("begin");
  try {
    await fn(makeQ(c), (u) => switchUser(c, u));
  } finally {
    await c.query("rollback");
  }
}
const pos = async (q: Q, name: string) => (await q("select id from positions where name = $1 and org_id = $2", [name, ORG]))[0]?.id as string;
const list = async (q: Q, args: { q?: string | null; dept?: string | null; position?: string | null; status?: string | null; unassigned?: boolean; sort?: string; dir?: string; limit?: number; offset?: number } = {}) =>
  (await q("select staff_list($1, $2, $3, $4, null, $5, $6, $7, $8, $9) as r", [args.q ?? null, args.dept ?? null, args.position ?? null, args.status ?? null, args.unassigned ?? false, args.sort ?? "name", args.dir ?? "asc", args.limit ?? 50, args.offset ?? 0]))[0]?.r as {
    total: number; rows: { id: string; code: string; name: string; assignments: { dept_id: string; positions: { id: string; name: string }[]; is_manager: boolean }[] }[];
  };
const summary = async (q: Q, dept: string | null = null, position: string | null = null) =>
  (await q("select staff_summary(null, $1, $2, null, null, false) as r", [dept, position]))[0]?.r as { total: number; by_position: { id: string; name: string; count: number }[]; by_department: { id: string; count: number }[]; by_status: Record<string, number> };

describe("Danh bạ nhân viên và thống kê", () => {
  it("mỗi người một dòng; mã NV tự sinh và duy nhất; cộng tác viên không nằm trong danh sách", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const r = await list(q);
      expect(r.total).toBe(10);
      expect(new Set(r.rows.map((x) => x.id)).size).toBe(r.rows.length);
      expect(r.rows.find((x) => x.id === U.ctv)).toBeUndefined();
      expect(new Set(r.rows.map((x) => x.code)).size).toBe(r.rows.length);
      expect(r.rows.every((x) => /^NV\d{4}$/.test(x.code))).toBe(true);
      // tạo hồ sơ mới tự có mã kế tiếp
      await c.query("reset role");
      await c.query("insert into auth.users (id, instance_id, aud, role, email) values ('00000000-0000-4000-c000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moi@hanamedia.local')");
      await c.query("insert into profiles (id, org_id, full_name, email) values ('00000000-0000-4000-c000-0000000000aa', $1, 'Nhân viên mới', 'moi@hanamedia.local')", [ORG]);
      const code = (await q("select employee_code from profiles where id = '00000000-0000-4000-c000-0000000000aa'"))[0]?.employee_code as string;
      expect(code).toMatch(/^NV\d{4}$/);
      expect(r.rows.map((x) => x.code)).not.toContain(code);
    });
  });

  it("tìm theo tên/mã, lọc trạng thái, sắp xếp và phân trang; tổng tính trên toàn bộ tập lọc", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      expect((await list(q, { q: "hiếu" })).rows.map((x) => x.name)).toEqual(["Hiếu"]);
      const byCode = (await list(q, { q: "NV0003" })).rows;
      expect(byCode.map((x) => x.id)).toEqual([U.hieu]);
      const p1 = await list(q, { limit: 4, offset: 0, sort: "code", dir: "desc" });
      const p2 = await list(q, { limit: 4, offset: 4, sort: "code", dir: "desc" });
      expect(p1.total).toBe(10);
      expect(p1.rows).toHaveLength(4);
      expect([...p1.rows, ...p2.rows].map((x) => x.code)).toEqual([...p1.rows, ...p2.rows].map((x) => x.code).sort().reverse());
      expect(p1.rows.some((x) => p2.rows.some((y) => y.id === x.id))).toBe(false);
      await c.query("reset role");
      await c.query("update profiles set employment_status = 'resigned', resigned_on = current_date where id = $1", [U.phong]);
      await as(U.leader);
      expect((await list(q, { status: "resigned" })).rows.map((x) => x.id)).toEqual([U.phong]);
      const s = await summary(q);
      expect(s.total).toBe(10);
      expect(s.by_status).toMatchObject({ working: 9, resigned: 1 });
      // tổng của bộ lọc không phụ thuộc phân trang
      expect((await q("select staff_summary(null, null, null, 'working', null, false) as r"))[0]?.r).toMatchObject({ total: 9 });
    });
  });
});

describe("Nhiều chức vụ và nhiều phòng ban", () => {
  it("giữ hai chức vụ cùng phòng: một dòng, một thành viên, thống kê theo từng chức vụ; thay thế / xóa chức vụ trong một giao dịch", async () => {
    await scenario(async (q, as) => {
      await as(U.admin);
      const content = await pos(q, "Content"), lead = await pos(q, "Trưởng nhóm");
      await q("select set_member_positions($1, $2, $3)", [D.content, U.hieu, [content, lead]]);
      const r = await list(q, { dept: D.content });
      expect(r.rows.filter((x) => x.id === U.hieu)).toHaveLength(1);
      const a = r.rows.find((x) => x.id === U.hieu)!.assignments.find((x) => x.dept_id === D.content)!;
      expect(a.positions.map((x) => x.name)).toEqual(["Content", "Trưởng nhóm"]); // đúng thứ tự sort_order
      expect(r.total).toBe(3); // không đếm trùng người
      const ov = (await q("select department_overview($1) as r", [D.content]))[0]?.r as { member_count: number; members: { id: string }[]; by_position: { name: string; count: number }[] };
      expect(ov.member_count).toBe(3);
      expect(ov.members.filter((m) => m.id === U.hieu)).toHaveLength(1);
      expect(ov.by_position.find((p) => p.name === "Trưởng nhóm")?.count).toBe(2); // Hiếu + Trưởng nhóm Bình
      expect(ov.by_position.find((p) => p.name === "Content")?.count).toBe(2); // Hiếu + Phong
      await expectError(q("insert into user_departments_positions (org_id, user_id, department_id, position_id) values ($1, $2, $3, $4)", [ORG, U.hieu, D.content, content]), /23505|permission denied/);
      // thứ tự mới + bỏ bớt
      await q("select set_member_positions($1, $2, $3)", [D.content, U.hieu, [lead]]);
      expect((await list(q, { dept: D.content })).rows.find((x) => x.id === U.hieu)!.assignments[0]!.positions.map((x) => x.name)).toEqual(["Trưởng nhóm"]);
      await q("select set_member_positions($1, $2, '{}')", [D.content, U.hieu]);
      const none = (await list(q, { dept: D.content })).rows.find((x) => x.id === U.hieu)!;
      expect(none.assignments[0]!.positions).toEqual([]); // vẫn là thành viên, chưa có chức vụ
      expect((await q("select count(*)::int n from user_departments_positions where user_id = $1 and department_id = $2", [U.hieu, D.content]))[0]?.n).toBe(1);
      await expectError(q("select set_member_positions($1, $2, $3)", [D.content, U.hieu, ["00000000-0000-4000-0000-00000000dead"]]), /Không tìm thấy chức vụ/);
    });
  });

  it("thuộc nhiều phòng: vẫn một dòng; lọc phòng + chức vụ phải khớp CÙNG một phân công", async () => {
    await scenario(async (q, as) => {
      await as(U.admin);
      const editor = await pos(q, "Editor"), content = await pos(q, "Content");
      await q("select add_department_member($1, $2, $3, false)", [D.edit, U.hieu, editor]); // Hiếu: Content ở phòng Content, Editor ở phòng Edit
      const all = await list(q);
      expect(all.rows.filter((x) => x.id === U.hieu)).toHaveLength(1);
      expect(all.rows.find((x) => x.id === U.hieu)!.assignments.map((x) => x.dept_id).sort()).toEqual([D.content, D.edit].sort());
      expect((await list(q, { dept: D.edit, position: editor })).rows.map((x) => x.id)).toContain(U.hieu);
      expect((await list(q, { dept: D.edit, position: content })).rows.map((x) => x.id)).not.toContain(U.hieu); // Content chỉ ở phòng Content
      expect((await list(q, { dept: D.content, position: content })).rows.map((x) => x.id)).toContain(U.hieu);
      expect((await list(q, { position: content })).rows.map((x) => x.id)).toContain(U.hieu);
      // thống kê chức vụ: một người thuộc nhiều nhóm chức vụ
      const s = await summary(q);
      expect(s.by_position.find((p) => p.name === "Editor")?.count).toBe(4);
      expect(s.by_department.find((d) => d.id === D.edit)?.count).toBe(4);
      expect(s.total).toBe(10);
      // gỡ khỏi một phòng: hồ sơ còn phòng kia
      await q("select remove_department_member($1, $2)", [D.edit, U.hieu]);
      expect((await list(q)).rows.find((x) => x.id === U.hieu)!.assignments.map((x) => x.dept_id)).toEqual([D.content]);
    });
  });

  it("phòng trống, phòng ngừng hoạt động: không thêm được thành viên mới", async () => {
    await scenario(async (q, as) => {
      await c.query("insert into departments (id, org_id, name) values ('00000000-0000-4000-b000-0000000000ee', $1, 'Phòng mới')", [ORG]);
      await as(U.admin);
      const empty = (await q("select department_overview('00000000-0000-4000-b000-0000000000ee') as r"))[0]?.r as { member_count: number; members: unknown[]; managers: unknown[]; by_position: unknown[] };
      expect(empty).toMatchObject({ member_count: 0, members: [], managers: [], by_position: [] });
      const dl = (await q("select department_list('Phòng mới') as r"))[0]?.r as { total: number; rows: { member_count: number; position_count: number }[] };
      expect(dl.total).toBe(1);
      expect(dl.rows[0]).toMatchObject({ member_count: 0, position_count: 0 });
      await q("select set_department_active('00000000-0000-4000-b000-0000000000ee', false)");
      await expectError(q("select add_department_member('00000000-0000-4000-b000-0000000000ee', $1, null, false)", [U.hieu]), /ngừng hoạt động/);
      expect(((await q("select department_list(null, false) as r"))[0]?.r as { total: number }).total).toBe(1);
    });
  });
});

describe("Quản lý phòng ban", () => {
  it("nhiều quản lý; chỉ thành viên mới làm quản lý; gỡ thành viên đồng thời chấm dứt quản lý và cập nhật trưởng phòng đại diện", async () => {
    await scenario(async (q, as) => {
      await as(U.admin);
      const lead = await pos(q, "Trưởng nhóm");
      await expectError(q("select add_department_manager($1, $2, $3)", [D.edit, U.hieu, lead]), /thành viên của phòng/);
      await q("select add_department_manager($1, $2, $3)", [D.edit, U.duy, lead]);
      await q("select add_department_manager($1, $2, null)", [D.edit, U.hoa]);
      const ov = (await q("select department_overview($1) as r", [D.edit]))[0]?.r as { managers: { id: string; position: string | null }[] };
      expect(ov.managers.map((m) => m.id).sort()).toEqual([U.duy, U.hoa].sort());
      expect((await list(q, { dept: D.edit })).rows.find((x) => x.id === U.duy)!.assignments[0]!.is_manager).toBe(true);
      const mgr = async () => (await q("select manager_id from departments where id = $1", [D.edit]))[0]?.manager_id;
      expect([U.duy, U.hoa]).toContain(await mgr());
      const first = await mgr();
      await q("select remove_department_member($1, $2)", [D.edit, first]);
      expect(await q("select 1 from department_managers where department_id = $1 and user_id = $2", [D.edit, first])).toHaveLength(0);
      expect(await mgr()).toBe(first === U.duy ? U.hoa : U.duy); // người còn lại thành đại diện
      await q("select remove_department_manager($1, $2)", [D.edit, first === U.duy ? U.hoa : U.duy]);
      expect(await mgr()).toBeNull();
      await expectError(q("select remove_department_manager($1, $2)", [D.edit, U.tien]), /không phải quản lý/);
      const log = await q("select action, details from audit_logs where entity_id = $1 order by id", [D.edit]);
      expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["department.manager_add", "department.member_remove", "department.manager_remove"]));
      expect(log.find((l) => l.action === "department.member_remove")?.details).toMatchObject({ was_manager: true });
    });
  });

  it("quyền thay đổi: quản trị và nhân sự được; quản lý, nhân viên thường không", async () => {
    await scenario(async (q, as) => {
      const content = await pos(q, "Content");
      await as(U.nhansu);
      await q("select set_member_positions($1, $2, $3)", [D.content, U.phong, [content]]);
      for (const u of [U.leader, U.hieu, U.truongnhom, U.ketoan, U.ctv]) {
        await as(u);
        await expectError(q("select set_member_positions($1, $2, $3)", [D.content, U.phong, [content]]), /42501|quyền|Chỉ quản trị/);
        await expectError(q("select add_department_manager($1, $2, null)", [D.content, U.phong]), /42501|Chỉ quản trị|Không tìm thấy/);
        await expectError(q("select set_department_active($1, false)", [D.content]), /42501|Chỉ quản trị|Không tìm thấy/);
      }
      await as(U.hieu);
      await expectError(q("update user_departments_positions set sort_order = 9 where user_id = $1", [U.phong]), /permission denied|row-level/i).catch(async () => {
        expect(await q("update user_departments_positions set sort_order = 9 where user_id = $1 returning 1", [U.phong])).toHaveLength(0);
      });
    });
  });
});

describe("Công việc của thành viên", () => {
  it("một task nhiều người được giao trong cùng phòng chỉ đếm một lần; quản lý phòng xem được, người ngoài phạm vi thì không", async () => {
    await scenario(async (q, as) => {
      await as(U.admin);
      const id = (await q("select save_task(null, 'Dựng teaser BelAZ', 'to_do', 'high', '2026-12-05T10:00:00+07', null, null, null, null, $1, null) as id", [[U.duy, U.hoa]]))[0]?.id as string;
      const r = (await q("select department_tasks($1) as r", [D.edit]))[0]?.r as { total: number; rows: { id: string; assignees: { name: string }[] }[] };
      const mine = r.rows.filter((x) => x.id === id);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.assignees.map((a) => a.name).sort()).toEqual(["Duy", "Hòa"]);
      const before = r.total;
      expect(r.rows.length).toBe(before);
      // quản lý phòng Edit (được thêm) thấy việc của thành viên; Content khác thì không
      await q("select add_department_manager($1, $2, null)", [D.edit, U.tien]);
      await as(U.tien);
      expect((await q("select id from tasks where id = $1", [id])).length).toBe(1);
      await as(U.phong);
      expect(await q("select id from tasks where id = $1", [id])).toHaveLength(0);
      expect(((await q("select department_tasks($1) as r", [D.edit]))[0]?.r as { total: number }).total).toBeLessThan(before);
    });
  });
});

describe("Liên hệ cá nhân", () => {
  it("email / điện thoại: mục đầu tự là chính, đổi chính trong một thao tác, xóa chính thì chuyển cho mục còn lại, email duy nhất toàn công ty", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      const e1 = (await q("select save_user_email(null, $1, 'Hieu.Ca.Nhan@gmail.com', false) as id", [U.hieu]))[0]?.id as string;
      const e2 = (await q("select save_user_email(null, $1, 'hieu.work@congty.vn', false) as id", [U.hieu]))[0]?.id as string;
      const prim = async () => (await q("select id from user_emails where user_id = $1 and is_primary", [U.hieu])).map((x) => x.id);
      expect(await prim()).toEqual([e1]); // mục đầu tự là chính
      await q("select set_primary_user_email($1)", [e2]);
      expect(await prim()).toEqual([e2]);
      await q("select save_user_email($1, $2, 'hieu.work@congty.vn', true)", [e1, U.hieu]).then(() => { throw new Error("phải lỗi trùng"); }, (e) => expect(String(e.message)).toMatch(/đã được dùng/));
      await expectError(q("select save_user_email(null, $1, 'khong-hop-le', false)", [U.hieu]), /Email không hợp lệ/);
      await q("select delete_user_email($1)", [e2]);
      expect(await prim()).toEqual([e1]);
      // điện thoại
      const p1 = (await q("select save_user_phone(null, $1, '+84', '0912 345 678', false) as id", [U.hieu]))[0]?.id as string;
      const p2 = (await q("select save_user_phone(null, $1, '+1', '4155550101', true) as id", [U.hieu]))[0]?.id as string;
      expect((await q("select id from user_phones where user_id = $1 and is_primary", [U.hieu])).map((x) => x.id)).toEqual([p2]);
      await expectError(q("select save_user_phone(null, $1, '+84', '09123456', false)", [U.hieu]).then(() => q("select save_user_phone(null, $1, '+84', '09123456', false)", [U.hieu])), /đã có trong hồ sơ/);
      await expectError(q("select save_user_phone(null, $1, '84', '0912345678', false)", [U.hieu]), /Mã quốc gia/);
      await q("select set_primary_user_phone($1)", [p1]);
      expect((await q("select id from user_phones where user_id = $1 and is_primary", [U.hieu])).map((x) => x.id)).toEqual([p1]);
      // email đã dùng bởi người khác bị từ chối
      await as(U.phong);
      await expectError(q("select save_user_email(null, $1, 'HIEU.work@congty.vn', false)", [U.phong]).then(() => q("select save_user_email(null, $1, 'hieu.ca.nhan@gmail.com', false)", [U.phong])), /đã được dùng/);
    });
  });

  it("phạm vi bản ghi: người khác không đọc / sửa / xóa liên hệ của nhân viên; nhân sự và quản trị thì được", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      const e = (await q("select save_user_email(null, $1, 'rieng.tu@gmail.com', false) as id", [U.hieu]))[0]?.id as string;
      const ph = (await q("select save_user_phone(null, $1, '+84', '0987654321', false) as id", [U.hieu]))[0]?.id as string;
      for (const u of [U.phong, U.leader, U.truongnhom, U.ketoan, U.ctv, U.outsider]) {
        await as(u);
        expect(await q("select id from user_emails where user_id = $1", [U.hieu])).toHaveLength(0);
        expect(await q("select id from user_phones where user_id = $1", [U.hieu])).toHaveLength(0);
        await expectError(q("select save_user_email(null, $1, 'xam.nhap@gmail.com', false)", [U.hieu]), /quyền|Không tìm thấy/);
        await expectError(q("select save_user_email($1, $2, 'sua@gmail.com', false)", [e, U.phong]), /quyền|Không tìm thấy/);
        await expectError(q("select delete_user_email($1)", [e]), /quyền|Không tìm thấy/);
        await expectError(q("select set_primary_user_phone($1)", [ph]), /quyền|Không tìm thấy/);
        await expectError(q("select delete_user_phone($1)", [ph]), /quyền|Không tìm thấy/);
      }
      await as(U.nhansu);
      expect(await q("select id from user_emails where user_id = $1", [U.hieu])).toHaveLength(1);
      await q("select save_user_email(null, $1, 'hr.them@gmail.com', true)", [U.hieu]);
      await as(U.admin);
      expect(await q("select id from user_emails where user_id = $1", [U.hieu])).toHaveLength(2);
    });
  });
});

describe("Tài liệu hồ sơ, thông tin cá nhân và hồ sơ công tác", () => {
  it("tải lên bởi nhân sự; xem bởi chính chủ; người khác bị từ chối ở cả danh sách lẫn hàm tải; giới hạn 5 MB", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      const b64 = Buffer.from("%PDF-1.4 hợp đồng lao động").toString("base64");
      const id = (await q("select save_user_document($1, 'Hop-dong-lao-dong.pdf', 'application/pdf', $2) as id", [U.hieu, b64]))[0]?.id as string;
      await expectError(q("select save_user_document($1, 'lon.bin', 'application/octet-stream', $2)", [U.hieu, Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")]), /5 MB/);
      await expectError(q("select save_user_document($1, 'x', 'text/plain', '')", [U.hieu]), /rỗng|không hợp lệ/);
      const dl = (await q("select get_user_document($1) as r", [id]))[0]?.r as { name: string; size: number; content: string };
      expect(dl.name).toBe("Hop-dong-lao-dong.pdf");
      expect(Buffer.from(dl.content, "base64").toString()).toContain("hợp đồng lao động");
      await as(U.hieu);
      expect((await q("select name, size_bytes from user_documents where user_id = $1", [U.hieu]))[0]).toMatchObject({ name: "Hop-dong-lao-dong.pdf" });
      expect(((await q("select get_user_document($1) as r", [id]))[0]?.r as { name: string }).name).toBe("Hop-dong-lao-dong.pdf");
      await expectError(q("select save_user_document($1, 'tu-tai.pdf', 'application/pdf', $2)", [U.hieu, b64]), /42501|Chỉ quản trị|Không tìm thấy/); // chính chủ không tự tải lên
      for (const u of [U.phong, U.leader, U.truongnhom, U.ketoan, U.ctv, U.outsider]) {
        await as(u);
        expect(await q("select id from user_documents where id = $1", [id])).toHaveLength(0);
        await expectError(q("select get_user_document($1)", [id]), /Không tìm thấy/);
        await expectError(q("select delete_user_document($1)", [id]), /42501|Chỉ quản trị|Không tìm thấy/);
        await expectError(q("select content from user_document_files"), /permission denied/); // không đọc thẳng bảng nội dung
      }
      await as(U.nhansu);
      await q("select delete_user_document($1)", [id]);
      expect(await q("select id from user_documents where id = $1", [id])).toHaveLength(0);
    });
  });

  it("thông tin cá nhân nhạy cảm chỉ chính chủ + nhân sự/quản trị; hồ sơ công tác: mã NV duy nhất, trạng thái nghỉ việc, quyền sửa", async () => {
    await scenario(async (q, as) => {
      await as(U.nhansu);
      await q("select save_staff_personal($1, '1995-04-12', 'male', '12 Lê Lợi, Q.1', '079095001234', '8012345678')", [U.hieu]);
      await expectError(q("select save_staff_personal($1, '2999-01-01', null, null, null, null)", [U.hieu]), /Ngày sinh/);
      await as(U.hieu);
      expect((await q("select tax_code from staff_personal where user_id = $1", [U.hieu]))[0]?.tax_code).toBe("8012345678");
      for (const u of [U.phong, U.leader, U.truongnhom, U.ketoan, U.ctv, U.outsider]) {
        await as(u);
        expect(await q("select user_id from staff_personal where user_id = $1", [U.hieu])).toHaveLength(0);
        await expectError(q("select save_staff_personal($1, null, null, null, null, null)", [U.hieu]), /42501|Chỉ quản trị|Không tìm thấy/);
        await expectError(q("select save_staff_profile($1, 'NV9999', 'working', 'office', 'official', null, null)", [U.hieu]), /42501|Chỉ quản trị|Không tìm thấy/);
      }
      await as(U.admin);
      expect((await q("select details from audit_logs where action = 'staff.personal' order by id desc limit 1"))[0]?.details).toEqual({}); // nhật ký không chứa dữ liệu nhạy cảm
      await as(U.nhansu);
      await q("select save_staff_profile($1, 'NV-HIEU', 'on_leave', 'hybrid', 'probation', '2025-01-02', null)", [U.hieu]);
      await expectError(q("select save_staff_profile($1, 'nv-hieu', 'working', 'office', 'official', null, null)", [U.phong]), /đã được dùng/);
      await expectError(q("select save_staff_profile($1, '', 'working', 'office', 'official', null, null)", [U.hieu]), /Nhập mã/);
      await q("select save_staff_profile($1, 'NV-HIEU', 'resigned', 'hybrid', 'probation', '2025-01-02', null)", [U.hieu]);
      expect((await q("select employment_status, resigned_on is not null as has_date, work_form, employment_type from profiles where id = $1", [U.hieu]))[0]).toMatchObject({ employment_status: "resigned", has_date: true, work_form: "hybrid", employment_type: "probation" });
      await expectError(q("select save_staff_profile($1, 'NV-HIEU', 'resigned', 'office', 'official', '2025-01-02', '2024-01-01')", [U.hieu]), /sau ngày vào làm/);
    });
  });

  it("cộng tác viên và doanh nghiệp khác không thấy danh bạ / phòng ban / chức vụ", async () => {
    await scenario(async (q, as) => {
      await as(U.ctv);
      expect((await list(q)).total).toBe(0);
      expect(((await q("select department_list() as r"))[0]?.r as { total: number }).total).toBe(0);
      await as(U.outsider);
      expect((await list(q)).rows.filter((x) => x.id === U.hieu)).toHaveLength(0);
      const dl = (await q("select department_list() as r"))[0]?.r as { rows: { id: string }[] };
      expect(dl.rows.map((r) => r.id)).not.toContain(D.content);
      expect(await q("select id from departments where org_id = $1", [ORG])).toHaveLength(0);
      void OTHER_ORG;
    });
  });
});
