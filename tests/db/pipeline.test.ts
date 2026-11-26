// Kiểm thử quy trình sản xuất video trên CSDL thật (Supabase Postgres + migration + seed):
// quyền được phép / bị từ chối, chuyển bước, bàn giao, yêu cầu bổ sung, duyệt, đăng, thông báo, đa doanh nghiệp.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { CHANNEL, DB_URL, expectError, makeQ, newClient, ORG, OTHER_ORG, OTHER_VIDEO, switchUser, U, V, withUser, type Q } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  if (!DB_URL) throw new Error("Thiếu DATABASE_URL — xem README.");
  c = newClient();
  await c.connect();
});
afterAll(async () => {
  await c?.end();
});

/** Chạy một kịch bản nhiều người dùng trong một giao dịch rồi rollback. */
async function scenario(fn: (q: Q, as: (u: string | null) => Promise<void>) => Promise<void>) {
  await c.query("begin");
  try {
    await fn(makeQ(c), (u) => switchUser(c, u));
  } finally {
    await c.query("rollback");
  }
}
const video = async (q: Q, id: string) => (await q("select * from videos where id = $1", [id]))[0] as Record<string, unknown>;
const allDone = ["done", "done", "done", "done"];

describe("Xem dữ liệu và cô lập doanh nghiệp", () => {
  it("cả đội xem được bảng video của doanh nghiệp; không thấy doanh nghiệp khác", async () => {
    await withUser(c, U.tien, async (q) => {
      const rows = await q("select code from videos order by code");
      expect(rows.map((r) => r.code)).toEqual(Array.from({ length: 12 }, (_, i) => `D${String(i + 1).padStart(4, "0")}`));
      expect(await q("select id from videos where id = $1", [OTHER_VIDEO])).toHaveLength(0);
    });
    await withUser(c, U.outsider, async (q) => {
      expect((await q("select org_id from videos")).every((r) => r.org_id === OTHER_ORG)).toBe(true);
      expect(await q("select id from profiles where org_id = $1", [ORG])).toHaveLength(0);
      await expectError(q("select update_content($1, 'done','done','done','done', null, null)", [V(1)]), "Không tìm thấy");
      await expectError(q("select confirm_handover($1, 'received')", [V(8)]), "Không tìm thấy");
    });
  });

  it("CSDL chặn gán người/kênh của doanh nghiệp khác", async () => {
    await c.query("begin");
    try {
      const q = makeQ(c);
      await expectError(q("update videos set editor_id = $1 where id = $2", [U.outsider, V(1)]), "23503");
      await expectError(q("update videos set channel_id = '00000000-0000-4000-f000-000000000009' where id = $1", [V(1)]), "23503");
    } finally {
      await c.query("rollback");
    }
  });

  it("anon bị từ chối; người dùng không UPDATE trực tiếp được", async () => {
    await withUser(c, null, async (q) => {
      await expectError(q("select * from videos"), "permission denied");
    });
    await withUser(c, U.hieu, async (q) => {
      await expectError(q("update videos set stage = 'published' where id = $1", [V(1)]), "permission denied");
      await expectError(q("update video_items set status = 'done' where video_id = $1", [V(1)]), "permission denied");
      await expectError(q("select app.notify($1, $2, null, 'x', 'giả mạo')", [ORG, U.duy]), "permission denied");
    });
  });

  it("tài khoản bị khóa mất quyền", async () => {
    await scenario(async (q, as) => {
      await c.query("update profiles set is_active = false where id = $1", [U.hieu]);
      await as(U.hieu);
      expect(await q("select id from videos")).toHaveLength(0);
      await expectError(q("select create_video('x')"), "42501");
    });
  });
});

