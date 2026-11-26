-- =====================================================================
-- 0200 · Dự án, thành viên, công việc, lịch sử công việc, tiến độ
-- =====================================================================

create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  description    text,
  manager_id     uuid not null,
  department_id  uuid,
  start_date     date not null default current_date,
  due_date       date,
  status         public.project_status not null default 'active',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  check (due_date is null or due_date >= start_date),
  foreign key (org_id, manager_id) references public.profiles(org_id, id) on delete restrict,
  foreign key (org_id, department_id) references public.departments(org_id, id) on delete set null (department_id)
);
create index projects_org_idx on public.projects(org_id);
create index projects_manager_idx on public.projects(manager_id);

create table public.project_members (
  org_id      uuid not null,
  project_id  uuid not null,
  user_id     uuid not null,
  member_role text not null default 'member' check (member_role in ('manager', 'member')),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index project_members_user_idx on public.project_members(user_id);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  project_id     uuid not null,
  title          text not null check (length(trim(title)) > 0),
  description    text,
  assignee_id    uuid not null,
  priority       public.task_priority not null default 'medium',
  status         public.task_status not null default 'todo',
  start_date     date,
  due_date       date,
  progress       integer not null default 0 check (progress between 0 and 100),
  weight         numeric(8,2) not null default 1 check (weight > 0),
  is_blocked     boolean not null default false,
  blocker_note   text,
  return_reason  text,
  approved_by    uuid references auth.users(id) on delete set null,
  approved_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (project_id, id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  -- Người phụ trách phải là thành viên dự án (và cùng doanh nghiệp thông qua project_members).
  foreign key (project_id, assignee_id) references public.project_members(project_id, user_id),
  -- Việc đã hoàn tất luôn có tiến độ 100%. Việc chờ duyệt cũng là 100%.
  check (status not in ('in_review', 'done') or progress = 100),
  check (status <> 'done' or approved_at is not null)
);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_assignee_idx on public.tasks(assignee_id, status);

create trigger projects_touch before update on public.projects
  for each row execute function app.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();

-- Lịch sử thay đổi công việc
create table public.task_events (
  id             bigint generated always as identity primary key,
  org_id         uuid not null,
  task_id        uuid not null,
  actor_id       uuid references auth.users(id) on delete set null,
  event_type     text not null check (event_type in
                   ('created','status_change','progress_update','blocker','reassign','approve','return','comment','cancel','edit')),
  from_status    public.task_status,
  to_status      public.task_status,
  from_progress  integer,
  to_progress    integer,
  note           text,
  source         text not null default 'manual' check (source in ('manual','daily_report')),
  report_id      uuid,
  created_at     timestamptz not null default now(),
  foreign key (org_id, task_id) references public.tasks(org_id, id) on delete cascade
);
create index task_events_task_idx on public.task_events(task_id, created_at desc);

create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  task_id     uuid not null,
  author_id   uuid not null,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  foreign key (org_id, task_id) references public.tasks(org_id, id) on delete cascade,
  foreign key (org_id, author_id) references public.profiles(org_id, id) on delete cascade
);
create index task_comments_task_idx on public.task_comments(task_id, created_at);

-- ---------------------------------------------------------------------
-- Hàm phân quyền theo dự án
-- ---------------------------------------------------------------------
create or replace function app.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.project_members m where m.project_id = p_project_id and m.user_id = auth.uid())
$$;

-- Quản lý dự án = manager_id của dự án, hoặc thành viên có member_role = 'manager'.
-- Quản trị hệ thống có quyền projects.manage_all trong doanh nghiệp của mình.
create or replace function app.can_manage_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.org_id = app.current_org_id()
      and (p.manager_id = auth.uid()
           or exists (select 1 from public.project_members m
                      where m.project_id = p.id and m.user_id = auth.uid() and m.member_role = 'manager')
           or app.has_permission('projects.manage_all')))
$$;

