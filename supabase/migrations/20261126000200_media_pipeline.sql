-- =====================================================================
-- 0200 · Quy trình sản xuất video (công ty media)
--   Ý tưởng → Chuẩn bị Content (4 hạng mục + link tài nguyên) → Chờ bàn giao
--   → Editor xác nhận (nhận đủ / yêu cầu bổ sung) → Đang dựng → Chờ duyệt
--   → Leader duyệt / yêu cầu sửa → Chờ đăng → Đã đăng
-- Mọi thao tác ghi đi qua hàm RPC kiểm tra quyền; client chỉ SELECT theo RLS.
-- =====================================================================

create type public.video_stage as enum
  ('idea', 'preparing', 'handover', 'editing', 'review', 'ready', 'published', 'on_hold', 'cancelled');
create type public.item_status as enum ('todo', 'doing', 'done');            -- Chưa làm / Đang làm / Hoàn thành
create type public.handover_status as enum ('pending', 'received', 'needs_more'); -- Chờ xác nhận / Đã nhận đủ / Yêu cầu bổ sung
create type public.video_priority as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------
-- Kênh phát hành
-- ---------------------------------------------------------------------
create table public.channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  platform    text not null default 'YouTube',
  url         text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

-- Bộ đếm mã video theo doanh nghiệp (D0001, D0002…)
create table public.org_counters (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  last_video_no integer not null default 0
);

-- ---------------------------------------------------------------------
-- Video (mỗi video một dòng, như bảng báo cáo hiện tại)
-- ---------------------------------------------------------------------
create table public.videos (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  code                    text not null,                 -- Mã dự án: D0001
  title                   text not null check (length(trim(title)) > 0),
  brief                   text,                          -- ý tưởng / yêu cầu
  channel_id              uuid,
  priority                public.video_priority not null default 'medium',
  stage                   public.video_stage not null default 'idea',
  stage_before_hold       public.video_stage,
  report_date             date not null,                 -- Ngày báo cáo (theo múi giờ DN)
  due_date                date,                          -- Hạn đăng
  -- Content
  content_owner_id        uuid,                          -- Content phụ trách
  resource_url            text,                          -- Link tài nguyên
  content_note            text,                          -- Ghi chú Content
  -- Bàn giao
  editor_id               uuid,                          -- Editor tiếp nhận
  handover_status         public.handover_status,        -- Xác nhận bàn giao
  handover_submitted_at   timestamptz,
  handover_confirmed_at   timestamptz,                   -- Ngày xác nhận
  editor_note             text,                          -- Ghi chú Edit bổ sung / thêm bớt
  supplement_count        integer not null default 0,
  -- Dựng
  edit_progress           integer not null default 0 check (edit_progress between 0 and 100),
  draft_url               text,                          -- Link bản dựng
  -- Duyệt
  review_note             text,
  revision_count          integer not null default 0,
  approved_by             uuid references auth.users(id) on delete set null,
  approved_at             timestamptz,
  -- Đăng
  published_url           text,
  published_at            date,
  hold_reason             text,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, code),
  foreign key (org_id, channel_id) references public.channels(org_id, id) on delete set null (channel_id),
  foreign key (org_id, content_owner_id) references public.profiles(org_id, id) on delete set null (content_owner_id),
  foreign key (org_id, editor_id) references public.profiles(org_id, id) on delete set null (editor_id),
  check (stage <> 'published' or (published_url is not null and published_at is not null)),
  check (stage not in ('ready', 'published') or approved_at is not null),
  check (stage not in ('editing', 'review', 'ready', 'published') or handover_status = 'received')
);
create index videos_org_report_idx on public.videos(org_id, report_date desc);
create index videos_owner_idx on public.videos(content_owner_id, stage);
create index videos_editor_idx on public.videos(editor_id, stage);

create trigger videos_touch before update on public.videos
  for each row execute function app.touch_updated_at();

-- 4 hạng mục Content của mỗi video
create table public.video_items (
  org_id      uuid not null,
  video_id    uuid not null,
  kind        text not null check (kind in ('real_footage', 'ai_video', 'script_vo', 'edit_map')),
  status      public.item_status not null default 'todo',
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (video_id, kind),
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete cascade
);

