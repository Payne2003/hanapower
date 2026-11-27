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
  ('00000000-0000-4000-c000-000000000008'::uuid, 'ketoan@hanamedia.local', 'Kế toán Lan'),
  ('00000000-0000-4000-c000-000000000009'::uuid, 'nhansu@hanamedia.local', 'Nhân sự Mai'),
  ('00000000-0000-4000-c000-00000000000a'::uuid, 'truongnhom@hanamedia.local', 'Trưởng nhóm Bình'),
  ('00000000-0000-4000-c000-00000000000b'::uuid, 'ctv@hanamedia.local',    'Cộng tác viên Trang'),
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
  ('00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'Kế toán Lan', 'ketoan@hanamedia.local', 'Kế toán'),
  ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'Nhân sự Mai', 'nhansu@hanamedia.local', 'Nhân sự'),
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000002', 'Trưởng nhóm Bình', 'truongnhom@hanamedia.local', 'Trưởng nhóm'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000003', 'Cộng tác viên Trang', 'ctv@hanamedia.local', 'Cộng tác viên thiết kế'),
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
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000008', 'accountant'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000009', 'hr'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-00000000000a', 'team_lead'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-00000000000b', 'collaborator'),
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


-- =====================================================================
-- CRM / dự án / tài chính / cộng tác viên / lương — dữ liệu mẫu
-- =====================================================================
select public.seed_crm_defaults(id) from public.organizations;
select public.seed_finance_defaults(id) from public.organizations;

do $seed$
declare
  o  uuid := '00000000-0000-4000-a000-000000000001';
  ld uuid := '00000000-0000-4000-c000-000000000002';   -- leader (manager)
  kt uuid := '00000000-0000-4000-c000-000000000008';
  acc1 uuid := '00000000-0000-4000-d000-000000000001';
  acc2 uuid := '00000000-0000-4000-d000-000000000002';
  con1 uuid := '00000000-0000-4000-d100-000000000001';
  con2 uuid := '00000000-0000-4000-d100-000000000002';
  pb  uuid := '00000000-0000-4000-d200-000000000001';
  p1 uuid := '00000000-0000-4000-d300-000000000001';
  p2 uuid := '00000000-0000-4000-d300-000000000002';
  p3 uuid := '00000000-0000-4000-d300-000000000003';
  opp uuid := '00000000-0000-4000-d400-000000000001';
  opp2 uuid := '00000000-0000-4000-d400-000000000002';
  qt  uuid := '00000000-0000-4000-d500-000000000001';
  ct  uuid := '00000000-0000-4000-d600-000000000001';
  pr  uuid := '00000000-0000-4000-d700-000000000001';
  m1  uuid := '00000000-0000-4000-d800-000000000001';
  m2  uuid := '00000000-0000-4000-d800-000000000002';
  fl  uuid := '00000000-0000-4000-d900-000000000001';
  ad  uuid := '00000000-0000-4000-d90a-000000000001';
