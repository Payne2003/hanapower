-- =====================================================================
-- 0930 · Quản trị nhân sự: Phòng ban – Nhân viên – Chức vụ
--   * Một nhân viên được giữ NHIỀU chức vụ trong cùng một phòng (user_departments_positions đổi khóa chính).
--   * Hồ sơ nhân viên: mã NV, trạng thái nhân sự, hình thức làm việc, loại nhân sự; thông tin cá nhân nhạy cảm tách bảng riêng.
--   * Liên hệ (email cá nhân, điện thoại) có mục chính; tài liệu hồ sơ; phòng ban có trạng thái.
--   * Hàm danh sách / thống kê chạy ở CSDL (security invoker → RLS của người xem quyết định dữ liệu).
--   * Quyền mới `staff.manage` (quản trị + nhân sự); quản lý phòng xem được việc của thành viên phòng mình.
-- =====================================================================

create type public.employment_status as enum ('working', 'on_leave', 'resigned');
create type public.work_form as enum ('office', 'remote', 'hybrid');
create type public.employment_type as enum ('official', 'probation', 'intern', 'seasonal');

-- ---------------------------------------------------------------------
-- Hồ sơ: mã nhân viên và các trường công tác (không nhạy cảm → cả công ty thấy như danh bạ)
-- ---------------------------------------------------------------------
alter table public.org_counters add column last_staff_no integer not null default 0;
insert into public.org_counters (org_id) select distinct org_id from public.profiles on conflict do nothing;

alter table public.profiles
  add column employee_code text,
  add column employment_status public.employment_status not null default 'working',
  add column work_form public.work_form not null default 'office',
  add column employment_type public.employment_type not null default 'official',
  add column joined_on date,
  add column resigned_on date;
alter table public.profiles add constraint profiles_resigned_chk check (resigned_on is null or joined_on is null or resigned_on >= joined_on);

with n as (select id, row_number() over (partition by org_id order by created_at, id) rn from public.profiles)
update public.profiles p set employee_code = 'NV' || lpad(n.rn::text, 4, '0') from n where p.id = n.id;
update public.org_counters c set last_staff_no = (select count(*) from public.profiles p where p.org_id = c.org_id);
alter table public.profiles alter column employee_code set not null;
create unique index profiles_code_uidx on public.profiles(org_id, lower(employee_code));
create index profiles_status_idx on public.profiles(org_id, employment_status);

create or replace function app.trg_profile_code() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if nullif(trim(coalesce(new.employee_code, '')), '') is null then
    loop
      insert into public.org_counters (org_id) values (new.org_id) on conflict do nothing;
      update public.org_counters set last_staff_no = last_staff_no + 1 where org_id = new.org_id returning last_staff_no into v;
      new.employee_code := 'NV' || lpad(v::text, 4, '0');
      exit when not exists (select 1 from public.profiles where org_id = new.org_id and lower(employee_code) = lower(new.employee_code));
    end loop;
  else
    new.employee_code := trim(new.employee_code);
  end if;
  return new;
end $$;
create trigger profiles_code before insert on public.profiles for each row execute function app.trg_profile_code();

-- ---------------------------------------------------------------------
-- Phòng ban có trạng thái
-- ---------------------------------------------------------------------
alter table public.departments add column is_active boolean not null default true;

-- ---------------------------------------------------------------------
-- Phân công phòng ban – chức vụ: cho phép nhiều chức vụ trong cùng một phòng
-- ---------------------------------------------------------------------
alter table public.user_departments_positions add column id uuid not null default gen_random_uuid();
alter table public.user_departments_positions drop constraint user_departments_positions_pkey;
alter table public.user_departments_positions add primary key (id);
create unique index udp_user_dept_pos_uidx on public.user_departments_positions (user_id, department_id, coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index udp_dept_idx on public.user_departments_positions (department_id);
create index udp_position_idx on public.user_departments_positions (position_id) where position_id is not null;

-- ---------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, permission) values ('system_admin', 'staff.manage'), ('hr', 'staff.manage') on conflict do nothing;

create or replace function app.require_hr() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if v_org is null or not (app.has_permission('users.manage') or app.has_permission('staff.manage')) then raise exception 'Chỉ quản trị hoặc nhân sự được sửa cơ cấu phòng ban và hồ sơ nhân viên' using errcode = '42501'; end if;
  return v_org;
end $$;

-- Người dùng được xem / sửa dữ liệu riêng tư của p_user: chính họ hoặc quản trị / nhân sự.
create or replace function app.can_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (select 1 from public.profiles p where p.id = p_user and p.org_id = app.current_org_id())
    and (p_user = auth.uid() or app.has_permission('staff.manage') or app.has_permission('users.manage'))
