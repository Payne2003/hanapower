-- =====================================================================
-- 0520 · Dự án khách hàng: gắn tài khoản CRM, nhiều bộ phận cùng tham gia,
--        ngân sách (chỉ quản lý + kế toán thấy), mốc nghiệm thu & thanh toán.
-- =====================================================================
create type public.project_stage as enum ('planning', 'in_progress', 'acceptance', 'completed', 'on_hold', 'cancelled');
create type public.project_kind as enum ('client', 'internal');

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  code          text not null,
  name          text not null check (length(trim(name)) > 0),
  kind          public.project_kind not null default 'client',
  customer_id   uuid,
  opportunity_id uuid,
  contract_id   uuid,
  stage         public.project_stage not null default 'planning',
  manager_id    uuid,
  start_date    date,
  end_date      date,
  description   text,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, id), unique (org_id, code),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (org_id, customer_id) references public.accounts(org_id, id) on delete set null (customer_id),
  foreign key (org_id, opportunity_id) references public.opportunities(org_id, id) on delete set null (opportunity_id),
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete set null (contract_id),
  foreign key (org_id, manager_id) references public.profiles(org_id, id) on delete set null (manager_id)
);
create unique index projects_contract_uidx on public.projects(contract_id) where contract_id is not null and deleted_at is null;
create index projects_org_stage_idx on public.projects(org_id, stage) where deleted_at is null;
create trigger projects_touch before update on public.projects for each row execute function app.touch_updated_at();

create table public.project_members (
  org_id      uuid not null,
  project_id  uuid not null,
  user_id     uuid not null,
  role_label  text,                       -- vai trò trong dự án (Content, Editor, Thiết kế…)
  primary key (project_id, user_id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index project_members_user_idx on public.project_members(user_id);

-- Tiền của dự án tách riêng để thành viên thường không nhìn thấy
create table public.project_budgets (
  project_id     uuid primary key,
  org_id         uuid not null,
  contract_value numeric(16,2) not null default 0 check (contract_value >= 0),
  budget_cost    numeric(16,2) not null default 0 check (budget_cost >= 0),
  updated_at     timestamptz not null default now(),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade
);

create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  project_id   uuid not null,
  name         text not null check (length(trim(name)) > 0),
  amount       numeric(16,2) not null default 0 check (amount >= 0),
  due_date     date,
  acceptance   text not null default 'pending' check (acceptance in ('pending', 'accepted')),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  payment      text not null default 'unpaid' check (payment in ('unpaid', 'invoiced', 'paid')),
  invoice_no   text,
  paid_at      timestamptz,
  note         text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade
);
create index project_milestones_project_idx on public.project_milestones(project_id);
create trigger project_milestones_touch before update on public.project_milestones for each row execute function app.touch_updated_at();

-- Video thuộc dự án nào
alter table public.videos add column project_id uuid;
alter table public.videos add foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id);
create index videos_project_idx on public.videos(project_id) where project_id is not null;

-- ---------------------------------------------------------------------
-- Quyền xem / quản lý dự án
-- ---------------------------------------------------------------------
create or replace function app.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project and p.org_id = app.current_org_id() and p.deleted_at is null
      and (app.has_permission('projects.view_all') or p.manager_id = auth.uid()
           or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid()))
  )
$$;
create or replace function app.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project and p.org_id = app.current_org_id() and p.deleted_at is null
      and (app.has_permission('projects.manage_all') or p.manager_id = auth.uid())
  )
$$;
create or replace function app.can_see_money(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_permission('finance.view') or app.can_manage_project(p_project)
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_budgets enable row level security;
alter table public.project_milestones enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and app.can_view_project(id));
create policy project_members_select on public.project_members for select to authenticated
  using (org_id = app.current_org_id() and app.can_view_project(project_id));
create policy project_budgets_select on public.project_budgets for select to authenticated
  using (org_id = app.current_org_id() and app.can_see_money(project_id));
