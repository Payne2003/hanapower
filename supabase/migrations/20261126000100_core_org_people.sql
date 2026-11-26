-- =====================================================================
-- 0100 · Doanh nghiệp, phòng ban, hồ sơ nhân sự, vai trò và quyền
-- =====================================================================
-- Quy ước:
--   * Bảng nghiệp vụ nằm ở schema public, luôn có cột org_id.
--   * Các khóa ngoại dùng cặp (org_id, id) để không thể liên kết chéo doanh nghiệp.
--   * Hàm trợ giúp phân quyền nằm ở schema "app" (không public qua REST).
--   * Mọi thao tác ghi nghiệp vụ đi qua hàm RPC kiểm tra quyền; client chỉ được SELECT theo RLS.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Doanh nghiệp
-- ---------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  -- Múi giờ doanh nghiệp: dùng để chốt "ngày báo cáo", "quá hạn", "tuần".
  timezone    text not null default 'Asia/Ho_Chi_Minh',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Phòng ban
-- ---------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  manager_id  uuid,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

-- ---------------------------------------------------------------------
-- Hồ sơ nhân sự (1-1 với auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  org_id         uuid not null references public.organizations(id) on delete restrict,
  department_id  uuid,
  full_name      text not null check (length(trim(full_name)) > 0),
  email          text not null,
  job_title      text,
  phone          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, department_id) references public.departments(org_id, id) on delete set null (department_id)
);
create index profiles_org_idx on public.profiles(org_id);
create index profiles_department_idx on public.profiles(department_id);

alter table public.departments
  add constraint departments_manager_fk
  foreign key (org_id, manager_id) references public.profiles(org_id, id) on delete set null (manager_id);

-- ---------------------------------------------------------------------
-- Vai trò và quyền
-- ---------------------------------------------------------------------
create type public.app_role as enum ('system_admin', 'department_manager', 'project_manager', 'employee');

create table public.user_roles (
  org_id      uuid not null,
  user_id     uuid not null,
  role        public.app_role not null,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index user_roles_org_idx on public.user_roles(org_id);

-- Danh mục quyền theo vai trò (dữ liệu tham chiếu, không theo doanh nghiệp).
create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  -- Quản trị hệ thống
  ('system_admin', 'users.manage'),
  ('system_admin', 'roles.manage'),
  ('system_admin', 'departments.manage'),
  ('system_admin', 'projects.create'),
  ('system_admin', 'projects.view_all'),
  ('system_admin', 'projects.manage_all'),
  ('system_admin', 'audit.view'),
  -- Quản lý phòng ban
  ('department_manager', 'projects.create'),
  ('department_manager', 'reports.view_department'),
  -- Quản lý dự án
  ('project_manager', 'projects.create'),
  -- Nhân viên
  ('employee', 'reports.submit');
-- Ghi chú: quyền đọc chat riêng KHÔNG nằm trong danh mục này;
-- nó chỉ đi theo tư cách thành viên hội thoại.

-- ---------------------------------------------------------------------
-- Nhật ký kiểm toán
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  action       text not null,          -- vd: role.grant, task.reassign, task.approve, task.progress_edit
  entity_type  text not null,
  entity_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs(org_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- Hàm trợ giúp phân quyền (SECURITY DEFINER để tránh đệ quy RLS)
-- ---------------------------------------------------------------------
create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

create or replace function app.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.is_active
    where r.user_id = auth.uid() and r.role = p_role
  )
$$;

create or replace function app.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.is_active
    join public.role_permissions rp on rp.role = r.role
    where r.user_id = auth.uid() and rp.permission = p_permission
  )
$$;

-- Người dùng hiện tại là quản lý phòng ban của nhân viên p_user_id?
create or replace function app.is_department_manager_of(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('department_manager') and exists (
    select 1 from public.profiles u
    join public.departments d on d.id = u.department_id and d.org_id = u.org_id
    where u.id = p_user_id and d.manager_id = auth.uid()
  )
$$;

create or replace function app.today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select o.timezone from public.organizations o where o.id = app.current_org_id()),
    'Asia/Ho_Chi_Minh'))::date
