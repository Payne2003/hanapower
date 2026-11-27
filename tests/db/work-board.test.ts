// Kiểm thử Bảng công việc trên CSDL thật: đầu việc video tự đồng bộ theo bước sản xuất, không kéo/sửa tay được,
// quyền xem, đặt lịch, và kịch bản BelAZ (giao dựng → nộp duyệt → sửa → duyệt → chờ đăng).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { DB_URL, expectError, makeQ, newClient, switchUser, U, V, type Q } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README.");
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
type T = { id: string; status: string; kind: string; scheduled_at: string | null; title: string };
const vt = async (q: Q, video: string, kind: "content" | "edit") =>
  (await q("select id, status, kind, scheduled_at, title from tasks where video_id = $1 and kind = $2 and deleted_at is null", [video, kind]))[0] as T | undefined;
const assignees = async (q: Q, task: string) => (await q("select user_id from task_assignees where task_id = $1 order by user_id", [task])).map((r) => r.user_id);

describe("Đầu việc video tự đồng bộ", () => {
  it("mỗi video có đúng 2 đầu việc (Content, Edit), trạng thái theo bước, người phụ trách theo phân công", async () => {
    await scenario(async (q, as) => {
      await as(U.admin);
      const n = await q("select video_id, count(*)::int n, count(distinct kind)::int k from tasks where video_id is not null and deleted_at is null group by 1");
      expect(n.length).toBeGreaterThanOrEqual(12);
      expect(n.every((r) => r.n === 2 && r.k === 2)).toBe(true);
      const expect_ = async (v: number, content: string, edit: string) => {
        expect((await vt(q, V(v), "content"))?.status).toBe(content);
        expect((await vt(q, V(v), "edit"))?.status).toBe(edit);
      };
      await expect_(1, "in_progress", "not_started"); // chuẩn bị, đã làm dở hạng mục
      await expect_(2, "completed", "in_progress"); // đang dựng
      await expect_(8, "completed", "not_started"); // chờ Editor xác nhận bàn giao
      await expect_(10, "completed", "in_progress"); // chờ duyệt vẫn "Đang tiến hành"
      await expect_(11, "completed", "completed"); // chờ đăng
      await expect_(12, "completed", "completed"); // đã đăng
      const t2 = await vt(q, V(2), "edit");
      expect(await assignees(q, t2!.id)).toEqual([U.duy]);
      expect(await assignees(q, (await vt(q, V(2), "content"))!.id)).toEqual([U.hieu]);
    });
  });

  it("cập nhật hạng mục Content → việc Content chuyển 'Đang tiến hành'; chạy đồng bộ lại không tạo trùng", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await q("select update_content($1, 'doing','todo','todo','todo', null, null)", [V(1)]);
      await as(U.admin);
      expect((await vt(q, V(1), "content"))?.status).toBe("in_progress");
      await c.query("reset role");
      await q("select app.sync_video_tasks($1)", [V(1)]);
      await q("select app.sync_video_tasks($1)", [V(1)]);
      expect(await q("select id from tasks where video_id = $1 and deleted_at is null", [V(1)])).toHaveLength(2);
      await expectError(q("insert into tasks (org_id, title, video_id, kind) select org_id, 'trùng', video_id, kind from tasks where video_id = $1 and kind = 'edit' limit 1", [V(1)]), "23505");
    });
  });

  it("tạo video mới sinh ngay 2 đầu việc; đổi Editor đổi người phụ trách; tạm dừng → Hoãn; hủy → Đã hủy", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const r = (await q("select create_video('Báo đốm và cá sấu', null, null, $1, $2) as r", [U.phong, U.hoa]))[0]?.r as { id: string };
      expect((await vt(q, r.id, "content"))?.title).toBe("Chuẩn bị nội dung Báo đốm và cá sấu");
      expect(await assignees(q, (await vt(q, r.id, "edit"))!.id)).toEqual([U.hoa]);
      await q("select assign_video($1, $2, $3)", [r.id, U.phong, U.tien]);
      expect(await assignees(q, (await vt(q, r.id, "edit"))!.id)).toEqual([U.tien]);
      await q("select set_video_hold($1, 'hold', 'Chờ khách')", [r.id]);
      expect((await vt(q, r.id, "edit"))?.status).toBe("deferred");
      await q("select set_video_hold($1, 'resume')", [r.id]);
      expect((await vt(q, r.id, "edit"))?.status).toBe("not_started");
      await q("select set_video_hold($1, 'cancel', 'Khách hủy')", [r.id]);
      expect((await vt(q, r.id, "content"))?.status).toBe("cancelled");
    });
  });
});