describe("Tạo và phân công video", () => {
  it("Content tự tạo: mã tự tăng, mình là người phụ trách, đủ 4 hạng mục Chưa làm", async () => {
    await withUser(c, U.hieu, async (q) => {
      const r = (await q("select create_video('Linh cẩu tranh mồi với sư tử', 'Ý tưởng từ video đối thủ', $1, null, $2) as r", [CHANNEL, U.duy]))[0]?.r as { id: string; code: string };
      expect(r.code).toBe("D0013");
      const v = await video(q, r.id);
      expect(v).toMatchObject({ stage: "idea", content_owner_id: U.hieu, editor_id: U.duy });
      const items = await q("select kind, status from video_items where video_id = $1 order by kind", [r.id]);
      expect(items).toHaveLength(4);
      expect(items.every((i) => i.status === "todo")).toBe(true);
      await expectError(q("select create_video('x', null, null, $1)", [U.phong]), "chính mình phụ trách");
    });
  });

  it("Editor không tạo được video; Leader tạo và phân công đúng vai trò", async () => {
    await withUser(c, U.duy, async (q) => {
      await expectError(q("select create_video('x')"), "42501");
    });
    await withUser(c, U.leader, async (q) => {
      await expectError(q("select create_video('x', null, null, $1)", [U.duy]), "vai trò Content");
      await expectError(q("select create_video('x', null, null, $1, $2)", [U.phong, U.hieu]), "vai trò Editor");
      const r = (await q("select create_video('Báo đốm và cá sấu', null, null, $1, $2) as r", [U.phong, U.hoa]))[0]?.r as { id: string };
      expect(await video(q, r.id)).toMatchObject({ content_owner_id: U.phong, editor_id: U.hoa });
      // người được giao nhận thông báo
      await switchUser(c, U.phong);
      expect((await q("select kind from notifications where video_id = $1", [r.id])).map((x) => x.kind)).toEqual(["assigned_content"]);
    });
  });

  it("hai lần tạo đồng thời không trùng mã", async () => {
    const c1 = newClient();
    const c2 = newClient();
    await Promise.all([c1.connect(), c2.connect()]);
    const run = async (cl: pg.Client, title: string) => {
      await cl.query("begin");
      await cl.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.leader, role: "authenticated" })]);
      await cl.query("set local role authenticated");
      const r = await cl.query("select create_video($1) as r", [title]);
      await cl.query("commit");
      return (r.rows[0].r as { code: string; id: string });
    };
    try {
      const [a, b] = await Promise.all([run(c1, "song song A"), run(c2, "song song B")]);
      expect(a.code).not.toBe(b.code);
      await c.query("delete from videos where id = any($1)", [[a.id, b.id]]);
    } finally {
      await c.query("update org_counters set last_video_no = 12 where org_id = $1", [ORG]);
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it("phân công lại: Leader được, có nhật ký; Content chỉ đổi Editor trước khi bàn giao", async () => {
    await scenario(async (q, as) => {
      await as(U.phong);
      await expectError(q("select assign_video($1, $2, $3)", [V(1), U.hieu, U.tien]), "42501"); // không phải người phụ trách
      await as(U.hieu);
      await q("select assign_video($1, $2, $3)", [V(1), U.hieu, U.tien]);
      await expectError(q("select assign_video($1, $2, $3)", [V(1), U.phong, U.tien]), "42501"); // không tự đổi người phụ trách
      await expectError(q("select assign_video($1, $2, $3)", [V(2), U.hieu, U.tien]), "42501"); // đã bàn giao
      await as(U.leader);
      await q("select assign_video($1, $2, $3)", [V(2), U.phong, U.tien]);
      await as(U.admin);
      const audit = await q("select action from audit_logs where entity_id = any($1) order by id", [[V(1), V(2)]]);
      expect(audit.map((a) => a.action)).toEqual(["video.assign", "video.assign"]);
    });
  });
});