$$;

create or replace function app.write_audit(
  p_org_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details)
  values (p_org_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations    enable row level security;
alter table public.departments      enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs       enable row level security;

create policy org_select on public.organizations for select to authenticated
  using (id = app.current_org_id());

create policy departments_select on public.departments for select to authenticated
  using (org_id = app.current_org_id());

create policy profiles_select on public.profiles for select to authenticated
  using (org_id = app.current_org_id());

create policy user_roles_select on public.user_roles for select to authenticated
  using (org_id = app.current_org_id());

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

create policy audit_select on public.audit_logs for select to authenticated
  using (org_id = app.current_org_id() and app.has_permission('audit.view'));

-- Client chỉ được đọc; ghi qua RPC.
revoke all on public.organizations, public.departments, public.profiles, public.user_roles,
  public.role_permissions, public.audit_logs from anon, authenticated;
grant select on public.organizations, public.departments, public.profiles, public.user_roles,
  public.role_permissions, public.audit_logs to authenticated;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- RPC: thông tin người dùng hiện tại (vai trò + quyền) cho giao diện
-- ---------------------------------------------------------------------
create or replace function public.get_my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.id is null then null else jsonb_build_object(
    'user_id', p.id,
    'org_id', p.org_id,
    'org_name', o.name,
    'timezone', o.timezone,
    'full_name', p.full_name,
    'email', p.email,
    'department_id', p.department_id,
    'is_active', p.is_active,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission)
      from public.user_roles r join public.role_permissions rp on rp.role = r.role
      where r.user_id = p.id), '[]'::jsonb),
    'today', (now() at time zone o.timezone)::date
  ) end
  from (select auth.uid() as uid) me
  left join public.profiles p on p.id = me.uid
  left join public.organizations o on o.id = p.org_id
$$;

-- ---------------------------------------------------------------------
-- RPC: quản trị hệ thống đổi vai trò (có nhật ký)
-- ---------------------------------------------------------------------
create or replace function public.set_user_roles(p_user_id uuid, p_roles public.app_role[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_old public.app_role[];
begin
  if not app.has_permission('roles.manage') then
    raise exception 'Bạn không có quyền đổi vai trò' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and org_id = v_org) then
    raise exception 'Không tìm thấy nhân sự' using errcode = 'P0002';
  end if;
  if p_user_id = auth.uid() and not ('system_admin' = any(p_roles)) then
    raise exception 'Không thể tự gỡ quyền quản trị hệ thống của chính mình' using errcode = '22023';
  end if;

  select coalesce(array_agg(role order by role), '{}') into v_old from public.user_roles where user_id = p_user_id;
  delete from public.user_roles where user_id = p_user_id and not (role = any(p_roles));
  insert into public.user_roles (org_id, user_id, role, granted_by)
    select v_org, p_user_id, r, auth.uid() from unnest(p_roles) r
    on conflict (user_id, role) do nothing;

  perform app.write_audit(v_org, 'role.set', 'profile', p_user_id,
    jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(p_roles)));
end $$;

create or replace function public.set_user_active(p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not app.has_permission('users.manage') then
    raise exception 'Bạn không có quyền quản lý tài khoản' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Không thể tự khóa tài khoản của chính mình' using errcode = '22023';
  end if;
  update public.profiles set is_active = p_active where id = p_user_id and org_id = v_org;
  if not found then raise exception 'Không tìm thấy nhân sự' using errcode = 'P0002'; end if;
  perform app.write_audit(v_org, case when p_active then 'user.activate' else 'user.deactivate' end,
    'profile', p_user_id, '{}'::jsonb);
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.get_my_context(), public.set_user_roles(uuid, public.app_role[]),
  public.set_user_active(uuid, boolean) to authenticated;