describe("Không bỏ qua quy trình bằng thao tác công việc", () => {
  it("đầu việc video không đổi trạng thái / sửa / xóa trực tiếp, kể cả Leader và quản trị", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const t = (await vt(q, V(2), "edit"))!;
      await expectError(q("select set_task_status($1, 'completed')", [t.id]), "bước sản xuất");
      await expectError(q("select save_task($1, 'đổi tên', 'to_do', 'normal', null, null, null, null, null, '{}')", [t.id]), "Đầu việc của video");
      await expectError(q("select delete_task($1)", [t.id]), "không xóa được");
      await expectError(q("select set_task_assignees($1, $2)", [t.id, [U.tien]]), "trang Video");
      await as(U.duy); // Editor được giao cũng không tự đóng việc
      await expectError(q("select set_task_status($1, 'completed')", [t.id]), "bước sản xuất");
      expect(await q("update tasks set status = 'completed' where id = $1 returning id", [t.id])).toHaveLength(0); // RLS: không có chính sách UPDATE
      await as(U.leader); // quản lý CRM có chính sách ghi bảng tasks nhưng vẫn bị chặn ghi trực tiếp lên đầu việc video
      await expectError(q("update tasks set status = 'completed' where id = $1", [t.id]), /Đầu việc của video/);
      await expectError(q("insert into tasks (org_id, title, video_id, kind) values ('00000000-0000-4000-a000-000000000001', 'giả', $1, 'content')", [V(3)]), /do hệ thống tạo|23505/);
      await as(U.admin);
      expect((await vt(q, V(2), "edit"))?.status).toBe("in_progress");
    });
  });

  it("việc độc lập vẫn dùng như cũ: tạo nhiều người phụ trách, đổi trạng thái, quyền người ngoài", async () => {
    await scenario(async (q, as) => {
      await as(U.truongnhom);
      const id = (await q("select save_task(null, 'Gọi khách BelAZ', 'call', 'high', null, null, null, null, null, $1, null) as id", [[U.hieu, U.duy]]))[0]?.id as string;
      expect(await assignees(q, id)).toEqual([U.hieu, U.duy].sort());
      await as(U.duy);
      expect(await q("select id from tasks where id = $1", [id])).toHaveLength(1);
      await q("select set_task_status($1, 'in_progress')", [id]);
      await as(U.hoa); // không liên quan: không thấy, không sửa được
      expect(await q("select id from tasks where id = $1", [id])).toHaveLength(0);
      await expectError(q("select set_task_status($1, 'completed')", [id]), /Không tìm thấy|quyền/);
      await as(U.truongnhom);
      await q("select set_task_assignees($1, $2)", [id, [U.hoa]]);
      expect(await assignees(q, id)).toEqual([U.hoa]);
      await q("select delete_task($1)", [id]);
      expect(await q("select id from tasks where id = $1", [id])).toHaveLength(0);
    });
  });

  it("đặt lịch: Leader cho đầu việc video, người tạo cho việc độc lập; Editor không đổi lịch video; ngày sai bị từ chối", async () => {
    await scenario(async (q, as) => {
      await as(U.duy);
      const t = (await vt(q, V(2), "edit"))!;
      await expectError(q("select set_task_schedule($1, null, '2026-12-04T17:00:00+07')", [t.id]), "Chỉ Leader");
      await as(U.leader);
      await expectError(q("select set_task_schedule($1, '2026-12-10', '2026-12-04T17:00:00+07')", [t.id]), "sau ngày bắt đầu");
      await q("select set_task_schedule($1, '2026-12-01', '2026-12-04T17:00:00+07')", [t.id]);
      const after = (await vt(q, V(2), "edit"))!;
      expect(new Date(after.scheduled_at!).toISOString()).toBe("2026-12-04T10:00:00.000Z");
      // đồng bộ sau này không ghi đè lịch Leader đã đặt
      await as(U.duy);
      await q("select update_edit($1, 40, null, null)", [V(2)]);
      await as(U.leader);
      expect(new Date((await vt(q, V(2), "edit"))!.scheduled_at!).toISOString()).toBe("2026-12-04T10:00:00.000Z");
      expect((await q("select start_date::text d from tasks where id = $1", [t.id]))[0]?.d).toBe("2026-12-01");
    });
  });
});

