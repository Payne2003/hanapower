-- =====================================================================
-- 0300 · Báo cáo ngày (bản nháp → đã gửi), gửi trong một giao dịch, idempotent
-- =====================================================================

create type public.report_status as enum ('draft', 'submitted');

create table public.daily_reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  user_id       uuid not null,
  report_date   date not null,
  status        public.report_status not null default 'draft',
  note          text,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  -- Mỗi người một báo cáo cho mỗi ngày: chống tạo bản ghi trùng khi gửi lại.
  unique (user_id, report_date),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  check ((status = 'submitted') = (submitted_at is not null))
);
create index daily_reports_org_date_idx on public.daily_reports(org_id, report_date desc);

create table public.daily_report_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  report_id        uuid not null,
  project_id       uuid not null,
  task_id          uuid not null,
  result           text not null default '',
  progress         integer not null check (progress between 0 and 100),
  blocker          text,
  progress_before  integer,
  status_after     public.task_status,
  position         integer not null default 0,
  unique (report_id, task_id),
  foreign key (org_id, report_id) references public.daily_reports(org_id, id) on delete cascade,
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  -- Đảm bảo project_id khớp với công việc.
  foreign key (project_id, task_id) references public.tasks(project_id, id) on delete cascade
);
create index daily_report_items_project_idx on public.daily_report_items(project_id);
create index daily_report_items_task_idx on public.daily_report_items(task_id);

create trigger daily_reports_touch before update on public.daily_reports
  for each row execute function app.touch_updated_at();

-- task_events.report_id trỏ tới báo cáo nguồn
alter table public.task_events
  add constraint task_events_report_fk foreign key (org_id, report_id)
  references public.daily_reports(org_id, id) on delete set null (report_id);

-- ---------------------------------------------------------------------
-- Quyền xem báo cáo
--   * Chủ báo cáo: xem toàn bộ (kể cả nháp).
--   * Quản lý phòng ban của chủ báo cáo: xem báo cáo đã gửi.
--   * Quản lý dự án: chỉ xem các DÒNG thuộc dự án mình quản lý (báo cáo đã gửi);
--     phần đầu báo cáo hiển thị khi có ít nhất một dòng như vậy.
-- ---------------------------------------------------------------------
create or replace function app.can_view_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.daily_reports r
    where r.id = p_report_id and r.org_id = app.current_org_id()
      and (r.user_id = auth.uid()
           or (r.status = 'submitted' and app.is_department_manager_of(r.user_id))))
$$;

