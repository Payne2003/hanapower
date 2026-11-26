-- =====================================================================
-- Dữ liệu mẫu cho phát triển và kiểm thử — HANA MEDIA (bộ phận Content/Edit).
-- Video D0001–D0009 lấy từ "Bảng báo cáo bộ phận content HANA MEDIA" (tab t11);
-- link tài nguyên được thay bằng link giả. D0010–D0012 là video mẫu minh họa các bước sau.
-- Mật khẩu chung cho mọi tài khoản mẫu: MatKhau@123. Chạy lại được nhiều lần.
-- =====================================================================

insert into public.organizations (id, name, timezone) values
  ('00000000-0000-4000-a000-000000000001', 'HANA MEDIA', 'Asia/Ho_Chi_Minh'),
  ('00000000-0000-4000-a000-000000000002', 'Công ty Khác (kiểm thử đa doanh nghiệp)', 'Asia/Ho_Chi_Minh')
on conflict (id) do nothing;

insert into public.departments (id, org_id, name) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Ban quản lý'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'Bộ phận Content'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001', 'Bộ phận Edit'),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000002', 'Hành chính')
on conflict (id) do nothing;

with u(id, email, full_name) as (values
  ('00000000-0000-4000-c000-000000000001'::uuid, 'admin@hanamedia.local',  'Quản trị hệ thống'),
  ('00000000-0000-4000-c000-000000000002'::uuid, 'leader@hanamedia.local', 'Leader Sản xuất'),
  ('00000000-0000-4000-c000-000000000003'::uuid, 'hieu@hanamedia.local',   'Hiếu'),
  ('00000000-0000-4000-c000-000000000004'::uuid, 'phong@hanamedia.local',  'Phong'),
  ('00000000-0000-4000-c000-000000000005'::uuid, 'duy@hanamedia.local',    'Duy'),
  ('00000000-0000-4000-c000-000000000006'::uuid, 'hoa@hanamedia.local',    'Hòa'),
  ('00000000-0000-4000-c000-000000000007'::uuid, 'tien@hanamedia.local',   'Tiện'),
  ('00000000-0000-4000-c000-000000000099'::uuid, 'nguoingoai@congtykhac.local', 'Người Ngoài')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('MatKhau@123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name),
       now(), now(), '', '', '', '', '', '', '', ''
from u
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.id::text like '00000000-0000-4000-c000-%'
on conflict do nothing;

insert into public.profiles (id, org_id, department_id, full_name, email, job_title) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'Quản trị hệ thống', 'admin@hanamedia.local',  'Quản trị hệ thống'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'Leader Sản xuất',  'leader@hanamedia.local', 'Leader sản xuất'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Hiếu',  'hieu@hanamedia.local',  'Content'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Phong', 'phong@hanamedia.local', 'Content'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Duy',   'duy@hanamedia.local',   'Editor'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Hòa',   'hoa@hanamedia.local',   'Editor'),
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Tiện',  'tien@hanamedia.local',  'Editor'),
  ('00000000-0000-4000-c000-000000000099', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000009', 'Người Ngoài', 'nguoingoai@congtykhac.local', 'Nhân viên')
on conflict (id) do nothing;

insert into public.user_roles (org_id, user_id, role) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000001', 'system_admin'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000002', 'manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000003', 'content'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000004', 'content'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000005', 'editor'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000006', 'editor'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000007', 'editor'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000099', 'system_admin'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000099', 'manager')
on conflict do nothing;

insert into public.channels (id, org_id, name, platform, url) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-a000-000000000001', 'Kênh động vật hoang dã (mẫu)', 'YouTube', 'https://www.youtube.com/@kenh-mau'),
  ('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-a000-000000000002', 'Kênh công ty khác', 'YouTube', null)
on conflict (id) do nothing;

-- Video. Cột: mã, tên, ngày báo cáo, giai đoạn, Content, Editor, xác nhận bàn giao, link, ghi chú Edit, lần bổ sung
with v(n, title, rdate, stage, owner, editor, hstatus, link, enote, draft, approved, purl, pdate) as (values
  (1,  'cá sấu và đàn sư tử',                          date '2026-11-18', 'preparing', 3, 5, null,         null, null, null, false, null, null),
  (2,  'cá sấu và đàn sư tử',                          date '2026-11-19', 'editing',   3, 5, 'received',   'https://drive.google.com/drive/folders/MAU-D0002', null, null, false, null, null),
  (3,  'báo tuyết và mèo pallas',                      date '2026-11-20', 'preparing', 3, 6, null,         null, null, null, false, null, null),
  (4,  'báo tuyết và mèo pallas',                      date '2026-11-21', 'editing',   3, 6, 'received',   'https://drive.google.com/drive/folders/MAU-D0004', 'bổ sung những cảnh chạy rượt đuổi kịch tính hơn', null, false, null, null),
  (5,  'cáo fennec, cú đại bàng và chó rừng lưng đen', date '2026-11-22', 'editing',   3, 7, 'received',   'https://drive.google.com/drive/folders/MAU-D0005', null, null, false, null, null),
  (6,  'gấu xám bắc mỹ và 2 mẹ con dê núi',            date '2026-11-22', 'editing',   3, 5, 'received',   'https://drive.google.com/drive/folders/MAU-D0006', 'thêm những cảnh chạy dê ngã xuống đất giống video đối thủ', null, false, null, null),
  (7,  'chó nhà kangaroo',                             date '2026-11-23', 'editing',   3, 5, 'received',   'https://drive.google.com/drive/folders/MAU-D0007', null, null, false, null, null),
  (8,  'chim chạy đường dài',                          date '2026-11-24', 'handover',  3, 7, 'pending',    'https://drive.google.com/drive/folders/MAU-D0008', null, null, false, null, null),
  (9,  'caracal và rắn hổ mang',                       date '2026-11-25', 'handover',  3, 6, 'pending',    'https://drive.google.com/drive/folders/MAU-D0009', null, null, false, null, null),
  (10, 'Video mẫu – sói xám săn tuần lộc',             date '2026-11-10', 'review',    4, 5, 'received',   'https://drive.google.com/drive/folders/MAU-D0010', null, 'https://drive.google.com/file/d/MAU-DRAFT-D0010', false, null, null),
  (11, 'Video mẫu – đại bàng và cáo đỏ',               date '2026-11-08', 'ready',     4, 6, 'received',   'https://drive.google.com/drive/folders/MAU-D0011', null, 'https://drive.google.com/file/d/MAU-DRAFT-D0011', true, null, null),
  (12, 'Video mẫu – hổ Bengal vượt sông',              date '2026-11-05', 'published', 4, 7, 'received',   'https://drive.google.com/drive/folders/MAU-D0012', null, 'https://drive.google.com/file/d/MAU-DRAFT-D0012', true, 'https://www.youtube.com/watch?v=MAU-D0012', date '2026-11-12')
)
insert into public.videos (id, org_id, code, title, channel_id, stage, report_date, due_date, content_owner_id, editor_id,
  handover_status, handover_submitted_at, handover_confirmed_at, resource_url, editor_note, edit_progress, draft_url,
  approved_by, approved_at, published_url, published_at, created_by)
select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-4000-a000-000000000001', 'D' || lpad(n::text, 4, '0'), title,
       '00000000-0000-4000-f000-000000000001', stage::public.video_stage, rdate, case when n >= 10 then rdate + 7 end,
       ('00000000-0000-4000-c000-' || lpad(owner::text, 12, '0'))::uuid,
       ('00000000-0000-4000-c000-' || lpad(editor::text, 12, '0'))::uuid,
       hstatus::public.handover_status,
       case when hstatus is not null then rdate::timestamptz end,
       case when hstatus = 'received' then rdate::timestamptz end,
       link, enote,
       case stage when 'editing' then 40 when 'review' then 100 when 'ready' then 100 when 'published' then 100 else 0 end,
       draft,
       case when approved then '00000000-0000-4000-c000-000000000002'::uuid end,
       case when approved then (rdate + 3)::timestamptz end,
       purl, pdate,
       '00000000-0000-4000-c000-000000000002'
from v
on conflict (id) do nothing;

-- 4 hạng mục: mặc định Hoàn thành; D0001 và D0003 còn "Video AI" Đang làm (như bảng gốc)
insert into public.video_items (org_id, video_id, kind, status)
select v.org_id, v.id, k,
       case when v.code in ('D0001', 'D0003') and k = 'ai_video' then 'doing'::public.item_status else 'done'::public.item_status end
from public.videos v cross join unnest(array['real_footage', 'ai_video', 'script_vo', 'edit_map']) k
where v.org_id = '00000000-0000-4000-a000-000000000001'
on conflict do nothing;

insert into public.org_counters (org_id, last_video_no) values ('00000000-0000-4000-a000-000000000001', 12)
on conflict (org_id) do nothing;

-- Video của doanh nghiệp khác (kiểm thử cô lập)
insert into public.videos (id, org_id, code, title, stage, report_date, created_by)
values ('00000000-0000-4000-9000-000000000999', '00000000-0000-4000-a000-000000000002', 'D0001', 'Video của công ty khác',
        'idea', current_date, '00000000-0000-4000-c000-000000000099')
on conflict (id) do nothing;
insert into public.video_items (org_id, video_id, kind)
select '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-9000-000000000999', k
from unnest(array['real_footage', 'ai_video', 'script_vo', 'edit_map']) k
on conflict do nothing;
