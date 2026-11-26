-- =====================================================================
-- Dữ liệu mẫu cho phát triển và kiểm thử. KHÔNG dùng cho môi trường thật.
-- Mật khẩu chung cho mọi tài khoản mẫu: MatKhau@123
-- Có thể chạy lại nhiều lần (on conflict do nothing).
-- =====================================================================

-- Doanh nghiệp (tên giả định — xem README mục "Giả định")
insert into public.organizations (id, name, timezone) values
  ('00000000-0000-4000-a000-000000000001', 'Công ty Hana Power (mẫu)', 'Asia/Ho_Chi_Minh'),
  ('00000000-0000-4000-a000-000000000002', 'Công ty Khác (kiểm thử đa doanh nghiệp)', 'Asia/Ho_Chi_Minh')
on conflict (id) do nothing;

insert into public.departments (id, org_id, name) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Ban Giám đốc'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'Phòng Kỹ thuật'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001', 'Phòng Kinh doanh'),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000002', 'Phòng Hành chính')
on conflict (id) do nothing;

-- Tài khoản đăng nhập (Supabase Auth / GoTrue)
with u(id, email, full_name) as (values
  ('00000000-0000-4000-c000-000000000001'::uuid, 'admin@hanapower.local',        'Nguyễn Văn An'),
  ('00000000-0000-4000-c000-000000000002'::uuid, 'truongphong@hanapower.local',  'Trần Thị Bình'),
  ('00000000-0000-4000-c000-000000000003'::uuid, 'quanlyduan@hanapower.local',   'Lê Minh Châu'),
  ('00000000-0000-4000-c000-000000000004'::uuid, 'nhanvien1@hanapower.local',    'Phạm Quốc Dũng'),
  ('00000000-0000-4000-c000-000000000005'::uuid, 'nhanvien2@hanapower.local',    'Hoàng Thu Hà'),
  ('00000000-0000-4000-c000-000000000006'::uuid, 'quanlyduan2@hanapower.local',  'Võ Thanh Hải'),
  ('00000000-0000-4000-c000-000000000007'::uuid, 'nhanvien3@hanapower.local',    'Đỗ Khánh Linh'),
  ('00000000-0000-4000-c000-000000000099'::uuid, 'nguoingoai@congtykhac.local',  'Người Ngoài')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('MatKhau@123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name), now(), now(),
       '', '', '', '', '', '', '', ''
from u
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like '00000000-0000-4000-c000-%'
on conflict do nothing;

insert into public.profiles (id, org_id, department_id, full_name, email, job_title) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'Nguyễn Văn An',  'admin@hanapower.local',       'Quản trị hệ thống'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Trần Thị Bình',  'truongphong@hanapower.local', 'Trưởng phòng Kỹ thuật'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Lê Minh Châu',   'quanlyduan@hanapower.local',  'Quản lý dự án'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Phạm Quốc Dũng', 'nhanvien1@hanapower.local',   'Kỹ sư điện'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Hoàng Thu Hà',   'nhanvien2@hanapower.local',   'Kỹ sư thiết kế'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Võ Thanh Hải',   'quanlyduan2@hanapower.local', 'Quản lý dự án'),
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Đỗ Khánh Linh',  'nhanvien3@hanapower.local',   'Chuyên viên kinh doanh'),
  ('00000000-0000-4000-c000-000000000099', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000009', 'Người Ngoài',    'nguoingoai@congtykhac.local', 'Nhân viên')
on conflict (id) do nothing;

update public.departments set manager_id = '00000000-0000-4000-c000-000000000002'
  where id = '00000000-0000-4000-b000-000000000002' and manager_id is null;
update public.departments set manager_id = '00000000-0000-4000-c000-000000000006'
  where id = '00000000-0000-4000-b000-000000000003' and manager_id is null;

insert into public.user_roles (org_id, user_id, role) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000001', 'system_admin'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000002', 'department_manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000002', 'employee'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000003', 'project_manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000003', 'employee'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000004', 'employee'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000005', 'employee'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000006', 'project_manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000006', 'department_manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000007', 'employee'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000099', 'system_admin'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000099', 'project_manager')
on conflict do nothing;

-- Dự án
insert into public.projects (id, org_id, name, description, manager_id, department_id, start_date, due_date, status, created_by) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Điện mặt trời áp mái – Nhà máy Bình Dương', 'Khảo sát, thiết kế và lắp đặt hệ thống 500 kWp.',
   '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000002',
   current_date - 20, current_date + 40, 'active', '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Nâng cấp hệ thống giám sát SCADA', 'Thay thế bộ thu thập dữ liệu và cập nhật màn hình vận hành.',
   '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000003',
   current_date - 10, current_date + 60, 'active', '00000000-0000-4000-c000-000000000006'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-a000-000000000001',
   'Chuẩn bị hồ sơ thầu 2027', 'Dự án mới, chưa giao việc.',
   '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000002',
   current_date, current_date + 30, 'planning', '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-a000-000000000002',
   'Dự án nội bộ công ty khác', null,
   '00000000-0000-4000-c000-000000000099', null, current_date, null, 'active', '00000000-0000-4000-c000-000000000099')
on conflict (id) do nothing;

insert into public.project_members (org_id, project_id, user_id, member_role) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000003', 'manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000004', 'member'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000005', 'member'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000006', 'manager'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000007', 'member'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000004', 'member'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000003', '00000000-0000-4000-c000-000000000003', 'manager'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-c000-000000000099', 'manager')
on conflict do nothing;

-- Công việc mẫu (đủ các trạng thái để kiểm tra giao diện)
insert into public.tasks (id, org_id, project_id, title, description, assignee_id, priority, status, due_date, progress, weight,
                          is_blocked, blocker_note, approved_by, approved_at, created_by) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001',
   'Khảo sát hiện trạng mái nhà xưởng', 'Đo đạc, chụp ảnh, kiểm tra kết cấu.', '00000000-0000-4000-c000-000000000004',
   'high', 'done', current_date - 12, 100, 1, false, null,
   '00000000-0000-4000-c000-000000000003', now() - interval '10 days', '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001',
   'Thiết kế bố trí tấm pin', 'Bản vẽ mặt bằng và sơ đồ chuỗi.', '00000000-0000-4000-c000-000000000005',
   'high', 'in_progress', current_date + 5, 60, 2, false, null, null, null, '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001',
   'Lập dự toán vật tư', null, '00000000-0000-4000-c000-000000000004',
   'medium', 'in_progress', current_date - 2, 40, 1, true, 'Chờ báo giá biến tần từ nhà cung cấp',
   null, null, '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001',
   'Xin phép đấu nối điện lực', null, '00000000-0000-4000-c000-000000000004',
   'urgent', 'todo', current_date + 10, 0, 1, false, null, null, null, '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000001',
   'Phương án PCCC (đã hủy)', null, '00000000-0000-4000-c000-000000000005',
   'low', 'cancelled', current_date + 3, 10, 1, false, null, null, null, '00000000-0000-4000-c000-000000000003'),
  ('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000002',
   'Kiểm kê thiết bị RTU hiện có', null, '00000000-0000-4000-c000-000000000007',
   'medium', 'in_progress', current_date + 7, 30, 1, false, null, null, null, '00000000-0000-4000-c000-000000000006'),
  ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-000000000002',
   'Cấu hình máy chủ lịch sử dữ liệu', null, '00000000-0000-4000-c000-000000000004',
   'high', 'todo', current_date + 14, 0, 3, false, null, null, null, '00000000-0000-4000-c000-000000000006'),
  ('00000000-0000-4000-e000-000000000009', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-d000-000000000009',
   'Việc của công ty khác', null, '00000000-0000-4000-c000-000000000099',
   'medium', 'todo', null, 0, 1, false, null, null, null, '00000000-0000-4000-c000-000000000099')
on conflict (id) do nothing;
