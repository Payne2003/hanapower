// Kiểm thử lát cắt 1 trên CSDL thật (Supabase Postgres + migration + seed):
// phân quyền (được phép / bị từ chối), tiến độ có trọng số, báo cáo ngày idempotent, duyệt/trả lại.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { expectError, newClient, P, T, U, withUser, switchUser, makeQ, DB_URL } from "./helpers";

let c: pg.Client;

beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README (chạy Supabase cục bộ rồi đặt DATABASE_URL).");
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});

const stats = (q: (s: string, p?: unknown[]) => Promise<Record<string, unknown>[]>, project: string) =>
  q("select progress::float as progress, total_tasks, done_tasks, review_tasks, blocked_tasks, overdue_tasks from project_stats where project_id = $1", [project]).then((r) => r[0]);

describe("Tiến độ dự án có trọng số", () => {
  it("tính Σ(tiến độ × trọng số)/Σ trọng số, loại việc đã hủy", async () => {
    await withUser(c, U.pm1, async (q) => {
      const s = await stats(q, P.solar);
      // (100×1 + 60×2 + 40×1 + 0×1) / 5 = 52 ; việc hủy (10%) bị loại
      expect(s).toMatchObject({ progress: 52, total_tasks: 4, done_tasks: 1, blocked_tasks: 1, overdue_tasks: 1 });
    });
  });

  it("dự án chưa có việc hợp lệ → progress NULL", async () => {
    await withUser(c, U.pm1, async (q) => {
      const s = await stats(q, P.empty);
      expect(s).toMatchObject({ progress: null, total_tasks: 0 });
    });
  });

  it("trọng số phải > 0", async () => {
    await withUser(c, U.pm1, async (q) => {
      await expectError(q("select create_task($1, 'X', $2, null, 'medium', null, 0)", [P.solar, U.emp1]), "Trọng số");
    });
  });
});