create or replace function app.can_view_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.org_id = app.current_org_id()
      and (p.manager_id = auth.uid()
           or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid())
           or app.has_permission('projects.view_all')
           or (p.department_id is not null and app.has_role('department_manager') and exists (
                 select 1 from public.departments d where d.id = p.department_id and d.manager_id = auth.uid()))))
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_events     enable row level security;
alter table public.task_comments   enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (app.can_view_project(id));
create policy project_members_select on public.project_members for select to authenticated
  using (app.can_view_project(project_id));
create policy tasks_select on public.tasks for select to authenticated
  using (app.can_view_project(project_id));
create policy task_events_select on public.task_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and app.can_view_project(t.project_id)));
create policy task_comments_select on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and app.can_view_project(t.project_id)));

revoke all on public.projects, public.project_members, public.tasks, public.task_events, public.task_comments
  from anon, authenticated;
grant select on public.projects, public.project_members, public.tasks, public.task_events, public.task_comments
  to authenticated;
grant all on public.projects, public.project_members, public.tasks, public.task_events, public.task_comments
  to service_role;

-- ---------------------------------------------------------------------
-- Thống kê tiến độ dự án
--   Tiến độ = Σ(tiến độ × trọng số) / Σ trọng số, loại việc đã hủy.
--   Dự án chưa có việc hợp lệ → progress = NULL ("Chưa có dữ liệu tiến độ").
--   Số việc hoàn tất chỉ tính việc đã được duyệt (status = 'done').
-- ---------------------------------------------------------------------
create or replace view public.project_stats with (security_invoker = true) as
select
  p.id as project_id,
  p.org_id,
  case when coalesce(sum(t.weight) filter (where t.status <> 'cancelled'), 0) = 0 then null
       else round(sum(t.progress * t.weight) filter (where t.status <> 'cancelled')
                  / sum(t.weight) filter (where t.status <> 'cancelled'), 1)
  end as progress,
  count(t.id) filter (where t.status <> 'cancelled')::int as total_tasks,
  count(t.id) filter (where t.status = 'done')::int as done_tasks,
  count(t.id) filter (where t.status = 'in_review')::int as review_tasks,
  count(t.id) filter (where t.is_blocked and t.status not in ('done','cancelled'))::int as blocked_tasks,
  count(t.id) filter (where t.due_date < (now() at time zone o.timezone)::date
                        and t.status not in ('done','cancelled'))::int as overdue_tasks
from public.projects p
join public.organizations o on o.id = p.org_id
left join public.tasks t on t.project_id = p.id
group by p.id, p.org_id;

grant select on public.project_stats to authenticated;