describe("Ai thấy đầu việc nào", () => {
  it("Leader thấy hết; Content/Editor chỉ thấy việc mình; cộng tác viên và doanh nghiệp khác không thấy", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      expect((await q("select id from tasks where video_id = $1", [V(2)])).length).toBe(2);
      await as(U.duy);
      expect((await q("select kind from tasks where video_id = $1", [V(2)])).map((r) => r.kind)).toEqual(["edit"]);
      await as(U.hieu);
      expect((await q("select kind from tasks where video_id = $1", [V(2)])).map((r) => r.kind)).toEqual(["content"]);
      await as(U.phong); // Content khác, không dính video này
      expect(await q("select id from tasks where video_id = $1", [V(2)])).toHaveLength(0);
      await as(U.ctv);
      expect(await q("select id from tasks where video_id is not null")).toHaveLength(0);
      await as(U.outsider);
      expect(await q("select id from tasks where org_id = '00000000-0000-4000-a000-000000000001'")).toHaveLength(0);
    });
  });
});

describe("Kịch bản BelAZ trọn vòng", () => {
  it("Leader giao dựng thứ Sáu → Editor dựng 65% → nộp duyệt → Leader yêu cầu sửa → nộp lại → duyệt → Chờ đăng → đăng", async () => {
    await scenario(async (q, as) => {
      // 1. Leader đặt lịch thứ Sáu cho việc dựng của video đang dựng
      await as(U.leader);
      const t = (await vt(q, V(2), "edit"))!;
      await q("select set_task_schedule($1, null, '2026-12-04T17:00:00+07')", [t.id]);

      // 2. Editor thấy việc, cập nhật 65% + link bản dựng; việc vẫn "Đang tiến hành", Leader thấy 65%
      await as(U.duy);
      expect((await vt(q, V(2), "edit"))?.status).toBe("in_progress");
      await q("select update_edit($1, 65, 'https://drive.google.com/file/d/belaz-v1', 'Đã dựng xong phần mở đầu')", [V(2)]);
      await as(U.leader);
      expect((await q("select edit_progress from videos where id = $1", [V(2)]))[0]?.edit_progress).toBe(65);

      // 3. Nộp duyệt: video "Chờ duyệt", việc dựng vẫn "Đang tiến hành"
      await as(U.duy);
      await q("select update_edit($1, 100, 'https://drive.google.com/file/d/belaz-v1', null)", [V(2)]);
      await q("select submit_for_review($1, 'Mời anh duyệt')", [V(2)]);
      expect((await q("select stage from videos where id = $1", [V(2)]))[0]?.stage).toBe("review");
      expect((await vt(q, V(2), "edit"))?.status).toBe("in_progress");

      // Editor không tự duyệt được
      await expectError(q("select review_video($1, 'approve', null)", [V(2)]), /42501|quyền/);

      // 4. Leader yêu cầu sửa: Editor thấy ghi chú + số lần sửa
      await as(U.leader);
      await q("select review_video($1, 'revise', 'Sửa thông số ở cảnh 167')", [V(2)]);
      await as(U.duy);
      const v = (await q("select stage, review_note, revision_count from videos where id = $1", [V(2)]))[0];
      expect(v).toMatchObject({ stage: "editing", review_note: "Sửa thông số ở cảnh 167", revision_count: 1 });
      expect((await vt(q, V(2), "edit"))?.status).toBe("in_progress");

      // 5. Nộp lại → duyệt → việc dựng "Xong", video "Chờ đăng" (chưa "Đã đăng")
      await q("select submit_for_review($1, null)", [V(2)]);
      await as(U.leader);
      await q("select review_video($1, 'approve', null)", [V(2)]);
      expect((await q("select stage from videos where id = $1", [V(2)]))[0]?.stage).toBe("ready");
      expect((await vt(q, V(2), "edit"))?.status).toBe("completed");
      // lịch Leader đặt giữ nguyên suốt vòng đời
      expect(new Date((await vt(q, V(2), "edit"))!.scheduled_at!).toISOString()).toBe("2026-12-04T10:00:00.000Z");

      // 6. "Đã đăng" chỉ qua xác nhận đăng; việc vẫn Xong
      await q("select publish_video($1, 'https://www.youtube.com/watch?v=belaz', current_date, null)", [V(2)]);
      expect((await q("select stage from videos where id = $1", [V(2)]))[0]?.stage).toBe("published");
      expect((await vt(q, V(2), "edit"))?.status).toBe("completed");
    });
  });
});

