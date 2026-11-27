-- =====================================================================
-- 0410 · Quyền mới cho dự án khách hàng, tài chính, lương, cộng tác viên
-- =====================================================================
insert into public.role_permissions (role, permission) values
  -- Quản trị hệ thống: toàn quyền nghiệp vụ mới
  ('system_admin', 'crm.view'),
  ('system_admin', 'crm.manage'),
  ('system_admin', 'projects.create'),
  ('system_admin', 'projects.view_all'),
  ('system_admin', 'projects.manage_all'),
  ('system_admin', 'finance.view'),
  ('system_admin', 'finance.manage'),
  ('system_admin', 'finance.approve'),
  ('system_admin', 'payroll.view'),
  ('system_admin', 'payroll.manage'),
  ('system_admin', 'payroll.approve'),
  ('system_admin', 'freelancers.manage'),
  -- Leader: quản lý khách hàng, dự án, duyệt chi phí, giao việc cho cộng tác viên (không xem lương)
  ('manager', 'crm.view'),
  ('manager', 'crm.manage'),
  ('manager', 'projects.create'),
  ('manager', 'projects.view_all'),
  ('manager', 'projects.manage_all'),
  ('manager', 'finance.view'),
  ('manager', 'finance.approve'),
  ('manager', 'freelancers.manage'),
  -- Trưởng nhóm: tạo dự án, quản lý dự án của mình
  ('team_lead', 'projects.create'),
  ('team_lead', 'crm.view'),
  ('team_lead', 'crm.manage'),
  -- Kế toán: tài chính đầy đủ, xem dự án, duyệt và xuất lương
  ('accountant', 'projects.view_all'),
  ('accountant', 'crm.view'),
  ('accountant', 'finance.view'),
  ('accountant', 'finance.manage'),
  ('accountant', 'finance.approve'),
  ('accountant', 'payroll.view'),
  ('accountant', 'payroll.approve'),
  -- Nhân sự: chấm công, hồ sơ lương, kiểm tra bảng lương
  ('hr', 'payroll.view'),
  ('hr', 'payroll.manage')
on conflict do nothing;

-- Thông báo có thể trỏ tới trang bất kỳ (không chỉ video)
alter table public.notifications add column if not exists link text;

create or replace function app.notify_link(p_org uuid, p_user uuid, p_kind text, p_message text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (org_id, user_id, kind, message, link)
  select p_org, p_user, p_kind, p_message, p_link
  where p_user is not null and p_user is distinct from auth.uid()
    and exists (select 1 from public.profiles where id = p_user and org_id = p_org and is_active)
$$;

-- Thông báo cho mọi người có một quyền (vd. mọi người duyệt chi phí)
create or replace function app.notify_permission(p_org uuid, p_permission text, p_kind text, p_message text, p_link text)
returns void language sql security definer set search_path = '' as $$
  select app.notify_link(p_org, u.user_id, p_kind, p_message, p_link)
  from (select distinct r.user_id from public.user_roles r join public.role_permissions rp on rp.role = r.role
        where r.org_id = p_org and rp.permission = p_permission) u
$$;

-- Bộ đếm mã dự án / báo giá / hợp đồng
alter table public.org_counters
  add column if not exists last_project_no int not null default 0,
  add column if not exists last_quote_no int not null default 0,
  add column if not exists last_contract_no int not null default 0;

create or replace function app.next_no(p_org uuid, p_kind text) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.org_counters (org_id) values (p_org) on conflict do nothing;
  if p_kind = 'project' then
    update public.org_counters set last_project_no = last_project_no + 1 where org_id = p_org returning last_project_no into v;
  elsif p_kind = 'quote' then
    update public.org_counters set last_quote_no = last_quote_no + 1 where org_id = p_org returning last_quote_no into v;
  elsif p_kind = 'contract' then
    update public.org_counters set last_contract_no = last_contract_no + 1 where org_id = p_org returning last_contract_no into v;
  else
    raise exception 'Loại mã không hợp lệ';
  end if;
  return v;
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text)
  from authenticated;