-- ---------------------------------------------------------------------
-- RPC: tạo dự án
-- ---------------------------------------------------------------------
create or replace function public.create_project(
  p_name text,
  p_description text default null,
  p_start_date date default null,
  p_due_date date default null,
  p_manager_id uuid default null,
  p_department_id uuid default null,
  p_member_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_manager uuid := coalesce(p_manager_id, auth.uid());
  v_id uuid;
begin
  if v_org is null then raise exception 'Tài khoản không hoạt động' using errcode = '42501'; end if;
  if not app.has_permission('projects.create') then
    raise exception 'Bạn không có quyền tạo dự án' using errcode = '42501';
  end if;
  if v_manager <> auth.uid() and not app.has_permission('projects.manage_all') then
    raise exception 'Chỉ quản trị hệ thống được chỉ định người khác làm quản lý dự án' using errcode = '42501';
  end if;

  insert into public.projects (org_id, name, description, manager_id, department_id, start_date, due_date, created_by)
  values (v_org, trim(p_name), nullif(trim(p_description), ''), v_manager, p_department_id,
          coalesce(p_start_date, app.today()), p_due_date, auth.uid())
  returning id into v_id;

  insert into public.project_members (org_id, project_id, user_id, member_role)
  values (v_org, v_id, v_manager, 'manager');

  insert into public.project_members (org_id, project_id, user_id, member_role)
  select v_org, v_id, u, 'member' from unnest(coalesce(p_member_ids, '{}')) u
  where u <> v_manager
  on conflict do nothing;

  perform app.write_audit(v_org, 'project.create', 'project', v_id, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create or replace function public.add_project_members(p_project_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Bạn không có quyền quản lý thành viên dự án này' using errcode = '42501';
  end if;
  insert into public.project_members (org_id, project_id, user_id)
  select v_org, p_project_id, u from unnest(p_user_ids) u
  on conflict do nothing;
  perform app.write_audit(v_org, 'project.members_add', 'project', p_project_id, jsonb_build_object('users', to_jsonb(p_user_ids)));
end $$;

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Bạn không có quyền quản lý thành viên dự án này' using errcode = '42501';
  end if;
  if exists (select 1 from public.projects where id = p_project_id and manager_id = p_user_id) then
    raise exception 'Không thể gỡ quản lý dự án khỏi dự án' using errcode = '22023';
  end if;
  if exists (select 1 from public.tasks where project_id = p_project_id and assignee_id = p_user_id
             and status not in ('done','cancelled')) then
    raise exception 'Nhân sự đang phụ trách công việc chưa xong; hãy giao lại trước khi gỡ' using errcode = '22023';
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
  perform app.write_audit(v_org, 'project.member_remove', 'project', p_project_id, jsonb_build_object('user', p_user_id));
end $$;

-- ---------------------------------------------------------------------
-- RPC: công việc
-- ---------------------------------------------------------------------
create or replace function public.create_task(
  p_project_id uuid,
  p_title text,
  p_assignee_id uuid,
  p_description text default null,
  p_priority public.task_priority default 'medium',
  p_due_date date default null,
  p_weight numeric default 1
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_id uuid;
begin
  if not app.can_manage_project(p_project_id) then
    raise exception 'Bạn không có quyền giao việc trong dự án này' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_assignee_id) then
    raise exception 'Người phụ trách phải là thành viên dự án' using errcode = '22023';
  end if;
  if coalesce(p_weight, 1) <= 0 then
    raise exception 'Trọng số phải lớn hơn 0' using errcode = '22023';
  end if;

  insert into public.tasks (org_id, project_id, title, description, assignee_id, priority, due_date, weight, created_by)
  values (v_org, p_project_id, trim(p_title), nullif(trim(p_description), ''), p_assignee_id,
          coalesce(p_priority, 'medium'), p_due_date, coalesce(p_weight, 1), auth.uid())
  returning id into v_id;

  insert into public.task_events (org_id, task_id, actor_id, event_type, to_status, to_progress)
  values (v_org, v_id, auth.uid(), 'created', 'todo', 0);
  return v_id;
end $$;

-- Hàm nội bộ: áp dụng cập nhật tiến độ của người phụ trách (dùng chung cho cập nhật nhanh và báo cáo ngày).
-- Trả về trạng thái mới. Không kiểm tra quyền — hàm gọi phải kiểm tra.
create or replace function app.apply_progress(
  p_task_id uuid, p_progress integer, p_blocker text, p_note text, p_source text, p_report_id uuid
) returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks%rowtype;
  v_new_status public.task_status;
  v_blocker text := nullif(trim(coalesce(p_blocker, '')), '');
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    raise exception 'Tiến độ phải trong khoảng 0–100' using errcode = '22023';
  end if;

  -- Việc đã chờ duyệt / hoàn tất / hủy: không đổi tiến độ, chỉ ghi nhận vướng mắc nếu có.
  if t.status in ('in_review', 'done', 'cancelled') then
    if v_blocker is distinct from t.blocker_note and t.status = 'in_review' then
      update public.tasks set is_blocked = v_blocker is not null, blocker_note = v_blocker where id = t.id;
      insert into public.task_events (org_id, task_id, actor_id, event_type, note, source, report_id)
      values (t.org_id, t.id, auth.uid(), 'blocker', coalesce(v_blocker, 'Đã gỡ vướng mắc'), p_source, p_report_id);
    end if;
    return t.status;
  end if;

  v_new_status := case
    when p_progress = 100 then 'in_review'::public.task_status
    when p_progress > 0 or t.status = 'in_progress' then 'in_progress'::public.task_status
    else 'todo'::public.task_status
  end;

  update public.tasks
     set progress = p_progress,
         status = v_new_status,
         is_blocked = v_blocker is not null,
         blocker_note = v_blocker,
         return_reason = case when v_new_status = 'in_review' then null else return_reason end
   where id = t.id;

  if p_progress <> t.progress or nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into public.task_events (org_id, task_id, actor_id, event_type, from_status, to_status,
                                    from_progress, to_progress, note, source, report_id)
    values (t.org_id, t.id, auth.uid(), 'progress_update', t.status, v_new_status,
            t.progress, p_progress, nullif(trim(coalesce(p_note, '')), ''), p_source, p_report_id);
  elsif v_new_status <> t.status then
    insert into public.task_events (org_id, task_id, actor_id, event_type, from_status, to_status, source, report_id)
    values (t.org_id, t.id, auth.uid(), 'status_change', t.status, v_new_status, p_source, p_report_id);
  end if;

  if v_blocker is distinct from t.blocker_note then
    insert into public.task_events (org_id, task_id, actor_id, event_type, note, source, report_id)
    values (t.org_id, t.id, auth.uid(), 'blocker', coalesce(v_blocker, 'Đã gỡ vướng mắc'), p_source, p_report_id);
  end if;

  return v_new_status;
end $$;

-- Cập nhật nhanh của người phụ trách (trang "Việc của tôi").
create or replace function public.update_task_progress(
  p_task_id uuid, p_progress integer, p_note text default null, p_blocker text default null
) returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id();
  if not found or not app.can_view_project(t.project_id) then
    raise exception 'Không tìm thấy công việc' using errcode = 'P0002';
  end if;
  if t.assignee_id <> auth.uid() then
    raise exception 'Chỉ người phụ trách được cập nhật tiến độ' using errcode = '42501';
  end if;
  return app.apply_progress(p_task_id, p_progress, p_blocker, p_note, 'manual', null);
end $$;

-- Quản lý duyệt việc đang chờ duyệt.
create or replace function public.approve_task(p_task_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(t.project_id) then
    raise exception 'Bạn không có quyền duyệt công việc này' using errcode = '42501';
  end if;
  if t.status = 'done' then return; end if;  -- duyệt lặp lại: không đổi kết quả
  if t.status <> 'in_review' then
    raise exception 'Chỉ duyệt được công việc đang chờ duyệt' using errcode = '22023';
  end if;
  update public.tasks set status = 'done', approved_by = auth.uid(), approved_at = now(),
         is_blocked = false, blocker_note = null where id = t.id;
  insert into public.task_events (org_id, task_id, actor_id, event_type, from_status, to_status, note)
  values (t.org_id, t.id, auth.uid(), 'approve', t.status, 'done', nullif(trim(coalesce(p_note,'')), ''));
  perform app.write_audit(t.org_id, 'task.approve', 'task', t.id, jsonb_build_object('project_id', t.project_id));
end $$;

-- Quản lý trả lại việc kèm lý do.
create or replace function public.return_task(p_task_id uuid, p_reason text, p_progress integer default 90) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(t.project_id) then
    raise exception 'Bạn không có quyền trả lại công việc này' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Cần nhập lý do trả lại' using errcode = '22023';
  end if;
  if t.status <> 'in_review' then
    raise exception 'Chỉ trả lại được công việc đang chờ duyệt' using errcode = '22023';
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 99 then
    raise exception 'Tiến độ sau khi trả lại phải trong khoảng 0–99' using errcode = '22023';
  end if;
  update public.tasks set status = 'in_progress', progress = p_progress, return_reason = trim(p_reason) where id = t.id;
  insert into public.task_events (org_id, task_id, actor_id, event_type, from_status, to_status,
                                  from_progress, to_progress, note)
  values (t.org_id, t.id, auth.uid(), 'return', t.status, 'in_progress', t.progress, p_progress, trim(p_reason));
  perform app.write_audit(t.org_id, 'task.return', 'task', t.id, jsonb_build_object('reason', trim(p_reason)));
end $$;

-- Quản lý giao lại việc (có nhật ký).
create or replace function public.reassign_task(p_task_id uuid, p_assignee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(t.project_id) then
    raise exception 'Bạn không có quyền giao lại công việc này' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_members where project_id = t.project_id and user_id = p_assignee_id) then
    raise exception 'Người phụ trách phải là thành viên dự án' using errcode = '22023';
  end if;
  if t.assignee_id = p_assignee_id then return; end if;
  update public.tasks set assignee_id = p_assignee_id where id = t.id;
  insert into public.task_events (org_id, task_id, actor_id, event_type, note)
  values (t.org_id, t.id, auth.uid(), 'reassign', t.assignee_id::text || ' → ' || p_assignee_id::text);
  perform app.write_audit(t.org_id, 'task.reassign', 'task', t.id,
    jsonb_build_object('from', t.assignee_id, 'to', p_assignee_id));
end $$;

-- Quản lý sửa tiến độ (ngoại lệ, có nhật ký). Không đưa trực tiếp sang "Hoàn tất".
create or replace function public.manager_set_progress(p_task_id uuid, p_progress integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; v_status public.task_status;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(t.project_id) then
    raise exception 'Bạn không có quyền sửa tiến độ công việc này' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Cần nhập lý do sửa tiến độ' using errcode = '22023';
  end if;
  if t.status in ('done', 'cancelled') then
    raise exception 'Không sửa tiến độ việc đã hoàn tất hoặc đã hủy' using errcode = '22023';
  end if;
  v_status := app.apply_progress(p_task_id, p_progress, t.blocker_note, p_reason, 'manual', null);
  perform app.write_audit(t.org_id, 'task.progress_edit', 'task', t.id,
    jsonb_build_object('from', t.progress, 'to', p_progress, 'reason', trim(p_reason)));
end $$;

create or replace function public.cancel_task(p_task_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not app.can_manage_project(t.project_id) then
    raise exception 'Bạn không có quyền hủy công việc này' using errcode = '42501';
  end if;
  if t.status in ('done','cancelled') then return; end if;
  update public.tasks set status = 'cancelled', is_blocked = false where id = t.id;
  insert into public.task_events (org_id, task_id, actor_id, event_type, from_status, to_status, note)
  values (t.org_id, t.id, auth.uid(), 'cancel', t.status, 'cancelled', nullif(trim(coalesce(p_reason,'')), ''));
  perform app.write_audit(t.org_id, 'task.cancel', 'task', t.id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.add_task_comment(p_task_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype; v_id uuid;
begin
  select * into t from public.tasks where id = p_task_id and org_id = app.current_org_id();
  if not found or not app.can_view_project(t.project_id) then
    raise exception 'Không tìm thấy công việc' using errcode = 'P0002';
  end if;
  insert into public.task_comments (org_id, task_id, author_id, body)
  values (t.org_id, t.id, auth.uid(), trim(p_body)) returning id into v_id;
  return v_id;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
-- Hàm nội bộ chỉ được gọi từ RPC SECURITY DEFINER, không cấp cho người dùng.
revoke execute on function app.apply_progress(uuid, integer, text, text, text, uuid),
  app.write_audit(uuid, text, text, uuid, jsonb) from authenticated;
grant execute on function
  public.create_project(text, text, date, date, uuid, uuid, uuid[]),
  public.add_project_members(uuid, uuid[]),
  public.remove_project_member(uuid, uuid),
  public.create_task(uuid, text, uuid, text, public.task_priority, date, numeric),
  public.update_task_progress(uuid, integer, text, text),
  public.approve_task(uuid, text),
  public.return_task(uuid, text, integer),
  public.reassign_task(uuid, uuid),
  public.manager_set_progress(uuid, integer, text),
  public.cancel_task(uuid, text),
  public.add_task_comment(uuid, text)
to authenticated;