$$;
create or replace function app.is_staff_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and (app.has_permission('staff.manage') or app.has_permission('users.manage'))
$$;
create or replace function app.is_dept_manager_of(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.department_managers dm join public.user_departments_positions u on u.department_id = dm.department_id
    where dm.user_id = auth.uid() and u.user_id = p_user and dm.org_id = app.current_org_id())
$$;

-- Quản lý phòng xem được công việc được giao cho thành viên phòng mình (phạm vi phòng được cấp).
create policy tasks_sel_dept_mgr on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and not app.has_role('collaborator')
         and exists (select 1 from public.task_assignees a where a.task_id = tasks.id and app.is_dept_manager_of(a.user_id)));

-- ---------------------------------------------------------------------
-- Thông tin cá nhân nhạy cảm (chỉ chính chủ + quản trị/nhân sự)
-- ---------------------------------------------------------------------
create table public.staff_personal (
  user_id uuid primary key,
  org_id uuid not null,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  address text check (length(address) <= 300),
  id_number text check (length(id_number) <= 30),
  tax_code text check (length(tax_code) <= 20),
  updated_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create table public.user_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 160),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create unique index user_emails_uidx on public.user_emails (org_id, lower(email));
create unique index user_emails_primary_uidx on public.user_emails (user_id) where is_primary;
create table public.user_phones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  country_code text not null default '+84' check (country_code ~ '^\+[0-9]{1,4}$'),
  phone text not null check (phone ~ '^[0-9]{5,15}$'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create unique index user_phones_uidx on public.user_phones (user_id, country_code, phone);
create unique index user_phones_primary_uidx on public.user_phones (user_id) where is_primary;
create table public.user_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  mime text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index user_documents_user_idx on public.user_documents (user_id);
-- Nội dung tệp tách bảng để danh sách không kéo theo dữ liệu nhị phân; chỉ đọc qua hàm get_user_document.
create table public.user_document_files (
  document_id uuid primary key references public.user_documents(id) on delete cascade,
  content bytea not null
);

alter table public.staff_personal enable row level security;
alter table public.user_emails enable row level security;
alter table public.user_phones enable row level security;
alter table public.user_documents enable row level security;
alter table public.user_document_files enable row level security;
create policy staff_personal_sel on public.staff_personal for select to authenticated using (org_id = app.current_org_id() and app.can_staff(user_id));
create policy user_emails_sel on public.user_emails for select to authenticated using (org_id = app.current_org_id() and app.can_staff(user_id));
create policy user_phones_sel on public.user_phones for select to authenticated using (org_id = app.current_org_id() and app.can_staff(user_id));
create policy user_documents_sel on public.user_documents for select to authenticated using (org_id = app.current_org_id() and app.can_staff(user_id));
revoke all on public.staff_personal, public.user_emails, public.user_phones, public.user_documents, public.user_document_files from anon, authenticated;
grant select on public.staff_personal, public.user_emails, public.user_phones, public.user_documents to authenticated;
grant all on public.staff_personal, public.user_emails, public.user_phones, public.user_documents, public.user_document_files to service_role;

-- ---------------------------------------------------------------------
-- Phòng ban: thành viên, nhiều chức vụ, nhiều quản lý
-- ---------------------------------------------------------------------
create or replace function app.check_dept_staff(p_org uuid, p_dept uuid, p_user uuid, p_need_active boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.departments%rowtype;
begin
  select * into d from public.departments where id = p_dept and org_id = p_org;
  if not found then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  if p_need_active and not d.is_active then raise exception 'Phòng ban đã ngừng hoạt động — bật lại trước khi thêm nhân viên' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user and org_id = p_org and is_active) then raise exception 'Không tìm thấy nhân viên đang hoạt động' using errcode = 'P0002'; end if;
  if app.has_role_of(p_user, 'collaborator') then raise exception 'Cộng tác viên không thuộc phòng ban' using errcode = '22023'; end if;
end $$;

-- Đồng bộ trưởng phòng "đại diện" (departments.manager_id) với danh sách quản lý.
create or replace function app.sync_dept_manager(p_dept uuid) returns void
language sql security definer set search_path = '' as $$
  update public.departments d set manager_id = (select dm.user_id from public.department_managers dm where dm.department_id = d.id order by (dm.user_id = d.manager_id) desc, dm.user_id limit 1)
  where d.id = p_dept
$$;

create or replace function public.add_department_member(p_dept uuid, p_user uuid, p_position uuid default null, p_primary boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); pr public.profiles%rowtype;
begin
  perform app.check_dept_staff(v_org, p_dept, p_user);
  select * into pr from public.profiles where id = p_user;
  if p_position is not null then
    if not exists (select 1 from public.positions where id = p_position and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy chức vụ' using errcode = 'P0002'; end if;
    delete from public.user_departments_positions where user_id = p_user and department_id = p_dept and position_id is null;
    insert into public.user_departments_positions (org_id, user_id, department_id, position_id, sort_order)
    values (v_org, p_user, p_dept, p_position, coalesce((select max(sort_order) + 1 from public.user_departments_positions where user_id = p_user and department_id = p_dept), 0))
    on conflict do nothing;
  else
    insert into public.user_departments_positions (org_id, user_id, department_id, position_id)
    select v_org, p_user, p_dept, null where not exists (select 1 from public.user_departments_positions where user_id = p_user and department_id = p_dept);
  end if;
  if coalesce(p_primary, true) or pr.department_id is null then update public.profiles set department_id = p_dept where id = p_user; end if;
  perform app.write_audit(v_org, 'department.member_add', 'department', p_dept, jsonb_build_object('user', p_user, 'position', p_position));
end $$;

-- Đặt toàn bộ chức vụ của nhân viên trong một phòng bằng MỘT giao dịch: thêm / bớt / sắp thứ tự (sort_order = vị trí trong mảng).
create or replace function public.set_member_positions(p_dept uuid, p_user uuid, p_positions uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_pos uuid[] := coalesce((select array_agg(x order by o) from (select x, min(o) o from unnest(coalesce(p_positions, '{}')) with ordinality t(x, o) where x is not null group by x) s), '{}');
begin
  perform app.check_dept_staff(v_org, p_dept, p_user);
  if exists (select 1 from unnest(v_pos) x where not exists (select 1 from public.positions where id = x and org_id = v_org and deleted_at is null)) then raise exception 'Không tìm thấy chức vụ' using errcode = 'P0002'; end if;
  delete from public.user_departments_positions where user_id = p_user and department_id = p_dept and org_id = v_org and (position_id is null or position_id <> all (v_pos));
  insert into public.user_departments_positions (org_id, user_id, department_id, position_id, sort_order)
  select v_org, p_user, p_dept, x, (o - 1)::int from unnest(v_pos) with ordinality t(x, o)
  on conflict (user_id, department_id, (coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update set sort_order = excluded.sort_order;
  if cardinality(v_pos) = 0 then
    insert into public.user_departments_positions (org_id, user_id, department_id, position_id) values (v_org, p_user, p_dept, null) on conflict do nothing;
  end if;
  perform app.write_audit(v_org, 'department.member_positions', 'department', p_dept, jsonb_build_object('user', p_user, 'positions', to_jsonb(v_pos)));
end $$;

create or replace function public.remove_department_member(p_dept uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_other uuid; v_was_mgr boolean;
begin
  if not exists (select 1 from public.departments where id = p_dept and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  -- Gỡ thành viên cũng chấm dứt vai trò quản lý phòng đó trong cùng giao dịch (không để người ngoài phòng làm quản lý).
  delete from public.department_managers where user_id = p_user and department_id = p_dept and org_id = v_org;
  v_was_mgr := found;
  delete from public.user_departments_positions where user_id = p_user and department_id = p_dept and org_id = v_org;
  perform app.sync_dept_manager(p_dept);
  select department_id into v_other from public.user_departments_positions where user_id = p_user and org_id = v_org order by sort_order, department_id limit 1;
  update public.profiles set department_id = v_other where id = p_user and org_id = v_org and department_id = p_dept;
  perform app.write_audit(v_org, 'department.member_remove', 'department', p_dept, jsonb_build_object('user', p_user, 'was_manager', v_was_mgr));
end $$;

create or replace function public.add_department_manager(p_dept uuid, p_user uuid, p_position uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  perform app.check_dept_staff(v_org, p_dept, p_user);
  if not exists (select 1 from public.user_departments_positions where user_id = p_user and department_id = p_dept) then
    raise exception 'Nhân viên phải là thành viên của phòng trước khi làm quản lý' using errcode = '22023';
  end if;
  if p_position is not null and not exists (select 1 from public.positions where id = p_position and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy chức vụ' using errcode = 'P0002'; end if;
  insert into public.department_managers (org_id, department_id, user_id, position_id) values (v_org, p_dept, p_user, p_position)
  on conflict (department_id, user_id) do update set position_id = excluded.position_id;
  perform app.sync_dept_manager(p_dept);
  perform app.write_audit(v_org, 'department.manager_add', 'department', p_dept, jsonb_build_object('user', p_user, 'position', p_position));
end $$;

create or replace function public.remove_department_manager(p_dept uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  delete from public.department_managers where department_id = p_dept and user_id = p_user and org_id = v_org;
  if not found then raise exception 'Nhân viên này không phải quản lý của phòng' using errcode = 'P0002'; end if;
  perform app.sync_dept_manager(p_dept);
  perform app.write_audit(v_org, 'department.manager_remove', 'department', p_dept, jsonb_build_object('user', p_user));
end $$;

-- Giữ nghiệp vụ cũ: đặt MỘT trưởng phòng (thay toàn bộ danh sách quản lý).
create or replace function public.set_department_manager(p_dept uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  if not exists (select 1 from public.departments where id = p_dept and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  if p_user is not null then perform app.check_dept_staff(v_org, p_dept, p_user, false); end if;
  delete from public.department_managers where department_id = p_dept and org_id = v_org;
  if p_user is not null then
    insert into public.user_departments_positions (org_id, user_id, department_id, position_id)
    select v_org, p_user, p_dept, null where not exists (select 1 from public.user_departments_positions where user_id = p_user and department_id = p_dept);
    insert into public.department_managers (org_id, department_id, user_id) values (v_org, p_dept, p_user);
  end if;
  update public.departments set manager_id = p_user where id = p_dept;
  perform app.write_audit(v_org, 'department.manager', 'department', p_dept, jsonb_build_object('user', p_user));
end $$;

create or replace function public.set_department_active(p_dept uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  update public.departments set is_active = coalesce(p_active, true) where id = p_dept and org_id = v_org;
  if not found then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  perform app.write_audit(v_org, case when p_active then 'department.activate' else 'department.deactivate' end, 'department', p_dept, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Hồ sơ nhân viên
-- ---------------------------------------------------------------------
create or replace function public.save_staff_profile(p_user uuid, p_code text, p_status public.employment_status, p_work_form public.work_form,
  p_type public.employment_type, p_joined_on date, p_resigned_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_code text := nullif(trim(coalesce(p_code, '')), ''); v_res date := p_resigned_on;
begin
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org) then raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002'; end if;
  if v_code is null then raise exception 'Nhập mã nhân viên' using errcode = '22023'; end if;
  if p_status = 'resigned' then v_res := coalesce(v_res, current_date); else v_res := null; end if;
  if p_joined_on is not null and v_res is not null and v_res < p_joined_on then raise exception 'Ngày nghỉ việc phải sau ngày vào làm' using errcode = '22023'; end if;
  update public.profiles set employee_code = v_code, employment_status = p_status, work_form = p_work_form, employment_type = p_type, joined_on = p_joined_on, resigned_on = v_res where id = p_user;
  perform app.write_audit(v_org, 'staff.profile', 'profile', p_user, jsonb_build_object('status', p_status, 'work_form', p_work_form, 'type', p_type));
exception when unique_violation then
  raise exception 'Mã nhân viên "%" đã được dùng', v_code using errcode = '23505';
end $$;

create or replace function public.save_staff_personal(p_user uuid, p_dob date, p_gender text, p_address text, p_id_number text, p_tax_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org) then raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002'; end if;
  if p_dob is not null and (p_dob > current_date or p_dob < date '1900-01-01') then raise exception 'Ngày sinh không hợp lệ' using errcode = '22023'; end if;
  insert into public.staff_personal (user_id, org_id, date_of_birth, gender, address, id_number, tax_code)
  values (p_user, v_org, p_dob, nullif(p_gender, ''), nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_id_number, '')), ''), nullif(trim(coalesce(p_tax_code, '')), ''))
  on conflict (user_id) do update set date_of_birth = excluded.date_of_birth, gender = excluded.gender, address = excluded.address,
    id_number = excluded.id_number, tax_code = excluded.tax_code, updated_at = now();
  perform app.write_audit(v_org, 'staff.personal', 'profile', p_user, '{}'::jsonb); -- không ghi nội dung nhạy cảm vào nhật ký
end $$;

-- ---------------------------------------------------------------------
-- Liên hệ: email cá nhân + điện thoại, đặt mục chính trong một giao dịch
-- ---------------------------------------------------------------------
create or replace function public.save_user_email(p_id uuid, p_user uuid, p_email text, p_primary boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_email text := lower(trim(coalesce(p_email, ''))); v_id uuid := p_id; v_owner uuid;
begin
  if p_id is not null then select user_id into v_owner from public.user_emails where id = p_id and org_id = v_org; if not found then raise exception 'Không tìm thấy email' using errcode = 'P0002'; end if; end if;
  if not app.can_staff(coalesce(v_owner, p_user)) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email không hợp lệ' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.user_emails (org_id, user_id, email, is_primary) values (v_org, p_user, v_email, false) returning id into v_id;
  else
    update public.user_emails set email = v_email where id = v_id;
  end if;
  select user_id into v_owner from public.user_emails where id = v_id;
  if coalesce(p_primary, false) or not exists (select 1 from public.user_emails where user_id = v_owner and is_primary) then
    update public.user_emails set is_primary = false where user_id = v_owner and is_primary and id <> v_id;
    update public.user_emails set is_primary = true where id = v_id;
  end if;
  perform app.write_audit(v_org, 'staff.email', 'profile', v_owner, '{}'::jsonb);
  return v_id;
exception when unique_violation then
  raise exception 'Email này đã được dùng cho một nhân viên khác' using errcode = '23505';
end $$;

create or replace function public.set_primary_user_email(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.user_emails where id = p_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy email' using errcode = 'P0002'; end if;
  if not app.can_staff(v_owner) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  update public.user_emails set is_primary = false where user_id = v_owner and is_primary and id <> p_id;
  update public.user_emails set is_primary = true where id = p_id;
end $$;

create or replace function public.delete_user_email(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_was boolean;
begin
  select user_id, is_primary into v_owner, v_was from public.user_emails where id = p_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy email' using errcode = 'P0002'; end if;
  if not app.can_staff(v_owner) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  delete from public.user_emails where id = p_id;
  if v_was then update public.user_emails set is_primary = true where id = (select id from public.user_emails where user_id = v_owner order by created_at limit 1); end if;
end $$;

create or replace function public.save_user_phone(p_id uuid, p_user uuid, p_country text, p_phone text, p_primary boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_cc text := coalesce(nullif(trim(coalesce(p_country, '')), ''), '+84'); v_ph text := regexp_replace(coalesce(p_phone, ''), '[\s.\-()]', '', 'g'); v_id uuid := p_id; v_owner uuid;
begin
  if p_id is not null then select user_id into v_owner from public.user_phones where id = p_id and org_id = v_org; if not found then raise exception 'Không tìm thấy số điện thoại' using errcode = 'P0002'; end if; end if;
  if not app.can_staff(coalesce(v_owner, p_user)) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  if v_cc !~ '^\+[0-9]{1,4}$' then raise exception 'Mã quốc gia không hợp lệ (vd. +84)' using errcode = '22023'; end if;
  if v_ph !~ '^[0-9]{5,15}$' then raise exception 'Số điện thoại chỉ gồm 5–15 chữ số' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.user_phones (org_id, user_id, country_code, phone) values (v_org, p_user, v_cc, v_ph) returning id into v_id;
  else
    update public.user_phones set country_code = v_cc, phone = v_ph where id = v_id;
  end if;
  select user_id into v_owner from public.user_phones where id = v_id;
  if coalesce(p_primary, false) or not exists (select 1 from public.user_phones where user_id = v_owner and is_primary) then
    update public.user_phones set is_primary = false where user_id = v_owner and is_primary and id <> v_id;
    update public.user_phones set is_primary = true where id = v_id;
  end if;
  perform app.write_audit(v_org, 'staff.phone', 'profile', v_owner, '{}'::jsonb);
  return v_id;
exception when unique_violation then
  raise exception 'Số điện thoại này đã có trong hồ sơ' using errcode = '23505';
end $$;

create or replace function public.set_primary_user_phone(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.user_phones where id = p_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy số điện thoại' using errcode = 'P0002'; end if;
  if not app.can_staff(v_owner) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  update public.user_phones set is_primary = false where user_id = v_owner and is_primary and id <> p_id;
  update public.user_phones set is_primary = true where id = p_id;
end $$;

create or replace function public.delete_user_phone(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_was boolean;
begin
  select user_id, is_primary into v_owner, v_was from public.user_phones where id = p_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy số điện thoại' using errcode = 'P0002'; end if;
  if not app.can_staff(v_owner) then raise exception 'Bạn không có quyền sửa liên hệ của nhân viên này' using errcode = '42501'; end if;
  delete from public.user_phones where id = p_id;
  if v_was then update public.user_phones set is_primary = true where id = (select id from public.user_phones where user_id = v_owner order by created_at limit 1); end if;
end $$;

-- ---------------------------------------------------------------------
-- Tài liệu hồ sơ (tệp ≤ 5 MB lưu trong CSDL, tải qua hàm kiểm quyền)
-- ---------------------------------------------------------------------
create or replace function public.save_user_document(p_user uuid, p_name text, p_mime text, p_content_base64 text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_bin bytea; v_id uuid; v_name text := regexp_replace(trim(coalesce(p_name, '')), '[/\\\r\n]', '_', 'g');
begin
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org) then raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002'; end if;
  if v_name = '' then raise exception 'Thiếu tên tệp' using errcode = '22023'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung tệp không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp rỗng' using errcode = '22023'; end if;
  if length(v_bin) > 5242880 then raise exception 'Tệp tối đa 5 MB' using errcode = '22023'; end if;
  insert into public.user_documents (org_id, user_id, name, mime, size_bytes) values (v_org, p_user, left(v_name, 160), coalesce(nullif(p_mime, ''), 'application/octet-stream'), length(v_bin)) returning id into v_id;
  insert into public.user_document_files (document_id, content) values (v_id, v_bin);
  perform app.write_audit(v_org, 'staff.document_add', 'profile', p_user, jsonb_build_object('name', left(v_name, 160)));
  return v_id;
end $$;

create or replace function public.get_user_document(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.user_documents%rowtype; v_bin bytea;
begin
  select * into d from public.user_documents where id = p_id and org_id = app.current_org_id();
  if not found or not app.can_staff(d.user_id) then raise exception 'Không tìm thấy tài liệu' using errcode = 'P0002'; end if; -- không lộ sự tồn tại cho người ngoài phạm vi
  select content into v_bin from public.user_document_files where document_id = p_id;
  return jsonb_build_object('name', d.name, 'mime', d.mime, 'size', d.size_bytes, 'content', encode(v_bin, 'base64'));
end $$;

create or replace function public.delete_user_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); d public.user_documents%rowtype;
begin
  delete from public.user_documents where id = p_id and org_id = v_org returning * into d;
  if not found then raise exception 'Không tìm thấy tài liệu' using errcode = 'P0002'; end if;
  perform app.write_audit(v_org, 'staff.document_delete', 'profile', d.user_id, jsonb_build_object('name', d.name));
end $$;

-- ---------------------------------------------------------------------
-- Danh sách / thống kê chạy ở CSDL (security invoker: RLS của người xem quyết định dữ liệu)
-- ---------------------------------------------------------------------
-- Tập nhân viên (không gồm cộng tác viên) khớp bộ lọc. Phòng + chức vụ phải khớp trên CÙNG một phân công.
create or replace function public.staff_filtered_ids(p_q text default null, p_dept uuid default null, p_position uuid default null,
  p_status public.employment_status default null, p_work_form public.work_form default null, p_unassigned boolean default false)
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select p.id from public.profiles p
  where not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'collaborator')
    and (p_status is null or p.employment_status = p_status)
    and (p_work_form is null or p.work_form = p_work_form)
    and (nullif(trim(coalesce(p_q, '')), '') is null
         or p.full_name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', ' ') || '%'
         or p.employee_code ilike '%' || replace(replace(trim(p_q), '%', ''), '_', ' ') || '%')
    and (not coalesce(p_unassigned, false) or not exists (select 1 from public.user_departments_positions u where u.user_id = p.id))
    and ((p_dept is null and p_position is null)
         or exists (select 1 from public.user_departments_positions u where u.user_id = p.id
                    and (p_dept is null or u.department_id = p_dept) and (p_position is null or u.position_id = p_position)))
$$;

create or replace function public.staff_list(p_q text default null, p_dept uuid default null, p_position uuid default null,
  p_status public.employment_status default null, p_work_form public.work_form default null, p_unassigned boolean default false,
  p_sort text default 'name', p_dir text default 'asc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_total int; v_rows jsonb; v_order text;
begin
  select count(*) into v_total from public.staff_filtered_ids(p_q, p_dept, p_position, p_status, p_work_form, p_unassigned);
  v_order := case p_sort when 'code' then 'p.employee_code' when 'status' then 'p.employment_status::text' when 'work_form' then 'p.work_form::text' else 'p.full_name' end
             || case when lower(coalesce(p_dir, 'asc')) = 'desc' then ' desc' else ' asc' end || ', p.full_name, p.id';
  execute format($f$
    select coalesce(jsonb_agg(s.j order by s.rn), '[]'::jsonb) from (
      select row_number() over (order by %s) rn, jsonb_build_object(
        'id', p.id, 'code', p.employee_code, 'name', p.full_name, 'email', p.email, 'status', p.employment_status, 'work_form', p.work_form,
        'type', p.employment_type, 'active', p.is_active,
        'assignments', (select coalesce(jsonb_agg(jsonb_build_object('dept_id', d.id, 'dept', d.name,
            'is_manager', exists (select 1 from public.department_managers dm where dm.user_id = p.id and dm.department_id = d.id),
            'positions', (select coalesce(jsonb_agg(jsonb_build_object('id', pos.id, 'name', pos.name) order by u2.sort_order, pos.name), '[]'::jsonb)
                          from public.user_departments_positions u2 join public.positions pos on pos.id = u2.position_id where u2.user_id = p.id and u2.department_id = d.id)
          ) order by d.name), '[]'::jsonb)
          from (select distinct department_id from public.user_departments_positions where user_id = p.id) x join public.departments d on d.id = x.department_id)
      ) j
      from public.profiles p
      where p.id in (select public.staff_filtered_ids($1, $2, $3, $4, $5, $6))
      order by %s limit $7 offset $8) s$f$, v_order, v_order)
  into v_rows using p_q, p_dept, p_position, p_status, p_work_form, p_unassigned, least(greatest(coalesce(p_limit, 20), 1), 500), greatest(coalesce(p_offset, 0), 0);
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- Tổng hợp trên TOÀN BỘ tập khớp bộ lọc (không phải trang hiện tại).
create or replace function public.staff_summary(p_q text default null, p_dept uuid default null, p_position uuid default null,
  p_status public.employment_status default null, p_work_form public.work_form default null, p_unassigned boolean default false) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with f as (select id from public.staff_filtered_ids(p_q, p_dept, p_position, p_status, p_work_form, p_unassigned) id)
  select jsonb_build_object(
    'total', (select count(*) from f),
    'by_status', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select employment_status::text s, count(*) c from public.profiles where id in (select id from f) group by 1) q),
    'by_work_form', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select work_form::text s, count(*) c from public.profiles where id in (select id from f) group by 1) q),
    'by_department', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'count', q.c) order by q.c desc, d.name), '[]'::jsonb)
        from (select department_id, count(distinct user_id) c from public.user_departments_positions where user_id in (select id from f) group by 1) q join public.departments d on d.id = q.department_id),
    'by_position', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'name', ps.name, 'count', q.c) order by q.c desc, ps.name), '[]'::jsonb)
        from (select position_id, count(distinct user_id) c from public.user_departments_positions where position_id is not null and user_id in (select id from f) group by 1) q join public.positions ps on ps.id = q.position_id),
    'unassigned', (select count(*) from public.profiles where id in (select id from f) and not exists (select 1 from public.user_departments_positions u where u.user_id = profiles.id)))
$$;

create or replace function public.department_list(p_q text default null, p_active boolean default null, p_sort text default 'name', p_dir text default 'asc',
  p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_rows jsonb; v_total int; v_order text;
begin
  select count(*) into v_total from public.departments d where (p_active is null or d.is_active = p_active) and (nullif(trim(coalesce(p_q, '')), '') is null or d.name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', ' ') || '%');
  v_order := case p_sort when 'members' then 'member_count' when 'positions' then 'position_count' when 'status' then 'is_active' else 'name' end
             || case when lower(coalesce(p_dir, 'asc')) = 'desc' then ' desc' else ' asc' end || ', name, id';
  execute format($f$
    select coalesce(jsonb_agg(j order by rn), '[]'::jsonb) from (
      select row_number() over (order by %s) rn, j from (
        select d.name, d.id, d.is_active,
          (select count(distinct user_id) from public.user_departments_positions u where u.department_id = d.id) member_count,
          (select count(distinct position_id) from public.user_departments_positions u where u.department_id = d.id and position_id is not null) position_count,
          jsonb_build_object('id', d.id, 'name', d.name, 'active', d.is_active,
            'member_count', (select count(distinct user_id) from public.user_departments_positions u where u.department_id = d.id),
            'position_count', (select count(distinct position_id) from public.user_departments_positions u where u.department_id = d.id and position_id is not null),
            'managers', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'position', ps.name) order by p.full_name), '[]'::jsonb)
                         from public.department_managers dm join public.profiles p on p.id = dm.user_id left join public.positions ps on ps.id = dm.position_id where dm.department_id = d.id)) j
        from public.departments d
        where ($1 is null or d.is_active = $1) and (nullif(trim(coalesce($2, '')), '') is null or d.name ilike '%%' || replace(replace(trim($2), '%%', ''), '_', ' ') || '%%')
      ) x order by %s limit $3 offset $4) s$f$, v_order, v_order)
  into v_rows using p_active, p_q, least(greatest(coalesce(p_limit, 20), 1), 200), greatest(coalesce(p_offset, 0), 0);
  return jsonb_build_object('total', v_total, 'rows', v_rows,
    'totals', jsonb_build_object('departments', (select count(*) from public.departments), 'active', (select count(*) from public.departments where is_active),
      'members', (select count(distinct u.user_id) from public.user_departments_positions u),
      'unassigned', (select count(*) from public.profiles p where not exists (select 1 from public.user_departments_positions u where u.user_id = p.id) and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'collaborator'))));
end $$;

create or replace function public.department_overview(p_dept uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'dept', jsonb_build_object('id', d.id, 'name', d.name, 'active', d.is_active),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'code', p.employee_code, 'name', p.full_name, 'position_id', dm.position_id, 'position', ps.name) order by p.full_name), '[]'::jsonb)
                 from public.department_managers dm join public.profiles p on p.id = dm.user_id left join public.positions ps on ps.id = dm.position_id where dm.department_id = d.id),
    'members', (select coalesce(jsonb_agg(m.j order by m.name), '[]'::jsonb) from (
        select p.full_name name, jsonb_build_object('id', p.id, 'code', p.employee_code, 'name', p.full_name, 'email', p.email, 'work_form', p.work_form, 'status', p.employment_status, 'type', p.employment_type,
          'is_manager', exists (select 1 from public.department_managers dm where dm.department_id = d.id and dm.user_id = p.id),
          'is_primary', p.department_id = d.id,
          'positions', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'name', ps.name) order by u2.sort_order, ps.name), '[]'::jsonb)
                        from public.user_departments_positions u2 join public.positions ps on ps.id = u2.position_id where u2.user_id = p.id and u2.department_id = d.id)) j
        from public.profiles p where p.id in (select user_id from public.user_departments_positions where department_id = d.id)
          and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'collaborator')) m),
    'by_position', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'name', ps.name, 'count', q.c) order by q.c desc, ps.name), '[]'::jsonb)
                    from (select position_id, count(distinct user_id) c from public.user_departments_positions where department_id = d.id and position_id is not null group by 1) q join public.positions ps on ps.id = q.position_id),
    'by_work_form', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select p.work_form::text s, count(*) c from public.profiles p where p.id in (select user_id from public.user_departments_positions where department_id = d.id) group by 1) q),
    'by_status', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select p.employment_status::text s, count(*) c from public.profiles p where p.id in (select user_id from public.user_departments_positions where department_id = d.id) group by 1) q),
    'member_count', (select count(distinct user_id) from public.user_departments_positions where department_id = d.id),
    'position_count', (select count(distinct position_id) from public.user_departments_positions where department_id = d.id and position_id is not null))
  from public.departments d where d.id = p_dept
