-- =====================================================================
-- 0910 · Bảng công việc theo quy trình video
--   Mỗi video có 2 đầu việc tự đồng bộ: "Chuẩn bị nội dung" (Content) và "Dựng bản nháp" (Editor).
--   Liên kết lưu bằng video_id + loại đầu việc (kind) nên hai thẻ trùng tên vẫn phân biệt được và không bao giờ tạo trùng.
--   Trạng thái, người phụ trách, mức ưu tiên của đầu việc video luôn lấy từ video (trigger) — kéo thẻ không thể bỏ qua
--   bước bàn giao / nộp duyệt / duyệt. Việc độc lập giữ nguyên cách dùng cũ.
-- =====================================================================
alter table public.tasks
  add column video_id uuid,
  add column kind text check (kind in ('content', 'edit')),
  add column start_date date,
  add column dates_manual boolean not null default false;
alter table public.tasks add constraint tasks_video_fk foreign key (org_id, video_id) references public.videos(org_id, id) on delete cascade;
alter table public.tasks add constraint tasks_video_kind_chk check ((video_id is null) = (kind is null));
create unique index tasks_video_kind_uidx on public.tasks(video_id, kind) where video_id is not null and deleted_at is null;
create index tasks_video_idx on public.tasks(video_id) where video_id is not null;

-- Quản lý sản xuất thấy mọi đầu việc gắn video (không cần quyền CRM)
create policy tasks_sel_video_mgr on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and video_id is not null and not app.has_role('collaborator') and app.has_permission('videos.manage_all'));