describe("Phân quyền dự án và công việc", () => {
  it("nhân viên không tạo được dự án; quản lý dự án tạo được và tự thành thành viên quản lý", async () => {
    await withUser(c, U.emp1, async (q) => {
      await expectError(q("select create_project('Dự án lén')"), "42501");
    });
    await withUser(c, U.pm1, async (q) => {
      const [{ id }] = (await q("select create_project('Dự án thử', 'mô tả', null, null, null, null, $1::uuid[]) as id", [[U.emp2]])) as { id: string }[];
      const members = await q("select user_id, member_role from project_members where project_id = $1 order by member_role", [id]);
      expect(members).toEqual([
        { user_id: U.pm1, member_role: "manager" },
        { user_id: U.emp2, member_role: "member" },
      ]);
      const audit = await q("select count(*)::int as n from audit_logs");
      expect(audit[0]?.n).toBe(0); // QLDA không có quyền xem nhật ký kiểm toán
    });
  });

  it("chỉ quản lý dự án được giao việc, và chỉ cho thành viên dự án", async () => {
    await withUser(c, U.emp1, async (q) => {
      await expectError(q("select create_task($1, 'Việc lén', $2)", [P.solar, U.emp1]), "42501");
    });
    await withUser(c, U.pm2, async (q) => {
      await expectError(q("select create_task($1, 'Việc chéo dự án', $2)", [P.solar, U.emp1]), "42501");
    });
    await withUser(c, U.pm1, async (q) => {
      await expectError(q("select create_task($1, 'Giao cho người ngoài dự án', $2)", [P.solar, U.emp3]), "thành viên dự án");
      const [row] = (await q("select create_task($1, 'Đo điện trở tiếp địa', $2, null, 'high', null, 2) as id", [P.solar, U.emp1])) as { id: string }[];
      const [task] = await q("select status, progress, weight::float from tasks where id = $1", [row!.id]);
      expect(task).toEqual({ status: "todo", progress: 0, weight: 2 });
    });
  });

  it("không đọc chéo dự án: thành viên DA2 không thấy dự án/công việc DA1", async () => {
    await withUser(c, U.emp3, async (q) => {
      expect(await q("select id from projects where id = $1", [P.solar])).toHaveLength(0);
      expect(await q("select id from tasks where project_id = $1", [P.solar])).toHaveLength(0);
      expect(await q("select project_id from project_stats where project_id = $1", [P.solar])).toHaveLength(0);
      expect((await q("select id from projects")).map((r) => r.id)).toEqual([P.scada]);
    });
  });

  it("không đọc/ghi chéo doanh nghiệp", async () => {
    await withUser(c, U.outsider, async (q) => {
      // người ngoài là quản trị hệ thống ở doanh nghiệp khác: vẫn không thấy gì của doanh nghiệp 1
      expect(await q("select id from projects where org_id <> '00000000-0000-4000-a000-000000000002'")).toHaveLength(0);
      expect(await q("select id from profiles where org_id = '00000000-0000-4000-a000-000000000001'")).toHaveLength(0);
      await expectError(q("select create_task($1, 'x', $2)", [P.solar, U.outsider]), "42501");
      await expectError(q("select approve_task($1)", [T.design]), "Không tìm thấy");
    });
    await withUser(c, U.admin, async (q) => {
      expect(await q("select id from projects where id = $1", [P.other])).toHaveLength(0);
    });
  });

  it("CSDL chặn liên kết nhầm doanh nghiệp kể cả khi ghi trực tiếp", async () => {
    // Dùng quyền chủ sở hữu (bỏ qua RLS) để chứng minh ràng buộc khóa ngoại tự chặn.
    await c.query("begin");
    try {
      const q = makeQ(c);
      await expectError(
        q("insert into tasks (org_id, project_id, title, assignee_id) values ('00000000-0000-4000-a000-000000000002', $1, 'x', $2)", [P.solar, U.outsider]),
        "23503",
      );
      await expectError(
        q("insert into project_members (org_id, project_id, user_id) values ('00000000-0000-4000-a000-000000000001', $1, $2)", [P.solar, U.outsider]),
        "23503",
      );
    } finally {
      await c.query("rollback");
    }
  });

  it("anon không đọc được dữ liệu", async () => {
    await withUser(c, null, async (q) => {
      await expectError(q("select * from projects"), "permission denied");
      await expectError(q("select get_my_context()"), "permission denied");
    });
  });

  it("người dùng không được UPDATE/INSERT trực tiếp vào bảng nghiệp vụ", async () => {
    await withUser(c, U.emp1, async (q) => {
      await expectError(q("update tasks set progress = 100 where id = $1", [T.estimate]), "permission denied");
      await expectError(q("insert into daily_reports (org_id, user_id, report_date) values ('00000000-0000-4000-a000-000000000001', $1, current_date)", [U.emp1]), "permission denied");
      await expectError(q("select app.apply_progress($1, 100, null, null, 'manual', null)", [T.estimate]), "permission denied");
    });
  });

  it("tài khoản bị khóa mất quyền truy cập", async () => {
    await c.query("begin");
    try {
      await c.query("update profiles set is_active = false where id = $1", [U.emp1]);
      await switchUser(c, U.emp1);
      const q = makeQ(c);
      expect(await q("select id from tasks")).toHaveLength(0);
      await expectError(q("select update_task_progress($1, 50)", [T.estimate]), "Không tìm thấy");
    } finally {
      await c.query("rollback");
    }
  });
});