begin
  if exists (select 1 from public.accounts where id = acc1) then return; end if;

  insert into public.accounts (id, org_id, name, type, industry_id, phones, emails, websites, billing_address, tax_code, owner_id)
  values (acc1, o, 'Công ty TNHH Nông sản Xanh', 'customer', (select id from public.industries where org_id = o and name = 'Thương mại điện tử'),
          array['0901234567'], array['lienhe@nongsanxanh.example'], array['https://nongsanxanh.example'], 'Quận 7, TP.HCM', '0312345678', ld),
         (acc2, o, 'Công ty Du lịch Mặt Trời', 'customer', (select id from public.industries where org_id = o and name = 'Du lịch'),
          array['0987654321'], array['hello@mattroi.example'], '{}', 'Đà Nẵng', null, ld);
  insert into public.contacts (id, org_id, salutation, first_name, last_name, account_id, job_title, phones, emails, owner_id)
  values (con1, o, 'Chị', 'Thu', 'Hà', acc1, 'Giám đốc marketing', array['0901234567'], array['ha.thu@nongsanxanh.example'], ld),
         (con2, o, 'Anh', 'Minh', 'Tuấn', acc2, 'Trưởng phòng truyền thông', array['0987654321'], array['tuan@mattroi.example'], ld);
  insert into public.leads (org_id, title, first_name, last_name, job_title, company, status, rating, source_id, phones, emails, owner_id)
  values (o, 'Anh', 'Quang', 'Huy', 'Giám đốc', 'Studio Sao Mai', 'working', 'hot',
          (select id from public.lead_sources where org_id = o and name = 'Facebook'), array['0912000111'], array['huy@saomai.example'], ld),
         (o, 'Chị', 'Lan', 'Phạm', 'Chủ thương hiệu', 'Mỹ phẩm Hoa Sen', 'new', 'warm',
          (select id from public.lead_sources where org_id = o and name = 'Giới thiệu'), array['0933222111'], '{}', ld);

  insert into public.price_books (id, org_id, name, description) values (pb, o, 'Bảng giá chuẩn 2026', 'Giá niêm yết dịch vụ sản xuất video');
  insert into public.products (id, org_id, name, code, category_id, unit_id, list_price, description) values
    (p1, o, 'Sản xuất video 3–5 phút', 'SX-VIDEO', (select id from public.product_categories where org_id = o and name = 'Sản xuất video'),
        (select id from public.product_units where org_id = o and name = 'Video'), 12000000, 'Quay, dựng, âm thanh, màu hoàn chỉnh'),
    (p2, o, 'Dựng hậu kỳ video', 'HAU-KY', (select id from public.product_categories where org_id = o and name = 'Hậu kỳ'),
        (select id from public.product_units where org_id = o and name = 'Video'), 4000000, 'Dựng từ footage khách cung cấp'),
    (p3, o, 'Quản lý kênh YouTube theo tháng', 'QL-KENH', (select id from public.product_categories where org_id = o and name = 'Quản lý kênh'),
        (select id from public.product_units where org_id = o and name = 'Tháng'), 15000000, 'Lên kế hoạch, đăng tải, tối ưu SEO');
  insert into public.price_book_products (org_id, price_book_id, product_id, unit_price, tax_percent)
  select o, pb, id, list_price, 8 from public.products where org_id = o;

  insert into public.opportunities (id, org_id, name, account_id, contact_id, price_book_id, stage, win_probability, forecast, expected_close_date, owner_id, needs)
  values (opp, o, 'Chiến dịch video giới thiệu nông sản Xanh', acc1, con1, pb, 'won', 100, 'closed', current_date - 20, ld, 'Bộ video giới thiệu sản phẩm cho mùa vụ cuối năm'),
         (opp2, o, 'Kênh YouTube du lịch Mặt Trời', acc2, con2, pb, 'negotiation', 70, 'best_case', current_date + 20, ld, 'Quản lý và sản xuất nội dung kênh');
  insert into public.opportunity_products (org_id, opportunity_id, product_id, description, unit, unit_price, quantity, tax_percent)
  values (o, opp, p1, 'Sản xuất video 3–5 phút', 'Video', 12000000, 4, 8), (o, opp, p2, 'Dựng hậu kỳ video', 'Video', 4000000, 2, 8),
         (o, opp2, p3, 'Quản lý kênh YouTube theo tháng', 'Tháng', 15000000, 6, 8);

  insert into public.quotes (id, org_id, code, opportunity_id, status, subtotal, tax_amount, total, recipient_name, accepted_at, expiry_date, owner_id)
  values (qt, o, 'BG0001', opp, 'accepted', 56000000, 4480000, 60480000, 'Chị Thu Hà', now() - interval '18 days', current_date - 5, ld);
  insert into public.quote_items (org_id, quote_id, position, description, unit, quantity, unit_price, tax_percent, amount)
  values (o, qt, 1, 'Sản xuất video 3–5 phút', 'Video', 4, 12000000, 8, 51840000), (o, qt, 2, 'Dựng hậu kỳ video', 'Video', 2, 4000000, 8, 8640000);
  insert into public.contracts (id, org_id, code, opportunity_id, quote_id, status, effective_date, expiry_date, duration_months, initial_value, current_value,
                                customer_signed_by, customer_signed_date, company_signed_by_id, company_signed_date)
  values (ct, o, 'HD0001', opp, qt, 'active', current_date - 15, current_date + 60, 3, 60480000, 60480000, 'Chị Thu Hà', current_date - 15, ld, current_date - 15);
  insert into public.orders (org_id, code, contract_id, status, activated_at, total) values (o, 'DH0001', ct, 'active', now() - interval '14 days', 60480000);

  insert into public.projects (id, org_id, code, name, kind, customer_id, opportunity_id, contract_id, stage, manager_id, start_date, end_date, description)
  values (pr, o, 'DA0001', 'Chiến dịch video giới thiệu nông sản Xanh', 'client', acc1, opp, ct, 'in_progress', ld, current_date - 14, current_date + 60,
          'Sản xuất 4 video giới thiệu + 2 video dựng hậu kỳ cho khách hàng Nông sản Xanh');
  insert into public.project_budgets (project_id, org_id, contract_value, budget_cost) values (pr, o, 60480000, 30000000);
  insert into public.project_members (org_id, project_id, user_id, role_label) values
    (o, pr, ld, 'Quản lý dự án'), (o, pr, '00000000-0000-4000-c000-000000000003', 'Content'),
    (o, pr, '00000000-0000-4000-c000-000000000005', 'Editor'), (o, pr, '00000000-0000-4000-c000-00000000000a', 'Trưởng nhóm');
  insert into public.project_milestones (id, org_id, project_id, name, amount, due_date, acceptance, accepted_at, payment, invoice_no, paid_at, sort_order) values
    (m1, o, pr, 'Tạm ứng 50% khi ký hợp đồng', 30240000, current_date - 15, 'accepted', now() - interval '15 days', 'paid', 'HDDT-0001', now() - interval '10 days', 0),
    (m2, o, pr, 'Thanh toán 50% khi nghiệm thu', 30240000, current_date + 60, 'pending', null, 'unpaid', null, null, 1);
  update public.videos set project_id = pr where code in ('D0002', 'D0004', 'D0005') and org_id = o;
  insert into public.org_counters (org_id, last_project_no, last_quote_no, last_contract_no, last_order_no) values (o, 1, 1, 1, 1)
  on conflict (org_id) do update set last_project_no = 1, last_quote_no = 1, last_contract_no = 1, last_order_no = 1;

  -- Thu / chi mẫu
  insert into public.incomes (org_id, occurred_on, project_id, source_id, milestone_id, amount, description, invoice_no, created_by)
  values (o, current_date - 10, pr, (select id from public.income_sources where org_id = o and name = 'Sản xuất video theo đơn hàng'), m1, 30240000,
          'DA0001 – Tạm ứng 50% khi ký hợp đồng', 'HDDT-0001', kt);
  insert into public.expenses (org_id, occurred_on, project_id, category_id, payee_type, payee_name, amount, description, approval, requested_by, approved_by, approved_at, payment, paid_on, paid_by)
  values (o, current_date - 8, pr, (select id from public.expense_categories where org_id = o and name = 'Giọng đọc / thu âm'), 'vendor', 'Phòng thu Âm Sắc', 3500000,
          'Thu giọng đọc 4 video', 'approved', '00000000-0000-4000-c000-000000000003', kt, now() - interval '7 days', 'paid', current_date - 6, kt),
         (o, current_date - 3, pr, (select id from public.expense_categories where org_id = o and name = 'Công cụ AI / phần mềm'), 'vendor', 'Dịch vụ AI video', 2200000,
          'Gói tạo cảnh AI tháng 11', 'submitted', '00000000-0000-4000-c000-000000000005', null, null, 'unpaid', null, null);

  -- Cộng tác viên
  insert into public.freelancers (id, org_id, user_id, full_name, phones, emails, skills, rate_note)
  values (fl, o, '00000000-0000-4000-c000-00000000000b', 'Cộng tác viên Trang', array['0944555666'], array['ctv@hanamedia.local'], array['Thiết kế thumbnail', 'Motion graphics'], '300k / thumbnail');
  insert into public.freelancer_payment_info (freelancer_id, org_id, bank_name, account_no, account_name)
  values (fl, o, 'Vietcombank', '0011223344', 'NGUYEN THI TRANG');
  insert into public.freelance_assignments (org_id, freelancer_id, project_id, context, title, description, due_date, fee, created_by)
  values (o, fl, pr, 'DA0001 – Chiến dịch video giới thiệu nông sản Xanh', 'Thiết kế 4 thumbnail video giới thiệu', 'Phong cách tươi sáng, chữ lớn, 1280x720', current_date + 5, 1200000, ld);

  -- Lương: hồ sơ cho nhân viên
  insert into public.salary_profiles (user_id, org_id, base_salary, bank_name, account_no, account_name)
  select p.id, o, case ur.role when 'manager' then 25000000 when 'content' then 12000000 when 'editor' then 11000000 when 'accountant' then 13000000
                    when 'hr' then 12000000 when 'team_lead' then 16000000 else 15000000 end, 'Techcombank', '19' || right(p.id::text, 8), upper(p.full_name)
  from public.profiles p join public.user_roles ur on ur.user_id = p.id and ur.org_id = o
  where p.org_id = o and ur.role <> 'collaborator' on conflict do nothing;
  insert into public.salary_allowances (org_id, user_id, name, amount)
  values (o, ld, 'Phụ cấp trách nhiệm', 3000000), (o, '00000000-0000-4000-c000-000000000003', 'Phụ cấp ăn trưa', 730000),
         (o, '00000000-0000-4000-c000-000000000005', 'Phụ cấp ăn trưa', 730000);
  insert into public.payroll_settings (org_id) values (o) on conflict do nothing;

  -- Phòng ban / chức vụ
  insert into public.department_managers (org_id, department_id, user_id, position_id)
  select o, '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-00000000000a', (select id from public.positions where org_id = o and name = 'Trưởng nhóm');
  insert into public.user_departments_positions (org_id, user_id, department_id, position_id)
  select o, p.id, p.department_id, (select id from public.positions where org_id = o and name = case ur.role when 'content' then 'Content' when 'editor' then 'Editor'
          when 'accountant' then 'Kế toán' when 'hr' then 'Nhân sự' when 'team_lead' then 'Trưởng nhóm' else 'Giám đốc' end)
  from public.profiles p join public.user_roles ur on ur.user_id = p.id and ur.org_id = o where p.org_id = o and p.department_id is not null and ur.role <> 'collaborator'
  on conflict do nothing;
end
$seed$;