$$;

-- Công việc của thành viên phòng: mỗi task đúng MỘT lần dù nhiều thành viên cùng được giao (RLS tasks quyết định thấy gì).
create or replace function public.department_tasks(p_dept uuid, p_limit int default 100) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', (select count(distinct t.id) from public.tasks t join public.task_assignees a on a.task_id = t.id
                                      where t.deleted_at is null and a.user_id in (select user_id from public.user_departments_positions where department_id = p_dept)),
    'rows', (select coalesce(jsonb_agg(x.j order by x.sched nulls last, x.title), '[]'::jsonb) from (
      select t.title, t.scheduled_at sched, jsonb_build_object('id', t.id, 'title', t.title, 'type', t.task_type, 'status', t.status, 'priority', t.priority, 'scheduled_at', t.scheduled_at,
        'video_id', t.video_id, 'assignees', jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name)) j
      from public.tasks t join public.task_assignees a on a.task_id = t.id join public.profiles p on p.id = a.user_id
      where t.deleted_at is null and a.user_id in (select user_id from public.user_departments_positions where department_id = p_dept)
      group by t.id order by t.scheduled_at nulls last, t.title limit least(greatest(coalesce(p_limit, 100), 1), 500)) x))
$$;

create or replace function public.position_list() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'name', ps.name, 'active', ps.is_active,
    'staff_count', (select count(distinct user_id) from public.user_departments_positions u where u.position_id = ps.id),
    'dept_count', (select count(distinct department_id) from public.user_departments_positions u where u.position_id = ps.id)) order by ps.name), '[]'::jsonb)
  from public.positions ps where ps.deleted_at is null
$$;

revoke all on function public.staff_filtered_ids(text, uuid, uuid, public.employment_status, public.work_form, boolean) from public, anon;
grant execute on function public.staff_filtered_ids(text, uuid, uuid, public.employment_status, public.work_form, boolean) to authenticated;
revoke all on function public.save_user_document(uuid, text, text, text), public.get_user_document(uuid) from public, anon;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid), app.sync_video_tasks(uuid), app.trg_videos_sync_tasks(), app.trg_items_sync_tasks(), app.trg_tasks_guard(),
  app.trg_profile_code(), app.check_dept_staff(uuid, uuid, uuid, boolean), app.sync_dept_manager(uuid) from authenticated;