describe("Chuẩn bị Content và bàn giao", () => {
  it("chỉ Content phụ trách cập nhật; link phải hợp lệ; Ý tưởng → Đang chuẩn bị", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      const r = (await q("select create_video('Video thử') as r"))[0]?.r as { id: string };
      await as(U.phong);
      await expectError(q("select update_content($1, 'done','todo','todo','todo', null, null)", [r.id]), "Chỉ Content phụ trách");
      await as(U.hieu);
      await expectError(q("select update_content($1, 'done','todo','todo','todo', 'drive nội bộ', null)", [r.id]), "http");
      expect((await q("select update_content($1, 'done','doing','todo','todo', null, 'Đang tìm nguồn') as s", [r.id]))[0]?.s).toBe("preparing");
      const items = await q("select kind, status from video_items where video_id = $1 order by kind", [r.id]);
      expect(Object.fromEntries(items.map((i) => [i.kind, i.status]))).toEqual({ ai_video: "doing", edit_map: "todo", real_footage: "done", script_vo: "todo" });
    });
  });

  it("bàn giao yêu cầu đủ 4 hạng mục Hoàn thành, link tài nguyên và Editor", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      // D0001: Video AI còn Đang làm, chưa có link
      await expectError(q("select submit_handover($1)", [V(1)]), "Chưa hoàn thành: Video AI");
      await q("select update_content($1, $2, $3, $4, $5, null, null)", [V(1), ...allDone]);
      await expectError(q("select submit_handover($1)", [V(1)]), "link tài nguyên");
      await q("select update_content($1, $2, $3, $4, $5, 'https://drive.google.com/drive/folders/abc', 'Đủ tài nguyên')", [V(1), ...allDone]);
      await q("select submit_handover($1)", [V(1)]);
      await q("select submit_handover($1)", [V(1)]); // gửi lặp không lỗi
      expect(await video(q, V(1))).toMatchObject({ stage: "handover", handover_status: "pending" });
      expect((await q("select count(*)::int as n from video_events where video_id = $1 and event_type = 'handover_submit'", [V(1)]))[0]?.n).toBe(1);
      // không sửa Content sau khi bàn giao
      await expectError(q("select update_content($1, 'todo','todo','todo','todo', null, null)", [V(1)]), "đã bàn giao");
      // Editor nhận thông báo
      await as(U.duy);
      expect((await q("select message from notifications where video_id = $1 and kind = 'handover'", [V(1)]))[0]?.message).toContain("D0001");
    });
  });

  it("Editor khác không xác nhận được; yêu cầu bổ sung cần ghi chú và đưa video về Content", async () => {
    await scenario(async (q, as) => {
      await as(U.hoa); // D0008 có Editor là Tiện
      await expectError(q("select confirm_handover($1, 'received')", [V(8)]), "Chỉ Editor tiếp nhận");
      await as(U.tien);
      await expectError(q("select confirm_handover($1, 'needs_more', '  ')", [V(8)]), "yêu cầu bổ sung");
      await q("select confirm_handover($1, 'needs_more', 'Thiếu cảnh đà điểu chạy cận cảnh')", [V(8)]);
      expect(await video(q, V(8))).toMatchObject({ stage: "preparing", handover_status: "needs_more", supplement_count: 1, editor_note: "Thiếu cảnh đà điểu chạy cận cảnh" });
      await as(U.hieu);
      expect((await q("select kind from notifications where video_id = $1", [V(8)])).map((n) => n.kind)).toContain("needs_more");
      // Content bổ sung và bàn giao lại → Editor nhận đủ → Đang dựng
      await q("select update_content($1, $2, $3, $4, $5, 'https://drive.google.com/drive/folders/MAU-D0008-v2', 'Đã bổ sung')", [V(8), ...allDone]);
      await q("select submit_handover($1)", [V(8)]);
      await as(U.tien);
      await q("select confirm_handover($1, 'received', 'Đủ rồi')", [V(8)]);
      expect(await video(q, V(8))).toMatchObject({ stage: "editing", handover_status: "received" });
    });
  });
});