-- ---------------------------------------------------------------------
-- Đồng bộ đầu việc từ video
-- ---------------------------------------------------------------------
create or replace function app.sync_video_tasks(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.videos%rowtype; v_tz text; v_nontodo int; k text; holder uuid; st public.task_status; t_id uuid; v_prio public.task_priority; v_due timestamptz;
begin
  select * into v from public.videos where id = p_video;
  if not found then return; end if;
  select coalesce(timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.organizations where id = v.org_id;
  select count(*) filter (where status <> 'todo') into v_nontodo from public.video_items where video_id = v.id;
  v_prio := (case v.priority when 'low' then 'low' when 'high' then 'high' when 'urgent' then 'urgent' else 'normal' end)::public.task_priority;
  v_due := case when v.due_date is not null then ((v.due_date + time '23:59')::timestamp at time zone v_tz) end;
  foreach k in array array['content', 'edit'] loop
    holder := case k when 'content' then v.content_owner_id else v.editor_id end;
    if v.stage = 'cancelled' then st := 'cancelled';
    elsif v.stage = 'on_hold' then st := 'deferred';
    elsif k = 'content' then
      st := case when v.stage in ('idea', 'preparing') then (case when v_nontodo > 0 or v.handover_status = 'needs_more' then 'in_progress' else 'not_started' end) else 'completed' end;
    else
      st := case when v.stage in ('idea', 'preparing', 'handover') then 'not_started' when v.stage in ('editing', 'review') then 'in_progress' else 'completed' end;
    end if;
    insert into public.tasks (org_id, title, task_type, status, priority, scheduled_at, content, related_type, related_id, video_id, kind, created_by)
    values (v.org_id, (case k when 'content' then 'Chuẩn bị nội dung ' else 'Dựng bản nháp ' end) || v.title, 'to_do', st, v_prio,
            case when k = 'edit' then v_due end, null, 'video', v.id, v.id, k, v.created_by)
    on conflict (video_id, kind) where video_id is not null and deleted_at is null do update set
      title = excluded.title, status = excluded.status, priority = excluded.priority,
      scheduled_at = case when public.tasks.dates_manual then public.tasks.scheduled_at else excluded.scheduled_at end
    returning id into t_id;
    delete from public.task_assignees where task_id = t_id and user_id is distinct from holder;
    if holder is not null and exists (select 1 from public.profiles where id = holder and org_id = v.org_id) then
      insert into public.task_assignees (org_id, task_id, user_id) values (v.org_id, t_id, holder) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function app.trg_videos_sync_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.title, new.stage, new.priority, new.content_owner_id, new.editor_id, new.due_date, new.handover_status)
       is not distinct from (old.title, old.stage, old.priority, old.content_owner_id, old.editor_id, old.due_date, old.handover_status) then
    return null;
  end if;
  perform app.sync_video_tasks(new.id);
  return null;
end $$;
create trigger videos_sync_tasks after insert or update on public.videos for each row execute function app.trg_videos_sync_tasks();

create or replace function app.trg_items_sync_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.sync_video_tasks(new.video_id);
  return null;
end $$;
create trigger video_items_sync_tasks after insert or update of status on public.video_items for each row execute function app.trg_items_sync_tasks();

-- Đầu việc video chỉ do hệ thống đồng bộ: chặn mọi INSERT/UPDATE trực tiếp từ phiên người dùng (kể cả quản lý CRM có chính sách ghi).
create or replace function app.trg_tasks_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.video_id is not null then
      raise exception 'Đầu việc của video do hệ thống tạo theo bước sản xuất' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (old.video_id is not null or new.video_id is not null) then
      raise exception 'Đầu việc của video lấy từ bước sản xuất — thao tác ở trang Video' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks for each row execute function app.trg_tasks_guard();

-- ---------------------------------------------------------------------
-- RPC công việc: chặn sửa tay đầu việc của video, thêm ngày bắt đầu, đặt lịch, phân công
-- ---------------------------------------------------------------------
drop function public.save_task(uuid, text, public.task_type, public.task_priority, timestamptz, int, text, text, uuid, uuid[]);
create or replace function public.save_task(
  p_id uuid, p_title text, p_type public.task_type default 'to_do', p_priority public.task_priority default 'normal',
  p_scheduled_at timestamptz default null, p_remind_before int default null, p_content text default null,
  p_related_type text default null, p_related_id uuid default null, p_assignees uuid[] default '{}', p_start_date date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; t public.tasks%rowtype;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền tạo công việc' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Nhập tiêu đề công việc' using errcode = '22023'; end if;
  if p_related_type is not null and p_related_type not in ('lead', 'account', 'contact', 'opportunity', 'project', 'video') then raise exception 'Loại liên quan không hợp lệ' using errcode = '22023'; end if;
  if p_start_date is not null and p_scheduled_at is not null and p_scheduled_at::date < p_start_date then raise exception 'Hạn hoàn thành phải sau ngày bắt đầu' using errcode = '22023'; end if;
  if p_related_id is null then p_related_type := null; end if;
  if p_related_type = 'project' and not (exists (select 1 from public.projects where id = p_related_id and org_id = v_org and deleted_at is null) and app.can_view_project(p_related_id)) then
    raise exception 'Dự án không hợp lệ hoặc bạn không có quyền xem dự án này' using errcode = '22023';
  end if;
  perform app.check_members(v_org, coalesce(p_assignees, '{}'));
  if p_id is null then
    insert into public.tasks (org_id, title, task_type, priority, scheduled_at, start_date, remind_before_minutes, reminder_at, content, related_type, related_id)
    values (v_org, trim(p_title), p_type, p_priority, p_scheduled_at, p_start_date, p_remind_before,
            case when p_scheduled_at is not null and p_remind_before is not null then p_scheduled_at - make_interval(mins => p_remind_before) end,
            nullif(trim(coalesce(p_content, '')), ''), p_related_type, p_related_id)
    returning id into v_id;
  else
    select * into t from public.tasks where id = p_id and org_id = v_org and deleted_at is null for update;
    if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
    if t.video_id is not null then raise exception 'Đầu việc của video lấy từ bước sản xuất — chỉ đặt lịch hoặc phân công ở trang Video' using errcode = '22023'; end if;
    if t.created_by is distinct from auth.uid() and not app.can_crm(true) then raise exception 'Chỉ người tạo hoặc quản lý CRM được sửa công việc' using errcode = '42501'; end if;
    update public.tasks set title = trim(p_title), task_type = p_type, priority = p_priority, scheduled_at = p_scheduled_at, start_date = p_start_date, remind_before_minutes = p_remind_before,
      reminder_at = case when p_scheduled_at is not null and p_remind_before is not null then p_scheduled_at - make_interval(mins => p_remind_before) end,
      reminded_at = null, content = nullif(trim(coalesce(p_content, '')), ''), related_type = p_related_type, related_id = p_related_id where id = p_id;
    v_id := p_id;
    delete from public.task_assignees where task_id = v_id;
  end if;
  insert into public.task_assignees (org_id, task_id, user_id) select v_org, v_id, u from (select distinct unnest(coalesce(p_assignees, '{}')) u) s;
  return v_id;
end $$;

create or replace function public.set_task_status(p_id uuid, p_status public.task_status) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if t.video_id is not null then
    raise exception 'Đầu việc của video đổi trạng thái theo bước sản xuất (bàn giao, nộp duyệt, duyệt) — thao tác ở trang Video' using errcode = '22023';
  end if;
  if not (t.created_by = auth.uid() or app.can_crm(true) or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = auth.uid())) then
    raise exception 'Bạn không có quyền cập nhật công việc này' using errcode = '42501';
  end if;
  update public.tasks set status = p_status where id = p_id;
end $$;

create or replace function public.delete_task(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if t.video_id is not null then raise exception 'Đầu việc của video không xóa được — hủy hoặc tạm dừng video ở trang Video' using errcode = '22023'; end if;
  if not (t.created_by = auth.uid() or app.can_crm(true)) then raise exception 'Bạn không có quyền xóa công việc này' using errcode = '42501'; end if;
  update public.tasks set deleted_at = now() where id = p_id;
end $$;

-- Đặt ngày bắt đầu / hạn. Đầu việc video: chỉ quản lý sản xuất; việc độc lập: người tạo, quản lý CRM hoặc quản lý sản xuất.
create or replace function public.set_task_schedule(p_id uuid, p_start date, p_due timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if t.video_id is not null then
    if not app.has_permission('videos.manage_all') then raise exception 'Chỉ Leader / quản lý sản xuất được đặt lịch cho đầu việc video' using errcode = '42501'; end if;
  elsif not (t.created_by = auth.uid() or app.can_crm(true) or app.has_permission('videos.manage_all')) then
    raise exception 'Bạn không có quyền đặt lịch công việc này' using errcode = '42501';
  end if;
  if p_start is not null and p_due is not null and p_due::date < p_start then raise exception 'Hạn hoàn thành phải sau ngày bắt đầu' using errcode = '22023'; end if;
  update public.tasks set start_date = p_start, scheduled_at = p_due, dates_manual = (t.video_id is not null),
    reminder_at = case when p_due is not null and remind_before_minutes is not null then p_due - make_interval(mins => remind_before_minutes) end, reminded_at = null
  where id = p_id;
end $$;

-- Phân công việc độc lập (đầu việc video lấy người từ phân công của video)
create or replace function public.set_task_assignees(p_id uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if t.video_id is not null then raise exception 'Người phụ trách đầu việc video đổi ở trang Video → Phân công' using errcode = '22023'; end if;
  if not (t.created_by = auth.uid() or app.can_crm(true) or app.has_permission('videos.manage_all')) then raise exception 'Bạn không có quyền phân công công việc này' using errcode = '42501'; end if;
  perform app.check_members(v_org, coalesce(p_users, '{}'));
  delete from public.task_assignees where task_id = p_id;
  insert into public.task_assignees (org_id, task_id, user_id) select v_org, p_id, u from (select distinct unnest(coalesce(p_users, '{}')) u) s;
end $$;

-- ---------------------------------------------------------------------
-- Nhóm công việc (cột tự đặt tên trên bảng) và liên kết dự án
-- ---------------------------------------------------------------------
create table public.task_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);
alter table public.task_groups enable row level security;
create policy task_groups_sel on public.task_groups for select to authenticated using (org_id = app.current_org_id() and not app.has_role('collaborator'));
revoke all on public.task_groups from anon, authenticated;
grant select on public.task_groups to authenticated;
grant all on public.task_groups to service_role;
alter table public.tasks add column group_id uuid;
alter table public.tasks add constraint tasks_group_fk foreign key (org_id, group_id) references public.task_groups(org_id, id) on delete set null (group_id);
create index tasks_group_idx on public.tasks(group_id) where group_id is not null;

create or replace function public.save_task_group(p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_name text := trim(coalesce(p_name, '')); g public.task_groups%rowtype; v_id uuid;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền tạo nhóm công việc' using errcode = '42501'; end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'Tên nhóm từ 1 đến 60 ký tự' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.task_groups (org_id, name, sort_order)
    values (v_org, v_name, coalesce((select max(sort_order) from public.task_groups where org_id = v_org), 0) + 1) returning id into v_id;
  else
    select * into g from public.task_groups where id = p_id and org_id = v_org for update;
    if not found then raise exception 'Không tìm thấy nhóm công việc' using errcode = 'P0002'; end if;
    if g.created_by is distinct from auth.uid() and not (app.can_crm(true) or app.has_permission('videos.manage_all')) then raise exception 'Chỉ người tạo nhóm hoặc quản lý được đổi tên' using errcode = '42501'; end if;
    update public.task_groups set name = v_name where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Đã có nhóm công việc tên "%"', v_name using errcode = '23505';
end $$;

create or replace function public.delete_task_group(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.task_groups%rowtype;
begin
  select * into g from public.task_groups where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy nhóm công việc' using errcode = 'P0002'; end if;
  if g.created_by is distinct from auth.uid() and not (app.can_crm(true) or app.has_permission('videos.manage_all')) then raise exception 'Chỉ người tạo nhóm hoặc quản lý được xóa nhóm' using errcode = '42501'; end if;
  delete from public.task_groups where id = p_id; -- việc trong nhóm trở về "Chưa phân nhóm", không mất việc
end $$;

-- Xếp việc vào nhóm: chỉ là cách sắp xếp, không đổi trạng thái → dùng được cho cả đầu việc video (không qua mặt duyệt).
create or replace function public.set_task_group(p_id uuid, p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if not (t.created_by = auth.uid() or app.can_crm(true) or app.has_permission('videos.manage_all')
          or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = auth.uid())) then
    raise exception 'Bạn không có quyền xếp nhóm cho công việc này' using errcode = '42501';
  end if;
  if p_group is not null and not exists (select 1 from public.task_groups where id = p_group and org_id = v_org) then raise exception 'Không tìm thấy nhóm công việc' using errcode = 'P0002'; end if;
  update public.tasks set group_id = p_group where id = p_id;
end $$;

-- Liên kết việc độc lập với dự án (đầu việc video theo dự án của video).
create or replace function public.set_task_project(p_id uuid, p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
  if t.video_id is not null then raise exception 'Đầu việc của video theo dự án của video — đổi dự án ở trang Video' using errcode = '22023'; end if;
  if not (t.created_by = auth.uid() or app.can_crm(true) or app.has_permission('videos.manage_all')) then raise exception 'Bạn không có quyền đổi dự án của công việc này' using errcode = '42501'; end if;
  if p_project is not null and not (exists (select 1 from public.projects where id = p_project and org_id = v_org and deleted_at is null) and app.can_view_project(p_project)) then
    raise exception 'Dự án không hợp lệ hoặc bạn không có quyền xem dự án này' using errcode = '22023';
  end if;
  update public.tasks set related_type = case when p_project is null then null else 'project' end, related_id = p_project where id = p_id;
end $$;

-- Đưa các video đang có vào bảng công việc
select app.sync_video_tasks(id) from public.videos;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid), app.sync_video_tasks(uuid), app.trg_videos_sync_tasks(), app.trg_items_sync_tasks(), app.trg_tasks_guard() from authenticated;