create or replace function app.can_view_report_item(p_report_id uuid, p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_view_report(p_report_id)
      or (app.can_manage_project(p_project_id)
          and exists (select 1 from public.daily_reports r where r.id = p_report_id and r.status = 'submitted'))
$$;

alter table public.daily_reports      enable row level security;
alter table public.daily_report_items enable row level security;

create policy daily_reports_select on public.daily_reports for select to authenticated
  using (
    app.can_view_report(id)
    or (status = 'submitted' and exists (
          select 1 from public.daily_report_items i
          where i.report_id = daily_reports.id and app.can_manage_project(i.project_id)))
  );

create policy daily_report_items_select on public.daily_report_items for select to authenticated
  using (app.can_view_report_item(report_id, project_id));

revoke all on public.daily_reports, public.daily_report_items from anon, authenticated;
grant select on public.daily_reports, public.daily_report_items to authenticated;
grant all on public.daily_reports, public.daily_report_items to service_role;

-- ---------------------------------------------------------------------
-- Nội bộ: ghi (upsert) bản nháp và thay toàn bộ dòng
-- p_items: [{ "task_id": uuid, "result": text, "progress": int, "blocker": text|null }]
-- ---------------------------------------------------------------------
create or replace function app.upsert_report_draft(p_report_date date, p_note text, p_items jsonb)
returns public.daily_reports
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_date date := coalesce(p_report_date, app.today());
  r public.daily_reports%rowtype;
  it jsonb;
  t public.tasks%rowtype;
  v_pos int := 0;
  v_progress int;
begin
  if v_org is null then raise exception 'Tài khoản không hoạt động' using errcode = '42501'; end if;
  if v_date > app.today() then
    raise exception 'Không thể báo cáo cho ngày trong tương lai' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Danh sách dòng báo cáo không hợp lệ' using errcode = '22023';
  end if;

  insert into public.daily_reports (org_id, user_id, report_date, note)
  values (v_org, auth.uid(), v_date, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (user_id, report_date) do nothing;

  -- Khóa dòng báo cáo: các lần gửi đồng thời (nhấn hai lần, thử lại) được tuần tự hóa tại đây.
  select * into r from public.daily_reports where user_id = auth.uid() and report_date = v_date for update;

  if r.status = 'submitted' then
    return r;  -- hàm gọi quyết định xử lý
  end if;

  update public.daily_reports set note = nullif(trim(coalesce(p_note, '')), '') where id = r.id
  returning * into r;

  delete from public.daily_report_items where report_id = r.id;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into t from public.tasks
     where id = (it->>'task_id')::uuid and org_id = v_org;
    if not found then
      raise exception 'Không tìm thấy công việc trong báo cáo' using errcode = 'P0002';
    end if;
    if t.assignee_id <> auth.uid() then
      raise exception 'Chỉ báo cáo được công việc mình phụ trách: %', t.title using errcode = '42501';
    end if;
    if t.status = 'cancelled' then
      raise exception 'Công việc đã hủy: %', t.title using errcode = '22023';
    end if;
    v_progress := (it->>'progress')::int;
    if v_progress is null or v_progress < 0 or v_progress > 100 then
      raise exception 'Tiến độ phải trong khoảng 0–100' using errcode = '22023';
    end if;
    insert into public.daily_report_items (org_id, report_id, project_id, task_id, result, progress, blocker, position)
    values (v_org, r.id, t.project_id, t.id, coalesce(trim(it->>'result'), ''), v_progress,
            nullif(trim(coalesce(it->>'blocker', '')), ''), v_pos)
    on conflict (report_id, task_id) do update
      set result = excluded.result, progress = excluded.progress, blocker = excluded.blocker;
    v_pos := v_pos + 1;
  end loop;

  return r;
end $$;

-- ---------------------------------------------------------------------
-- RPC: lưu bản nháp
-- ---------------------------------------------------------------------
create or replace function public.save_daily_report_draft(
  p_report_date date, p_note text, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.daily_reports%rowtype;
begin
  r := app.upsert_report_draft(p_report_date, p_note, p_items);
  if r.status = 'submitted' then
    raise exception 'Báo cáo ngày % đã gửi, không thể sửa', to_char(r.report_date, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  return jsonb_build_object('report_id', r.id, 'status', r.status, 'report_date', r.report_date);
end $$;

-- ---------------------------------------------------------------------
-- RPC: gửi báo cáo ngày
--   Ghi báo cáo + cập nhật công việc + ghi lịch sử trong CÙNG một giao dịch.
--   Gửi lại (mất mạng, nhấn hai lần) trả về cùng kết quả, không tạo bản ghi trùng,
--   không cập nhật tiến độ lần hai.
-- ---------------------------------------------------------------------
create or replace function public.submit_daily_report(
  p_report_date date, p_note text, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports%rowtype;
  i public.daily_report_items%rowtype;
  v_before int;
  v_status public.task_status;
  v_count int;
begin
  r := app.upsert_report_draft(p_report_date, p_note, p_items);

  if r.status = 'submitted' then
    return jsonb_build_object('report_id', r.id, 'status', 'submitted', 'report_date', r.report_date,
                              'submitted_at', r.submitted_at, 'already_submitted', true,
                              'items', (select count(*) from public.daily_report_items where report_id = r.id));
  end if;

  select count(*) into v_count from public.daily_report_items where report_id = r.id;
  if v_count = 0 then
    raise exception 'Báo cáo cần ít nhất một dòng công việc' using errcode = '22023';
  end if;

  for i in select * from public.daily_report_items where report_id = r.id order by position loop
    select progress into v_before from public.tasks where id = i.task_id;
    v_status := app.apply_progress(i.task_id, i.progress, i.blocker, nullif(i.result, ''), 'daily_report', r.id);
    update public.daily_report_items set progress_before = v_before, status_after = v_status where id = i.id;
  end loop;

  update public.daily_reports set status = 'submitted', submitted_at = now() where id = r.id returning * into r;

  return jsonb_build_object('report_id', r.id, 'status', 'submitted', 'report_date', r.report_date,
                            'submitted_at', r.submitted_at, 'already_submitted', false, 'items', v_count);
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function app.can_view_report(uuid), app.can_view_report_item(uuid, uuid) to authenticated;
grant execute on function public.save_daily_report_draft(date, text, jsonb),
  public.submit_daily_report(date, text, jsonb) to authenticated;