describe("Cập nhật nhanh, duyệt và trả lại", () => {
  it("chỉ người phụ trách cập nhật tiến độ; 100% → Chờ duyệt, chưa tính hoàn tất", async () => {
    await withUser(c, U.emp2, async (q) => {
      await expectError(q("select update_task_progress($1, 80)", [T.estimate]), "Chỉ người phụ trách");
      expect((await q("select update_task_progress($1, 100, 'Xong bản vẽ') as s", [T.design]))[0]?.s).toBe("in_review");
      const s = await stats(q, P.solar);
      // (100 + 100×2 + 40 + 0)/5 = 68 ; done vẫn = 1
      expect(s).toMatchObject({ progress: 68, done_tasks: 1, review_tasks: 1 });
      // người phụ trách không tự duyệt được
      await expectError(q("select approve_task($1)", [T.design]), "42501");
    });
  });

  it("quản lý duyệt → Hoàn tất, tăng số việc hoàn tất, ghi nhật ký; duyệt lặp lại không đổi", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp2);
      const q = makeQ(c);
      await q("select update_task_progress($1, 100)", [T.design]);
      await switchUser(c, U.pm1);
      await q("select approve_task($1, 'Đạt')", [T.design]);
      await q("select approve_task($1)", [T.design]);
      expect(await stats(q, P.solar)).toMatchObject({ done_tasks: 2, review_tasks: 0, progress: 68 });
      const ev = await q("select event_type from task_events where task_id = $1 and event_type = 'approve'", [T.design]);
      expect(ev).toHaveLength(1);
      await switchUser(c, U.admin);
      const audit = await q("select action, actor_id from audit_logs where entity_id = $1", [T.design]);
      expect(audit).toEqual([{ action: "task.approve", actor_id: U.pm1 }]);
    } finally {
      await c.query("rollback");
    }
  });

  it("trả lại cần lý do, đưa việc về Đang làm và lưu lý do", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp2);
      const q = makeQ(c);
      await q("select update_task_progress($1, 100)", [T.design]);
      await switchUser(c, U.pm1);
      await expectError(q("select return_task($1, '  ')", [T.design]), "lý do");
      await q("select return_task($1, 'Thiếu sơ đồ chuỗi khu B', 85)", [T.design]);
      expect((await q("select status, progress, return_reason from tasks where id = $1", [T.design]))[0]).toEqual({
        status: "in_progress", progress: 85, return_reason: "Thiếu sơ đồ chuỗi khu B",
      });
    } finally {
      await c.query("rollback");
    }
  });

  it("giao lại việc ghi nhật ký kiểm toán", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.pm1);
      const q = makeQ(c);
      await q("select reassign_task($1, $2)", [T.permit, U.emp2]);
      await switchUser(c, U.admin);
      expect(await q("select action, details->>'to' as to from audit_logs where entity_id = $1", [T.permit])).toEqual([
        { action: "task.reassign", to: U.emp2 },
      ]);
    } finally {
      await c.query("rollback");
    }
  });
});