-- Lịch sử (mỗi lần chuyển bước, bàn giao, yêu cầu bổ sung, duyệt…)
create table public.video_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  video_id    uuid not null,
  actor_id    uuid references auth.users(id) on delete set null,
  event_type  text not null,
  from_stage  public.video_stage,
  to_stage    public.video_stage,
  note        text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete cascade
);
create index video_events_video_idx on public.video_events(video_id, created_at desc);

create table public.video_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  video_id    uuid not null,
  author_id   uuid not null,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete cascade,
  foreign key (org_id, author_id) references public.profiles(org_id, id) on delete cascade
);
create index video_comments_video_idx on public.video_comments(video_id, created_at);

-- Thông báo trong ứng dụng
create table public.notifications (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  user_id     uuid not null,
  video_id    uuid,
  kind        text not null,
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete cascade
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS: cả đội sản xuất trong doanh nghiệp xem được bảng video (như Google Sheet chung),
-- nhưng chỉ người có vai trò/phân công mới thao tác được (qua RPC).
-- ---------------------------------------------------------------------
alter table public.channels       enable row level security;
alter table public.org_counters   enable row level security;
alter table public.videos         enable row level security;
alter table public.video_items    enable row level security;
alter table public.video_events   enable row level security;
alter table public.video_comments enable row level security;
alter table public.notifications  enable row level security;

create policy channels_select on public.channels for select to authenticated using (org_id = app.current_org_id());
create policy videos_select on public.videos for select to authenticated using (org_id = app.current_org_id());
create policy video_items_select on public.video_items for select to authenticated using (org_id = app.current_org_id());
create policy video_events_select on public.video_events for select to authenticated using (org_id = app.current_org_id());
create policy video_comments_select on public.video_comments for select to authenticated using (org_id = app.current_org_id());
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and org_id = app.current_org_id());

revoke all on public.channels, public.org_counters, public.videos, public.video_items, public.video_events,
  public.video_comments, public.notifications from anon, authenticated;
grant select on public.channels, public.videos, public.video_items, public.video_events,
  public.video_comments, public.notifications to authenticated;
grant all on public.channels, public.org_counters, public.videos, public.video_items, public.video_events,
  public.video_comments, public.notifications to service_role;

-- ---------------------------------------------------------------------
-- Hàm nội bộ
-- ---------------------------------------------------------------------
create or replace function app.lock_video(p_video_id uuid) returns public.videos
language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  select * into v from public.videos where id = p_video_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy video' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function app.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_permission('videos.manage_all')
$$;

create or replace function app.log_video(p_video public.videos, p_type text, p_to public.video_stage, p_note text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.video_events (org_id, video_id, actor_id, event_type, from_stage, to_stage, note, details)
  values (p_video.org_id, p_video.id, auth.uid(), p_type, p_video.stage, p_to, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_details, '{}'::jsonb))
$$;