describe("Nhóm công việc", () => {
  it("tạo / đổi tên / xếp nhóm / xóa nhóm; trùng tên và cộng tác viên bị từ chối; đầu việc video xếp nhóm được nhưng trạng thái giữ nguyên", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      const g = (await q("select save_task_group(null, 'Quay phim') as id"))[0]?.id as string;
      await expectError(q("select save_task_group(null, 'Quay phim')"), /Đã có nhóm/);
      await expectError(q("select save_task_group(null, '   ')"), /1 đến 60/);
      await q("select save_task_group($1, 'Quay & chụp')", [g]);
      const t = (await vt(q, V(2), "edit"))!;
      await q("select set_task_group($1, $2)", [t.id, g]);
      expect((await q("select group_id, status from tasks where id = $1", [t.id]))[0]).toMatchObject({ group_id: g, status: "in_progress" });
      // sync sau này không làm mất nhóm
      await as(U.duy);
      await q("select update_edit($1, 50, null, null)", [V(2)]);
      expect((await q("select group_id from tasks where id = $1", [t.id]))[0]?.group_id).toBe(g);
      // Editor không phải người tạo nhóm: không xóa được; không xếp được việc của người khác
      await expectError(q("select delete_task_group($1)", [g]), /Chỉ người tạo/);
      const other = (await vt(q, V(4), "edit"))?.id; // Editor của D0004 là Hoa → Duy không thấy
      expect(other).toBeUndefined();
      await as(U.ctv);
      await expectError(q("select save_task_group(null, 'CTV')"), /quyền/);
      expect(await q("select id from task_groups")).toHaveLength(0);
      await as(U.leader);
      await q("select delete_task_group($1)", [g]);
      expect((await q("select group_id from tasks where id = $1", [t.id]))[0]?.group_id).toBeNull(); // việc còn nguyên
      await as(U.outsider);
      expect(await q("select id from task_groups where org_id = '00000000-0000-4000-a000-000000000001'")).toHaveLength(0);
    });
  });
});

describe("Liên kết dự án", () => {
  it("việc độc lập gắn / đổi / bỏ dự án; dự án lạ hoặc không được xem bị từ chối; đầu việc video theo dự án của video", async () => {
    await scenario(async (q, as) => {
      const proj = (await q("insert into projects (org_id, code, name, manager_id) values ('00000000-0000-4000-a000-000000000001', 'DA-TEST', 'Phim BelAZ', $1) returning id", [U.leader]))[0]?.id as string;
      await as(U.leader);
      const id = (await q("select save_task(null, 'Chốt kịch bản', 'to_do', 'normal', null, null, null, 'project', $1, $2, null) as id", [proj, [U.hieu]]))[0]?.id as string;
      expect((await q("select related_type, related_id from tasks where id = $1", [id]))[0]).toMatchObject({ related_type: "project", related_id: proj });
      // related_type 'project' nhưng không chọn dự án → không để lại liên kết mồ côi
      const id2 = (await q("select save_task(null, 'Việc không dự án', 'to_do', 'normal', null, null, null, 'project', null, '{}', null) as id"))[0]?.id as string;
      expect((await q("select related_type from tasks where id = $1", [id2]))[0]?.related_type).toBeNull();
      await expectError(q("select save_task(null, 'x', 'to_do', 'normal', null, null, null, 'project', gen_random_uuid(), '{}', null)"), /Dự án không hợp lệ/);
      await q("select set_task_project($1, null)", [id]);
      expect((await q("select related_id from tasks where id = $1", [id]))[0]?.related_id).toBeNull();
      await q("select set_task_project($1, $2)", [id, proj]);
      // đầu việc video: đổi dự án ở trang Video, không đổi trực tiếp
      const t = (await vt(q, V(2), "edit"))!;
      await expectError(q("select set_task_project($1, $2)", [t.id, proj]), /trang Video/);
      // người không phải thành viên / quản lý dự án không liên kết được
      await as(U.hieu);
      await expectError(q("select save_task(null, 'x', 'to_do', 'normal', null, null, null, 'project', $1, '{}', null)", [proj]), /Dự án không hợp lệ/);
    });
  });
});
