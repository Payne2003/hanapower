-- =====================================================================
-- 0400 · Thêm vai trò: trưởng nhóm, kế toán, nhân sự, cộng tác viên (freelancer)
-- Tách riêng một tệp vì giá trị enum mới chỉ dùng được sau khi giao dịch này kết thúc.
-- =====================================================================
alter type public.app_role add value if not exists 'team_lead';
alter type public.app_role add value if not exists 'accountant';
alter type public.app_role add value if not exists 'hr';
alter type public.app_role add value if not exists 'collaborator';