create policy project_milestones_select on public.project_milestones for select to authenticated
  using (org_id = app.current_org_id() and app.can_see_money(project_id));

revoke all on public.projects, public.project_members, public.project_budgets, public.project_milestones from anon, authenticated;
grant select on public.projects, public.project_members, public.project_budgets, public.project_milestones to authenticated;
grant all on public.projects, public.project_members, public.project_budgets, public.project_milestones to service_role;

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create or replace function app.check_members(p_org uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(coalesce(p_users, '{}')) u(id)
             where not exists (select 1 from public.profiles pr where pr.id = u.id and pr.org_id = p_org and pr.is_active)
                or app.has_role_of(u.id, 'collaborator')) then
    raise exception 'Thành viên không hợp lệ (không thuộc doanh nghiệp, đã khóa, hoặc là cộng tác viên)' using errcode = '22023';
  end if;
end $$;

create or replace function public.create_project(
  p_name text, p_kind public.project_kind default 'client', p_customer_id uuid default null, p_manager_id uuid default null,
  p_start date default null, p_end date default null, p_description text default null,
  p_contract_value numeric default 0, p_budget_cost numeric default 0, p_members uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; v_code text; v_mgr uuid := coalesce(p_manager_id, auth.uid());
begin
  if v_org is null or not app.has_permission('projects.create') then raise exception 'Bạn không có quyền tạo dự án' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên dự án' using errcode = '22023'; end if;
  if coalesce(p_kind, 'client') = 'client' and p_customer_id is null then raise exception 'Dự án khách hàng cần chọn khách hàng' using errcode = '22023'; end if;
  if p_customer_id is not null and not exists (select 1 from public.accounts where id = p_customer_id and org_id = v_org and deleted_at is null) then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if p_end is not null and p_start is not null and p_end < p_start then raise exception 'Ngày kết thúc phải sau ngày bắt đầu' using errcode = '22023'; end if;
  if coalesce(p_contract_value, 0) < 0 or coalesce(p_budget_cost, 0) < 0 then raise exception 'Số tiền không hợp lệ' using errcode = '22023'; end if;
  perform app.check_members(v_org, array_append(coalesce(p_members, '{}'), v_mgr));
  v_code := 'DA' || lpad(app.next_no(v_org, 'project')::text, 4, '0');
  insert into public.projects (org_id, code, name, kind, customer_id, manager_id, start_date, end_date, description)
  values (v_org, v_code, trim(p_name), coalesce(p_kind, 'client'), p_customer_id, v_mgr, p_start, p_end, nullif(trim(coalesce(p_description, '')), ''))
  returning id into v_id;
  insert into public.project_budgets (project_id, org_id, contract_value, budget_cost) values (v_id, v_org, coalesce(p_contract_value, 0), coalesce(p_budget_cost, 0));
  insert into public.project_members (org_id, project_id, user_id)
  select v_org, v_id, u from (select distinct unnest(array_append(coalesce(p_members, '{}'), v_mgr)) u) s;
  perform app.write_audit(v_org, 'project.create', 'project', v_id, jsonb_build_object('code', v_code, 'name', p_name));
  return v_id;
end $$;

create or replace function public.update_project(
  p_id uuid, p_name text, p_customer_id uuid default null, p_manager_id uuid default null,
  p_start date default null, p_end date default null, p_description text default null,
  p_contract_value numeric default null, p_budget_cost numeric default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); pr public.projects%rowtype;
begin
  select * into pr from public.projects where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền sửa dự án này' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên dự án' using errcode = '22023'; end if;
  if p_end is not null and p_start is not null and p_end < p_start then raise exception 'Ngày kết thúc phải sau ngày bắt đầu' using errcode = '22023'; end if;
  if p_customer_id is not null and not exists (select 1 from public.accounts where id = p_customer_id and org_id = v_org and deleted_at is null) then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if p_manager_id is not null then
    perform app.check_members(v_org, array[p_manager_id]);
    insert into public.project_members (org_id, project_id, user_id) values (v_org, p_id, p_manager_id) on conflict do nothing;
  end if;
  update public.projects set name = trim(p_name), customer_id = coalesce(p_customer_id, customer_id), manager_id = coalesce(p_manager_id, manager_id),
    start_date = p_start, end_date = p_end, description = nullif(trim(coalesce(p_description, '')), '') where id = p_id;
  if p_contract_value is not null or p_budget_cost is not null then
    if coalesce(p_contract_value, 0) < 0 or coalesce(p_budget_cost, 0) < 0 then raise exception 'Số tiền không hợp lệ' using errcode = '22023'; end if;
    insert into public.project_budgets (project_id, org_id, contract_value, budget_cost) values (p_id, v_org, coalesce(p_contract_value, 0), coalesce(p_budget_cost, 0))
    on conflict (project_id) do update set contract_value = coalesce(p_contract_value, public.project_budgets.contract_value),
      budget_cost = coalesce(p_budget_cost, public.project_budgets.budget_cost), updated_at = now();
  end if;
  perform app.write_audit(v_org, 'project.update', 'project', p_id, jsonb_build_object('code', pr.code));
end $$;

create or replace function public.set_project_stage(p_id uuid, p_stage public.project_stage) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype;
begin
  select * into pr from public.projects where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền đổi trạng thái dự án' using errcode = '42501'; end if;
  if pr.stage = p_stage then return; end if;
  if p_stage = 'completed' and exists (select 1 from public.project_milestones where project_id = p_id and acceptance <> 'accepted') then
    raise exception 'Còn mốc chưa nghiệm thu — hoàn tất các mốc trước khi đóng dự án' using errcode = '22023';
  end if;
  update public.projects set stage = p_stage where id = p_id;
  perform app.write_audit(pr.org_id, 'project.stage', 'project', p_id, jsonb_build_object('from', pr.stage, 'to', p_stage));
end $$;

create or replace function public.set_project_members(p_id uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); pr public.projects%rowtype; v_all uuid[];
begin
  select * into pr from public.projects where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền sửa thành viên' using errcode = '42501'; end if;
  v_all := array_append(coalesce(p_members, '{}'), pr.manager_id);
  perform app.check_members(v_org, v_all);
  delete from public.project_members where project_id = p_id and user_id <> all (v_all);
  insert into public.project_members (org_id, project_id, user_id)
  select v_org, p_id, u from (select distinct unnest(v_all) u) s where u is not null on conflict do nothing;
  perform app.write_audit(v_org, 'project.members', 'project', p_id, jsonb_build_object('count', cardinality(v_all)));
end $$;

create or replace function public.delete_project(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype;
begin
  select * into pr from public.projects where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.has_permission('projects.manage_all') then raise exception 'Chỉ quản lý được xóa dự án' using errcode = '42501'; end if;
  if exists (select 1 from public.incomes where project_id = p_id and status = 'confirmed') then
    raise exception 'Dự án đã có khoản thu — không xóa được, hãy chuyển sang Hủy' using errcode = '22023';
  end if;
  update public.projects set deleted_at = now() where id = p_id;
  perform app.write_audit(pr.org_id, 'project.delete', 'project', p_id, jsonb_build_object('code', pr.code));
end $$;

create or replace function public.link_video_project(p_video uuid, p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not exists (select 1 from public.videos where id = p_video and org_id = v_org) then raise exception 'Không tìm thấy video' using errcode = 'P0002'; end if;
  if p_project is null then
    if not (app.has_permission('projects.manage_all') or app.has_permission('videos.manage_all')) then raise exception 'Bạn không có quyền gỡ video khỏi dự án' using errcode = '42501'; end if;
  elsif not app.can_manage_project(p_project) then
    raise exception 'Chỉ quản lý dự án được thêm video vào dự án' using errcode = '42501';
  end if;
  update public.videos set project_id = p_project where id = p_video;
  perform app.write_audit(v_org, 'video.project', 'video', p_video, jsonb_build_object('project', p_project));
end $$;

-- Mốc nghiệm thu / thanh toán
create or replace function public.save_milestone(p_project uuid, p_id uuid, p_name text, p_amount numeric, p_due date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; m public.project_milestones%rowtype;
begin
  if not app.can_manage_project(p_project) then raise exception 'Bạn không có quyền sửa mốc của dự án này' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên mốc' using errcode = '22023'; end if;
  if coalesce(p_amount, 0) < 0 then raise exception 'Số tiền không hợp lệ' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.project_milestones (org_id, project_id, name, amount, due_date, note, sort_order)
    values (v_org, p_project, trim(p_name), coalesce(p_amount, 0), p_due, nullif(trim(coalesce(p_note, '')), ''),
            coalesce((select max(sort_order) + 1 from public.project_milestones where project_id = p_project), 0))
    returning id into v_id;
  else
    select * into m from public.project_milestones where id = p_id and project_id = p_project and org_id = v_org for update;
    if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
    if m.payment <> 'unpaid' and p_amount is distinct from m.amount then raise exception 'Mốc đã xuất hóa đơn / thu tiền — không đổi số tiền được' using errcode = '22023'; end if;
    update public.project_milestones set name = trim(p_name), amount = coalesce(p_amount, 0), due_date = p_due, note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_milestone(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.project_milestones%rowtype;
begin
  select * into m from public.project_milestones where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(m.project_id) then raise exception 'Bạn không có quyền xóa mốc' using errcode = '42501'; end if;
  if m.payment <> 'unpaid' then raise exception 'Mốc đã xuất hóa đơn / thu tiền — không xóa được' using errcode = '22023'; end if;
  delete from public.project_milestones where id = p_id;
end $$;

create or replace function public.milestone_acceptance(p_id uuid, p_accepted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.project_milestones%rowtype; pr public.projects%rowtype;
begin
  select * into m from public.project_milestones where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(m.project_id) then raise exception 'Bạn không có quyền nghiệm thu mốc này' using errcode = '42501'; end if;
  if not p_accepted and m.payment <> 'unpaid' then raise exception 'Mốc đã xuất hóa đơn / thu tiền — không hủy nghiệm thu được' using errcode = '22023'; end if;
  update public.project_milestones set acceptance = case when p_accepted then 'accepted' else 'pending' end,
    accepted_at = case when p_accepted then now() else null end, accepted_by = case when p_accepted then auth.uid() else null end where id = p_id;
  if p_accepted then
    select * into pr from public.projects where id = m.project_id;
    perform app.notify_permission(m.org_id, 'finance.manage', 'milestone_accepted',
      'Dự án ' || pr.code || ' đã nghiệm thu mốc "' || m.name || '" — có thể xuất hóa đơn', '/du-an/' || pr.id::text);
  end if;
  perform app.write_audit(m.org_id, case when p_accepted then 'milestone.accept' else 'milestone.unaccept' end, 'milestone', m.id, jsonb_build_object('name', m.name));
end $$;

create or replace function public.milestone_invoice(p_id uuid, p_invoice_no text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.project_milestones%rowtype;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền xuất hóa đơn' using errcode = '42501'; end if;
  select * into m from public.project_milestones where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
  if m.acceptance <> 'accepted' then raise exception 'Mốc chưa nghiệm thu — chưa xuất hóa đơn được' using errcode = '22023'; end if;
  if m.payment = 'paid' then raise exception 'Mốc đã thu tiền' using errcode = '22023'; end if;
  update public.project_milestones set payment = 'invoiced', invoice_no = nullif(trim(coalesce(p_invoice_no, '')), '') where id = p_id;
  perform app.write_audit(m.org_id, 'milestone.invoice', 'milestone', m.id, jsonb_build_object('invoice', p_invoice_no));
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue() from authenticated;