describe("Báo cáo ngày", () => {
  const items = (arr: { task: string; progress: number; result?: string; blocker?: string | null }[]) =>
    JSON.stringify(arr.map((x) => ({ task_id: x.task, progress: x.progress, result: x.result ?? "", blocker: x.blocker ?? null })));

  it("lưu nháp không đổi công việc; gửi cập nhật công việc + lịch sử trong một giao dịch", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp1);
      const q = makeQ(c);
      const draft = await q("select save_daily_report_draft(null, 'Ngày làm việc tại công trường', $1::jsonb) as r", [
        items([{ task: T.estimate, progress: 70, result: "Đã có báo giá 2/3 hạng mục" }]),
      ]);
      expect((draft[0]?.r as { status: string }).status).toBe("draft");
      expect((await q("select progress from tasks where id = $1", [T.estimate]))[0]?.progress).toBe(40);

      const res = await q("select submit_daily_report(null, 'Ngày làm việc tại công trường', $1::jsonb) as r", [
        items([
          { task: T.estimate, progress: 70, result: "Đã có báo giá 2/3 hạng mục", blocker: "" },
          { task: T.permit, progress: 100, result: "Đã nộp hồ sơ" },
          { task: T.historian, progress: 20, result: "Cài hệ điều hành", blocker: "Thiếu giấy phép phần mềm" },
        ]),
      ]);
      const r = res[0]?.r as { already_submitted: boolean; items: number; report_id: string };
      expect(r).toMatchObject({ already_submitted: false, items: 3 });

      const tasks = await q("select id, progress, status, is_blocked, blocker_note from tasks where id = any($1) order by id", [[T.estimate, T.permit, T.historian]]);
      expect(tasks).toEqual([
        { id: T.estimate, progress: 70, status: "in_progress", is_blocked: false, blocker_note: null },
        { id: T.permit, progress: 100, status: "in_review", is_blocked: false, blocker_note: null },
        { id: T.historian, progress: 20, status: "in_progress", is_blocked: true, blocker_note: "Thiếu giấy phép phần mềm" },
      ]);
      const ev = await q("select task_id, from_progress, to_progress from task_events where report_id = $1 and event_type = 'progress_update' order by task_id", [r.report_id]);
      expect(ev).toEqual([
        { task_id: T.estimate, from_progress: 40, to_progress: 70 },
        { task_id: T.permit, from_progress: 0, to_progress: 100 },
        { task_id: T.historian, from_progress: 0, to_progress: 20 },
      ]);
      const it = await q("select task_id, progress_before, status_after from daily_report_items where report_id = $1 order by position", [r.report_id]);
      expect(it[1]).toEqual({ task_id: T.permit, progress_before: 0, status_after: "in_review" });

      // QLDA thấy tiến độ dự án thay đổi; việc 100% chưa tính hoàn tất
      await switchUser(c, U.pm1);
      // (100 + 60×2 + 70 + 100)/5 = 78
      expect(await stats(q, P.solar)).toMatchObject({ progress: 78, done_tasks: 1, review_tasks: 1, blocked_tasks: 0 });
    } finally {
      await c.query("rollback");
    }
  });

  it("gửi lại (mất mạng / nhấn hai lần) cho cùng kết quả, không tạo bản ghi trùng", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp1);
      const q = makeQ(c);
      const payload = items([{ task: T.estimate, progress: 55, result: "Lần 1" }]);
      const a = (await q("select submit_daily_report(null, null, $1::jsonb) as r", [payload]))[0]?.r as Record<string, unknown>;
      const b = (await q("select submit_daily_report(null, null, $1::jsonb) as r", [payload]))[0]?.r as Record<string, unknown>;
      // kể cả khi lần gửi lại mang dữ liệu khác, kết quả đã gửi không đổi
      const c2 = (await q("select submit_daily_report(null, null, $1::jsonb) as r", [items([{ task: T.estimate, progress: 90 }])]))[0]?.r as Record<string, unknown>;
      expect(b.report_id).toBe(a.report_id);
      expect(c2.report_id).toBe(a.report_id);
      expect(b.already_submitted).toBe(true);
      expect(b.submitted_at).toBe(a.submitted_at);
      expect((await q("select count(*)::int as n from daily_reports where user_id = $1", [U.emp1]))[0]?.n).toBe(1);
      expect((await q("select progress from tasks where id = $1", [T.estimate]))[0]?.progress).toBe(55);
      expect((await q("select count(*)::int as n from task_events where task_id = $1 and source = 'daily_report' and event_type = 'progress_update'", [T.estimate]))[0]?.n).toBe(1);
      await expectError(q("select save_daily_report_draft(null, null, $1::jsonb)", [payload]), "đã gửi");
    } finally {
      await c.query("rollback");
    }
  });

  it("không báo cáo được việc của người khác hoặc ngày tương lai", async () => {
    await withUser(c, U.emp1, async (q) => {
      await expectError(q("select submit_daily_report(null, null, $1::jsonb)", [items([{ task: T.design, progress: 90 }])]), "mình phụ trách");
      await expectError(q("select submit_daily_report(current_date + 5, null, $1::jsonb)", [items([{ task: T.estimate, progress: 50 }])]), "tương lai");
      await expectError(q("select submit_daily_report(null, null, '[]'::jsonb)"), "ít nhất một dòng");
    });
  });

  it("không đọc/sửa được báo cáo của người khác", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp1);
      const q = makeQ(c);
      await q("select save_daily_report_draft(null, 'nháp riêng', $1::jsonb)", [items([{ task: T.estimate, progress: 45 }])]);
      // QLDA không thấy bản nháp
      await switchUser(c, U.pm1);
      expect(await q("select id from daily_reports where user_id = $1", [U.emp1])).toHaveLength(0);
      // Đồng nghiệp không thấy, không sửa được (hàm luôn ghi vào báo cáo của chính người gọi)
      await switchUser(c, U.emp2);
      expect(await q("select id from daily_reports where user_id = $1", [U.emp1])).toHaveLength(0);
      await expectError(q("update daily_reports set note = 'sửa trộm' where user_id = $1", [U.emp1]), "permission denied");
      await expectError(q("select save_daily_report_draft(null, null, $1::jsonb)", [items([{ task: T.estimate, progress: 99 }])]), "mình phụ trách");
      await switchUser(c, U.emp1);
      expect((await q("select note from daily_reports where user_id = $1", [U.emp1]))[0]?.note).toBe("nháp riêng");
      expect((await q("select progress from daily_report_items i join daily_reports r on r.id = i.report_id where r.user_id = $1", [U.emp1]))[0]?.progress).toBe(45);
    } finally {
      await c.query("rollback");
    }
  });

  it("QLDA chỉ thấy các dòng thuộc dự án mình quản lý; trưởng phòng thấy cả báo cáo", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.emp1);
      const q = makeQ(c);
      await q("select submit_daily_report(null, null, $1::jsonb)", [
        items([
          { task: T.estimate, progress: 50 }, // DA1 (QLDA: Châu)
          { task: T.historian, progress: 10 }, // DA2 (QLDA: Hải)
        ]),
      ]);
      const lines = async () => (await q("select task_id from daily_report_items order by task_id")).map((r) => r.task_id);
      await switchUser(c, U.pm1);
      expect(await lines()).toEqual([T.estimate]);
      expect(await q("select id from daily_reports where user_id = $1", [U.emp1])).toHaveLength(1);
      await switchUser(c, U.pm2);
      expect(await lines()).toEqual([T.historian]);
      await switchUser(c, U.emp3);
      expect(await lines()).toEqual([]);
      expect(await q("select id from daily_reports where user_id = $1", [U.emp1])).toHaveLength(0);
      await switchUser(c, U.deptManager); // trưởng phòng Kỹ thuật (phòng của Dũng)
      expect(await lines()).toEqual([T.estimate, T.historian]);
      await switchUser(c, U.outsider);
      expect(await lines()).toEqual([]);
    } finally {
      await c.query("rollback");
    }
  });
});