describe("Dựng, duyệt và đăng", () => {
  it("Editor nộp duyệt cần link bản dựng; Leader yêu cầu sửa rồi duyệt; đăng cần link", async () => {
    await scenario(async (q, as) => {
      await as(U.duy); // D0002: Duy đang dựng
      await expectError(q("select update_edit($1, 120, null)", [V(2)]), "0–100");
      await expectError(q("select submit_for_review($1)", [V(2)]), "link bản dựng");
      await q("select update_edit($1, 80, 'https://drive.google.com/file/d/ban-dung-1', 'Xong phần mở đầu')", [V(2)]);
      await q("select submit_for_review($1)", [V(2)]);
      expect(await video(q, V(2))).toMatchObject({ stage: "review", edit_progress: 100 });
      await expectError(q("select review_video($1, 'approve')", [V(2)]), "42501"); // Editor không tự duyệt
      await as(U.hieu);
      await expectError(q("select review_video($1, 'approve')", [V(2)]), "42501");
      await as(U.leader);
      expect((await q("select kind from notifications where video_id = $1", [V(2)])).map((n) => n.kind)).toContain("review");
      await expectError(q("select review_video($1, 'revise', '')", [V(2)]), "cần sửa");
      await q("select review_video($1, 'revise', 'Nhạc nền đoạn cuối quá to')", [V(2)]);
      expect(await video(q, V(2))).toMatchObject({ stage: "editing", revision_count: 1, review_note: "Nhạc nền đoạn cuối quá to", edit_progress: 90 });
      await as(U.duy);
      await q("select submit_for_review($1)", [V(2)]);
      await as(U.leader);
      await q("select review_video($1, 'approve', 'Ổn')", [V(2)]);
      await q("select review_video($1, 'approve')", [V(2)]); // duyệt lặp không lỗi
      expect(await video(q, V(2))).toMatchObject({ stage: "ready" });
      await as(U.duy);
      await expectError(q("select publish_video($1, 'https://youtu.be/x')", [V(2)]), "42501");
      await as(U.leader);
      await expectError(q("select publish_video($1, 'chưa có')", [V(2)]), "link video");
      await q("select publish_video($1, 'https://www.youtube.com/watch?v=abc123')", [V(2)]);
      const v = await video(q, V(2));
      expect(v).toMatchObject({ stage: "published", published_url: "https://www.youtube.com/watch?v=abc123" });
      expect(v.published_at).not.toBeNull();
      await as(U.admin);
      const audit = (await q("select action from audit_logs where entity_id = $1 order by id", [V(2)])).map((a) => a.action);
      expect(audit).toEqual(["video.revise", "video.approve", "video.publish"]);
    });
  });

  it("không nhảy bước: không duyệt khi chưa nộp, không đăng khi chưa duyệt", async () => {
    await withUser(c, U.leader, async (q) => {
      await expectError(q("select review_video($1, 'approve')", [V(1)]), "chờ duyệt");
      await expectError(q("select publish_video($1, 'https://youtu.be/x')", [V(10)]), "chưa được duyệt");
      await expectError(q("select update_edit($1, 50, null)", [V(1)]), "bước dựng");
    });
  });

  it("tạm dừng / tiếp tục / hủy chỉ Leader; hủy cần lý do", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q("select set_video_hold($1, 'hold')", [V(3)]), "Chỉ Leader");
      await as(U.leader);
      await q("select set_video_hold($1, 'hold', 'Chờ bản quyền nguồn')", [V(3)]);
      expect((await video(q, V(3))).stage).toBe("on_hold");
      await q("select set_video_hold($1, 'resume')", [V(3)]);
      expect((await video(q, V(3))).stage).toBe("preparing");
      await expectError(q("select set_video_hold($1, 'cancel')", [V(3)]), "lý do");
      await q("select set_video_hold($1, 'cancel', 'Trùng chủ đề D0004')", [V(3)]);
      expect((await video(q, V(3))).stage).toBe("cancelled");
    });
  });
});