-- Gửi thông báo (bỏ qua người nhận rỗng hoặc chính người thao tác)
create or replace function app.notify(p_org uuid, p_user uuid, p_video uuid, p_kind text, p_message text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (org_id, user_id, video_id, kind, message)
  select p_org, p_user, p_video, p_kind, p_message
  where p_user is not null and p_user is distinct from auth.uid()
    and exists (select 1 from public.profiles where id = p_user and org_id = p_org and is_active)
$$;

create or replace function app.notify_managers(p_org uuid, p_video uuid, p_kind text, p_message text)
returns void language sql security definer set search_path = '' as $$
  select app.notify(p_org, r.user_id, p_video, p_kind, p_message)
  from public.user_roles r where r.org_id = p_org and r.role = 'manager'
$$;

create or replace function app.has_role_of(p_user uuid, p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id and p.is_active
                 where r.user_id = p_user and r.role = p_role and p.org_id = app.current_org_id())
$$;

-- ---------------------------------------------------------------------
-- Kênh
-- ---------------------------------------------------------------------
create or replace function public.upsert_channel(p_id uuid, p_name text, p_platform text default 'YouTube', p_url text default null, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if not app.has_permission('channels.manage') then
    raise exception 'Bạn không có quyền quản lý kênh' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.channels (org_id, name, platform, url, is_active)
    values (v_org, trim(p_name), coalesce(nullif(trim(p_platform), ''), 'YouTube'), nullif(trim(p_url), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.channels set name = trim(p_name), platform = coalesce(nullif(trim(p_platform), ''), 'YouTube'),
      url = nullif(trim(p_url), ''), is_active = coalesce(p_active, true)
    where id = p_id and org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy kênh' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Tạo video (Leader hoặc Content)
-- ---------------------------------------------------------------------
create or replace function public.create_video(
  p_title text,
  p_brief text default null,
  p_channel_id uuid default null,
  p_content_owner_id uuid default null,
  p_editor_id uuid default null,
  p_due_date date default null,
  p_priority public.video_priority default 'medium'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  v_owner uuid := p_content_owner_id;
  v_no int;
  v public.videos%rowtype;
begin
  if v_org is null then raise exception 'Tài khoản không hoạt động' using errcode = '42501'; end if;
  if not app.has_permission('videos.create') then
    raise exception 'Bạn không có quyền tạo video' using errcode = '42501';
  end if;
  if not app.is_manager() then
    -- Content tự tạo: mình là Content phụ trách
    if v_owner is not null and v_owner <> auth.uid() then
      raise exception 'Content chỉ tạo được video do chính mình phụ trách' using errcode = '42501';
    end if;
    v_owner := auth.uid();
  end if;
  if v_owner is not null and not app.has_role_of(v_owner, 'content') then
    raise exception 'Người phụ trách phải có vai trò Content' using errcode = '22023';
  end if;
  if p_editor_id is not null and not app.has_role_of(p_editor_id, 'editor') then
    raise exception 'Editor tiếp nhận phải có vai trò Editor' using errcode = '22023';
  end if;

  insert into public.org_counters (org_id, last_video_no) values (v_org, 1)
  on conflict (org_id) do update set last_video_no = public.org_counters.last_video_no + 1
  returning last_video_no into v_no;

  insert into public.videos (org_id, code, title, brief, channel_id, priority, report_date, due_date,
                             content_owner_id, editor_id, created_by)
  values (v_org, 'D' || lpad(v_no::text, 4, '0'), trim(p_title), nullif(trim(coalesce(p_brief, '')), ''), p_channel_id,
          coalesce(p_priority, 'medium'), app.today(), p_due_date, v_owner, p_editor_id, auth.uid())
  returning * into v;

  insert into public.video_items (org_id, video_id, kind)
  select v_org, v.id, k from unnest(array['real_footage', 'ai_video', 'script_vo', 'edit_map']) k;

  insert into public.video_events (org_id, video_id, actor_id, event_type, to_stage)
  values (v_org, v.id, auth.uid(), 'created', 'idea');

  perform app.notify(v_org, v_owner, v.id, 'assigned_content', 'Bạn được giao chuẩn bị Content cho video ' || v.code || ' – ' || v.title);
  perform app.notify(v_org, p_editor_id, v.id, 'assigned_editor', 'Bạn là Editor tiếp nhận video ' || v.code || ' – ' || v.title);
  return jsonb_build_object('id', v.id, 'code', v.code);
end $$;

-- Sửa thông tin chung (Leader, hoặc Content phụ trách trước khi bàn giao)
create or replace function public.update_video_info(
  p_video_id uuid, p_title text, p_brief text, p_channel_id uuid, p_due_date date, p_priority public.video_priority
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  v := app.lock_video(p_video_id);
  if not (app.is_manager() or (v.content_owner_id = auth.uid() and v.stage in ('idea', 'preparing'))) then
    raise exception 'Bạn không có quyền sửa thông tin video này' using errcode = '42501';
  end if;
  update public.videos set title = trim(p_title), brief = nullif(trim(coalesce(p_brief, '')), ''),
    channel_id = p_channel_id, due_date = p_due_date, priority = coalesce(p_priority, priority)
  where id = v.id;
  perform app.log_video(v, 'edit_info', null, null);
end $$;

-- Phân công Content / Editor
create or replace function public.assign_video(p_video_id uuid, p_content_owner_id uuid, p_editor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  v := app.lock_video(p_video_id);
  if v.stage in ('published', 'cancelled') then
    raise exception 'Video đã kết thúc, không phân công lại' using errcode = '22023';
  end if;
  if not app.is_manager() then
    -- Content phụ trách chỉ được chọn Editor, trước khi bàn giao, và không đổi người phụ trách
    if not (v.content_owner_id = auth.uid() and v.stage in ('idea', 'preparing')
            and p_content_owner_id is not distinct from v.content_owner_id) then
      raise exception 'Bạn không có quyền phân công video này' using errcode = '42501';
    end if;
  end if;
  if p_content_owner_id is not null and not app.has_role_of(p_content_owner_id, 'content') then
    raise exception 'Người phụ trách phải có vai trò Content' using errcode = '22023';
  end if;
  if p_editor_id is not null and not app.has_role_of(p_editor_id, 'editor') then
    raise exception 'Editor tiếp nhận phải có vai trò Editor' using errcode = '22023';
  end if;
  if v.stage in ('handover', 'editing', 'review') and p_editor_id is null then
    raise exception 'Video đang ở bước bàn giao/dựng/duyệt phải có Editor' using errcode = '22023';
  end if;
  if p_content_owner_id is not distinct from v.content_owner_id and p_editor_id is not distinct from v.editor_id then
    return;
  end if;
  update public.videos set content_owner_id = p_content_owner_id, editor_id = p_editor_id where id = v.id;
  perform app.log_video(v, 'assign', null, null,
    jsonb_build_object('content_from', v.content_owner_id, 'content_to', p_content_owner_id,
                       'editor_from', v.editor_id, 'editor_to', p_editor_id));
  perform app.write_audit(v.org_id, 'video.assign', 'video', v.id,
    jsonb_build_object('content_from', v.content_owner_id, 'content_to', p_content_owner_id,
                       'editor_from', v.editor_id, 'editor_to', p_editor_id));
  if p_content_owner_id is distinct from v.content_owner_id then
    perform app.notify(v.org_id, p_content_owner_id, v.id, 'assigned_content', 'Bạn được giao chuẩn bị Content cho video ' || v.code || ' – ' || v.title);
  end if;
  if p_editor_id is distinct from v.editor_id then
    perform app.notify(v.org_id, p_editor_id, v.id, 'assigned_editor', 'Bạn là Editor tiếp nhận video ' || v.code || ' – ' || v.title);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Content: cập nhật 4 hạng mục, link tài nguyên, ghi chú
-- ---------------------------------------------------------------------
create or replace function public.update_content(
  p_video_id uuid,
  p_real_footage public.item_status,
  p_ai_video public.item_status,
  p_script_vo public.item_status,
  p_edit_map public.item_status,
  p_resource_url text,
  p_content_note text
) returns public.video_stage
language plpgsql security definer set search_path = '' as $$
declare
  v public.videos%rowtype;
  v_new public.video_stage;
begin
  v := app.lock_video(p_video_id);
  if not (v.content_owner_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Content phụ trách được cập nhật phần Content' using errcode = '42501';
  end if;
  if v.stage not in ('idea', 'preparing') then
    raise exception 'Video đã bàn giao — không sửa phần Content (Editor có thể yêu cầu bổ sung)' using errcode = '22023';
  end if;
  if p_resource_url is not null and trim(p_resource_url) <> '' and trim(p_resource_url) !~* '^https?://' then
    raise exception 'Link tài nguyên phải bắt đầu bằng http:// hoặc https://' using errcode = '22023';
  end if;

  update public.video_items i set status = x.st, updated_by = auth.uid(), updated_at = now()
  from (values ('real_footage', p_real_footage), ('ai_video', p_ai_video), ('script_vo', p_script_vo), ('edit_map', p_edit_map)) as x(k, st)
  where i.video_id = v.id and i.kind = x.k and x.st is not null and i.status is distinct from x.st;

  v_new := case when v.stage = 'idea' then 'preparing'::public.video_stage else v.stage end;
  update public.videos set stage = v_new, resource_url = nullif(trim(coalesce(p_resource_url, '')), ''),
    content_note = nullif(trim(coalesce(p_content_note, '')), '')
  where id = v.id;
  perform app.log_video(v, 'content_update', v_new, null,
    jsonb_build_object('real_footage', p_real_footage, 'ai_video', p_ai_video, 'script_vo', p_script_vo, 'edit_map', p_edit_map));
  return v_new;
end $$;

-- Content bàn giao cho Editor: yêu cầu đủ 4 hạng mục Hoàn thành + link tài nguyên + có Editor
create or replace function public.submit_handover(p_video_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_missing text;
begin
  v := app.lock_video(p_video_id);
  if not (v.content_owner_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Content phụ trách được bàn giao' using errcode = '42501';
  end if;
  if v.stage = 'handover' then return; end if; -- gửi lặp: không đổi
  if v.stage not in ('idea', 'preparing') then
    raise exception 'Video không ở bước chuẩn bị Content' using errcode = '22023';
  end if;
  select string_agg(case kind when 'real_footage' then 'Nguồn thật' when 'ai_video' then 'Video AI'
                              when 'script_vo' then 'Kịch bản / VO' else 'Sơ đồ dựng' end, ', ')
    into v_missing from public.video_items where video_id = v.id and status <> 'done';
  if v_missing is not null then
    raise exception 'Chưa hoàn thành: %', v_missing using errcode = '22023';
  end if;
  if v.resource_url is null then
    raise exception 'Cần có link tài nguyên trước khi bàn giao' using errcode = '22023';
  end if;
  if v.editor_id is null then
    raise exception 'Cần chọn Editor tiếp nhận trước khi bàn giao' using errcode = '22023';
  end if;
  update public.videos set stage = 'handover', handover_status = 'pending', handover_submitted_at = now(),
    content_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), content_note)
  where id = v.id;
  perform app.log_video(v, 'handover_submit', 'handover', p_note);
  perform app.notify(v.org_id, v.editor_id, v.id, 'handover', 'Video ' || v.code || ' – ' || v.title || ' đã bàn giao, chờ bạn xác nhận');
end $$;

-- Editor xác nhận: 'received' (Đã nhận đủ) hoặc 'needs_more' (Yêu cầu bổ sung, bắt buộc ghi chú)
create or replace function public.confirm_handover(p_video_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  v := app.lock_video(p_video_id);
  if not (v.editor_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Editor tiếp nhận được xác nhận bàn giao' using errcode = '42501';
  end if;
  if p_decision = 'received' and v.stage = 'editing' then return; end if; -- xác nhận lặp
  if v.stage <> 'handover' then
    raise exception 'Video không ở bước chờ xác nhận bàn giao' using errcode = '22023';
  end if;
  if p_decision = 'received' then
    update public.videos set stage = 'editing', handover_status = 'received', handover_confirmed_at = now(),
      editor_note = coalesce(v_note, editor_note) where id = v.id;
    perform app.log_video(v, 'handover_received', 'editing', v_note);
    perform app.notify(v.org_id, v.content_owner_id, v.id, 'handover_received', 'Editor đã nhận đủ tài nguyên video ' || v.code);
  elsif p_decision = 'needs_more' then
    if v_note is null then raise exception 'Cần ghi rõ nội dung yêu cầu bổ sung' using errcode = '22023'; end if;
    update public.videos set stage = 'preparing', handover_status = 'needs_more', handover_confirmed_at = now(),
      editor_note = v_note, supplement_count = supplement_count + 1 where id = v.id;
    perform app.log_video(v, 'handover_needs_more', 'preparing', v_note);
    perform app.notify(v.org_id, v.content_owner_id, v.id, 'needs_more', 'Editor yêu cầu bổ sung video ' || v.code || ': ' || v_note);
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Editor: tiến độ dựng, link bản dựng, nộp duyệt
-- ---------------------------------------------------------------------
create or replace function public.update_edit(p_video_id uuid, p_progress integer, p_draft_url text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  v := app.lock_video(p_video_id);
  if not (v.editor_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Editor phụ trách được cập nhật tiến độ dựng' using errcode = '42501';
  end if;
  if v.stage <> 'editing' then
    raise exception 'Video không ở bước dựng' using errcode = '22023';
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    raise exception 'Tiến độ dựng phải trong khoảng 0–100' using errcode = '22023';
  end if;
  if p_draft_url is not null and trim(p_draft_url) <> '' and trim(p_draft_url) !~* '^https?://' then
    raise exception 'Link bản dựng phải bắt đầu bằng http:// hoặc https://' using errcode = '22023';
  end if;
  update public.videos set edit_progress = p_progress, draft_url = nullif(trim(coalesce(p_draft_url, '')), ''),
    editor_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), editor_note) where id = v.id;
  perform app.log_video(v, 'edit_progress', null, p_note, jsonb_build_object('from', v.edit_progress, 'to', p_progress));
end $$;

create or replace function public.submit_for_review(p_video_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  v := app.lock_video(p_video_id);
  if not (v.editor_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Editor phụ trách được nộp duyệt' using errcode = '42501';
  end if;
  if v.stage = 'review' then return; end if;
  if v.stage <> 'editing' then raise exception 'Video không ở bước dựng' using errcode = '22023'; end if;
  if v.draft_url is null then raise exception 'Cần có link bản dựng trước khi nộp duyệt' using errcode = '22023'; end if;
  update public.videos set stage = 'review', edit_progress = 100 where id = v.id;
  perform app.log_video(v, 'review_submit', 'review', p_note);
  perform app.notify_managers(v.org_id, v.id, 'review', 'Video ' || v.code || ' – ' || v.title || ' chờ duyệt');
end $$;

-- Leader duyệt: 'approve' → Chờ đăng ; 'revise' → quay lại Đang dựng (bắt buộc ghi chú)
create or replace function public.review_video(p_video_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  v := app.lock_video(p_video_id);
  if not app.has_permission('videos.approve') then
    raise exception 'Bạn không có quyền duyệt video' using errcode = '42501';
  end if;
  if p_decision = 'approve' and v.stage in ('ready', 'published') then return; end if;
  if v.stage <> 'review' then raise exception 'Video không ở bước chờ duyệt' using errcode = '22023'; end if;
  if p_decision = 'approve' then
    update public.videos set stage = 'ready', approved_by = auth.uid(), approved_at = now(),
      review_note = coalesce(v_note, review_note) where id = v.id;
    perform app.log_video(v, 'approved', 'ready', v_note);
    perform app.write_audit(v.org_id, 'video.approve', 'video', v.id, jsonb_build_object('code', v.code));
    perform app.notify(v.org_id, v.editor_id, v.id, 'approved', 'Video ' || v.code || ' đã được duyệt');
    perform app.notify(v.org_id, v.content_owner_id, v.id, 'approved', 'Video ' || v.code || ' đã được duyệt');
  elsif p_decision = 'revise' then
    if v_note is null then raise exception 'Cần ghi rõ nội dung cần sửa' using errcode = '22023'; end if;
    update public.videos set stage = 'editing', review_note = v_note, revision_count = revision_count + 1,
      edit_progress = least(edit_progress, 90) where id = v.id;
    perform app.log_video(v, 'revision_requested', 'editing', v_note);
    perform app.write_audit(v.org_id, 'video.revise', 'video', v.id, jsonb_build_object('note', v_note));
    perform app.notify(v.org_id, v.editor_id, v.id, 'revise', 'Video ' || v.code || ' cần sửa: ' || v_note);
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
end $$;

-- Đăng kênh
create or replace function public.publish_video(p_video_id uuid, p_published_url text, p_published_at date default null, p_channel_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype;
begin
  v := app.lock_video(p_video_id);
  if not app.has_permission('videos.publish') then
    raise exception 'Bạn không có quyền đăng video' using errcode = '42501';
  end if;
  if v.stage = 'published' then return; end if;
  if v.stage <> 'ready' then raise exception 'Video chưa được duyệt' using errcode = '22023'; end if;
  if coalesce(trim(p_published_url), '') !~* '^https?://' then
    raise exception 'Cần link video đã đăng (http/https)' using errcode = '22023';
  end if;
  update public.videos set stage = 'published', published_url = trim(p_published_url),
    published_at = coalesce(p_published_at, app.today()), channel_id = coalesce(p_channel_id, channel_id)
  where id = v.id;
  perform app.log_video(v, 'published', 'published', p_published_url);
  perform app.write_audit(v.org_id, 'video.publish', 'video', v.id, jsonb_build_object('url', p_published_url));
  perform app.notify(v.org_id, v.content_owner_id, v.id, 'published', 'Video ' || v.code || ' đã đăng');
  perform app.notify(v.org_id, v.editor_id, v.id, 'published', 'Video ' || v.code || ' đã đăng');
end $$;

-- Tạm dừng / tiếp tục / hủy (Leader)
create or replace function public.set_video_hold(p_video_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v := app.lock_video(p_video_id);
  if not app.is_manager() then raise exception 'Chỉ Leader được tạm dừng/hủy video' using errcode = '42501'; end if;
  if p_action = 'hold' then
    if v.stage in ('published', 'cancelled', 'on_hold') then raise exception 'Không thể tạm dừng ở bước này' using errcode = '22023'; end if;
    update public.videos set stage = 'on_hold', stage_before_hold = v.stage, hold_reason = v_reason where id = v.id;
    perform app.log_video(v, 'hold', 'on_hold', v_reason);
  elsif p_action = 'resume' then
    if v.stage <> 'on_hold' then raise exception 'Video không tạm dừng' using errcode = '22023'; end if;
    update public.videos set stage = coalesce(v.stage_before_hold, 'preparing'), stage_before_hold = null, hold_reason = null where id = v.id;
    perform app.log_video(v, 'resume', coalesce(v.stage_before_hold, 'preparing'), null);
  elsif p_action = 'cancel' then
    if v.stage in ('published', 'cancelled') then return; end if;
    if v_reason is null then raise exception 'Cần nhập lý do hủy' using errcode = '22023'; end if;
    update public.videos set stage = 'cancelled', hold_reason = v_reason where id = v.id;
    perform app.log_video(v, 'cancel', 'cancelled', v_reason);
    perform app.write_audit(v.org_id, 'video.cancel', 'video', v.id, jsonb_build_object('reason', v_reason));
  else
    raise exception 'Thao tác không hợp lệ' using errcode = '22023';
  end if;
end $$;

create or replace function public.add_video_comment(p_video_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_id uuid;
begin
  select * into v from public.videos where id = p_video_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy video' using errcode = 'P0002'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Nội dung trống' using errcode = '22023'; end if;
  insert into public.video_comments (org_id, video_id, author_id, body) values (v.org_id, v.id, auth.uid(), trim(p_body))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids))
$$;

-- ---------------------------------------------------------------------
-- Quyền thực thi
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify(uuid, uuid, uuid, text, text), app.notify_managers(uuid, uuid, text, text),
  app.write_audit(uuid, text, text, uuid, jsonb) from authenticated;
grant execute on function
  public.upsert_channel(uuid, text, text, text, boolean),
  public.create_video(text, text, uuid, uuid, uuid, date, public.video_priority),
  public.update_video_info(uuid, text, text, uuid, date, public.video_priority),
  public.assign_video(uuid, uuid, uuid),
  public.update_content(uuid, public.item_status, public.item_status, public.item_status, public.item_status, text, text),
  public.submit_handover(uuid, text),
  public.confirm_handover(uuid, text, text),
  public.update_edit(uuid, integer, text, text),
  public.submit_for_review(uuid, text),
  public.review_video(uuid, text, text),
  public.publish_video(uuid, text, date, uuid),
  public.set_video_hold(uuid, text, text),
  public.add_video_comment(uuid, text),
  public.mark_notifications_read(bigint[])
to authenticated;