describe("Gửi đồng thời", () => {
  it("hai lần gửi song song từ hai kết nối chỉ tạo một báo cáo và cập nhật một lần", async () => {
    const c1 = newClient();
    const c2 = newClient();
    await Promise.all([c1.connect(), c2.connect()]);
    const payload = JSON.stringify([{ task_id: T.permit, progress: 30, result: "song song" }]);
    const run = async (cl: pg.Client) => {
      await cl.query("begin");
      await cl.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.emp1, role: "authenticated" })]);
      await cl.query("set local role authenticated");
      const r = await cl.query("select submit_daily_report(null, null, $1::jsonb) as r", [payload]);
      await cl.query("commit");
      return r.rows[0].r as { report_id: string; already_submitted: boolean };
    };
    try {
      const [a, b] = await Promise.all([run(c1), run(c2)]);
      expect(a.report_id).toBe(b.report_id);
      expect([a.already_submitted, b.already_submitted].sort()).toEqual([false, true]);
      const ev = await c.query("select count(*)::int as n from task_events where report_id = $1", [a.report_id]);
      expect(ev.rows[0].n).toBe(1);
    } finally {
      // dọn dữ liệu đã commit
      await c.query("delete from task_events where task_id = $1 and source = 'daily_report'", [T.permit]);
      await c.query("delete from daily_reports where user_id = $1", [U.emp1]);
      await c.query("update tasks set progress = 0, status = 'todo' where id = $1", [T.permit]);
      await Promise.all([c1.end(), c2.end()]);
    }
  });
});

describe("Quản trị vai trò", () => {
  it("chỉ quản trị hệ thống đổi vai trò; thay đổi được ghi nhật ký", async () => {
    await c.query("begin");
    try {
      await switchUser(c, U.pm1);
      const q = makeQ(c);
      await expectError(q("select set_user_roles($1, array['system_admin']::app_role[])", [U.pm1]), "42501");
      await switchUser(c, U.admin);
      await q("select set_user_roles($1, array['employee','project_manager']::app_role[])", [U.emp2]);
      const roles = await q("select role from user_roles where user_id = $1 order by role", [U.emp2]);
      expect(roles.map((r) => r.role)).toEqual(["project_manager", "employee"]);
      const audit = await q("select action from audit_logs where entity_id = $1", [U.emp2]);
      expect(audit).toEqual([{ action: "role.set" }]);
      await expectError(q("select set_user_roles($1, array['employee']::app_role[])", [U.admin]), "chính mình");
    } finally {
      await c.query("rollback");
    }
  });
});