describe("Thông báo, bình luận, vai trò", () => {
  it("mỗi người chỉ thấy thông báo của mình và đánh dấu đã đọc được", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await q("select update_content($1, $2, $3, $4, $5, 'https://drive.google.com/x', null)", [V(1), ...allDone]);
      await q("select submit_handover($1)", [V(1)]);
      await as(U.hoa);
      expect(await q("select id from notifications where video_id = $1", [V(1)])).toHaveLength(0);
      await as(U.duy);
      expect(await q("select id from notifications where read_at is null")).toHaveLength(1);
      await q("select mark_notifications_read()");
      expect(await q("select id from notifications where read_at is null")).toHaveLength(0);
    });
  });

  it("thành viên bình luận được; người ngoài không", async () => {
    await scenario(async (q, as) => {
      await as(U.tien);
      await q("select add_video_comment($1, 'Cảnh cá sấu đoạn 2 hơi mờ')", [V(2)]);
      await as(U.outsider);
      await expectError(q("select add_video_comment($1, 'x')", [V(2)]), "Không tìm thấy");
      expect(await q("select id from video_comments")).toHaveLength(0);
    });
  });

  it("chỉ quản trị hệ thống đổi vai trò; có nhật ký", async () => {
    await scenario(async (q, as) => {
      await as(U.leader);
      await expectError(q("select set_user_roles($1, array['system_admin']::app_role[])", [U.leader]), "42501");
      await as(U.admin);
      await q("select set_user_roles($1, array['content','editor']::app_role[])", [U.phong]);
      expect((await q("select role from user_roles where user_id = $1 order by role", [U.phong])).map((r) => r.role)).toEqual(["content", "editor"]);
      expect(await q("select action from audit_logs where entity_id = $1", [U.phong])).toEqual([{ action: "role.set" }]);
    });
  });
});

describe("Nhập dữ liệu từ bảng báo cáo cũ", () => {
  const row = (code: string, extra: Record<string, unknown> = {}) => ({
    code, title: `Video nhập ${code}`, report_date: "2026-10-05", stage: "editing", content_owner_id: U.hieu, editor_id: U.duy,
    resource_url: "https://drive.google.com/x", content_note: null, handover_status: "received", handover_confirmed_at: "2026-10-06",
    editor_note: "ghi chú", supplement_count: 0, items: { real_footage: "done", ai_video: "done", script_vo: "done", edit_map: "done" },
    source: "t10, dòng 5", ...extra,
  });
  it("chỉ Leader nhập được; bỏ qua mã đã có; bộ đếm mã tăng theo mã lớn nhất", async () => {
    await scenario(async (q, as) => {
      await as(U.hieu);
      await expectError(q("select import_videos($1::jsonb)", [JSON.stringify([row("D0200")])]), "42501");
      await as(U.leader);
      const r = (await q("select import_videos($1::jsonb) as r", [JSON.stringify([row("D0200"), row("D0001"), row("D0150", { stage: "preparing", handover_status: null, editor_id: null })])]))[0]?.r as { inserted: number; skipped: string[] };
      expect(r).toEqual({ inserted: 2, skipped: ["D0001"] });
      const v = (await q("select stage, handover_status, content_owner_id, report_date::text as d from videos where code = 'D0200'"))[0];
      expect(v).toEqual({ stage: "editing", handover_status: "received", content_owner_id: U.hieu, d: "2026-10-05" });
      expect((await q("select count(*)::int as n from video_items i join videos v on v.id = i.video_id where v.code = 'D0200' and i.status = 'done'"))[0]?.n).toBe(4);
      const created = (await q("select create_video('Video sau khi nhập') as r"))[0]?.r as { code: string };
      expect(created.code).toBe("D0201");
      // Nhập lại cùng dữ liệu: không tạo trùng
      const again = (await q("select import_videos($1::jsonb) as r", [JSON.stringify([row("D0200")])]))[0]?.r as { inserted: number };
      expect(again.inserted).toBe(0);
      await expectError(q("select import_videos($1::jsonb)", [JSON.stringify([row("D0300", { editor_id: U.hieu })])]), "vai trò Editor");
    });
  });
});
