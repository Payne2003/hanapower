-- =====================================================================
-- 0940 · Hồ sơ tự phục vụ: ảnh đại diện và tài liệu hệ thống yêu cầu nộp
--   * Ảnh đại diện: bảng user_avatars (≤ 2 MB, JPEG/PNG/WebP kiểm tra cả chữ ký tệp), thay / gỡ trong một giao dịch;
--     profiles.avatar_updated_at làm "phiên bản" để làm mới ảnh ở mọi nơi.
--   * Tài liệu yêu cầu: document_types (mẫu), document_requests (yêu cầu giao từng nhân viên, trạng thái, người duyệt),
--     user_documents.request_id liên kết tệp đã nộp. Tệp hồ sơ cũ giữ nguyên.
--   * Nhân viên tự sửa địa chỉ; HR giao / duyệt / yêu cầu nộp lại; thông báo cho cả hai phía.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ảnh đại diện
-- ---------------------------------------------------------------------
alter table public.profiles add column avatar_updated_at timestamptz;
create table public.user_avatars (
  user_id uuid primary key,
  org_id uuid not null,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  content bytea not null check (length(content) between 1 and 2097152),
  updated_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
alter table public.user_avatars enable row level security;
-- Ai thấy hồ sơ của nhau (trừ cộng tác viên) thì thấy ảnh đại diện; cộng tác viên chỉ thấy ảnh của chính mình.
create policy user_avatars_sel on public.user_avatars for select to authenticated
  using (org_id = app.current_org_id() and (user_id = auth.uid() or not app.has_role('collaborator')));
revoke all on public.user_avatars from anon, authenticated;
grant select on public.user_avatars to authenticated;
grant all on public.user_avatars to service_role;

create or replace function public.set_my_avatar(p_mime text, p_content_base64 text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_bin bytea; v_head bytea; v_ok boolean; v_ts timestamptz := clock_timestamp();
begin
  if v_org is null or not app.is_active_user() then raise exception 'Bạn cần đăng nhập' using errcode = '42501'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung ảnh không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp ảnh rỗng' using errcode = '22023'; end if;
  if length(v_bin) > 2097152 then raise exception 'Ảnh tối đa 2 MB' using errcode = '22023'; end if;
  v_head := substring(v_bin from 1 for 12);
  v_ok := case p_mime
    when 'image/jpeg' then substring(v_head from 1 for 3) = '\xffd8ff'::bytea
    when 'image/png' then substring(v_head from 1 for 8) = '\x89504e470d0a1a0a'::bytea
    when 'image/webp' then substring(v_head from 1 for 4) = '\x52494646'::bytea and substring(v_head from 9 for 4) = '\x57454250'::bytea
    else false end;
  if not v_ok then raise exception 'Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ' using errcode = '22023'; end if;
  insert into public.user_avatars (user_id, org_id, mime, content, updated_at) values (auth.uid(), v_org, p_mime, v_bin, v_ts)
  on conflict (user_id) do update set mime = excluded.mime, content = excluded.content, updated_at = excluded.updated_at;
  update public.profiles set avatar_updated_at = v_ts where id = auth.uid();
  return v_ts;
end $$;

create or replace function public.remove_my_avatar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.current_org_id() is null then raise exception 'Bạn cần đăng nhập' using errcode = '42501'; end if;
  delete from public.user_avatars where user_id = auth.uid();
  update public.profiles set avatar_updated_at = null where id = auth.uid();
end $$;

create or replace function public.get_avatar(p_user uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('mime', a.mime, 'content', encode(a.content, 'base64')) from public.user_avatars a where a.user_id = p_user
$$;

-- Ngữ cảnh người dùng kèm phiên bản ảnh đại diện (thanh bên hiện ảnh mà không tốn thêm một lượt truy vấn).
create or replace function public.get_my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.id is null then null else jsonb_build_object(
    'user_id', p.id, 'org_id', p.org_id, 'org_name', o.name, 'timezone', o.timezone, 'full_name', p.full_name, 'email', p.email,
    'department_id', p.department_id, 'is_active', p.is_active, 'avatar_updated_at', p.avatar_updated_at,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(distinct rp.permission) from public.user_roles r join public.role_permissions rp on rp.role = r.role where r.user_id = p.id), '[]'::jsonb),
    'today', (now() at time zone o.timezone)::date
  ) end
  from (select auth.uid() as uid) me
  left join public.profiles p on p.id = me.uid
  left join public.organizations o on o.id = p.org_id
$$;

-- ---------------------------------------------------------------------
-- Nhân viên tự sửa thông tin cá nhân được phép (địa chỉ). Chỉ dùng auth.uid(); không nhận mã nhân viên.
-- Ngày sinh, giới tính, CCCD, mã số thuế và hồ sơ làm việc do HR quản lý.
-- ---------------------------------------------------------------------
create or replace function public.save_my_profile(p_address text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_addr text := nullif(trim(coalesce(p_address, '')), '');
begin
  if v_org is null or not app.is_active_user() then raise exception 'Bạn cần đăng nhập' using errcode = '42501'; end if;
  if v_addr is not null and length(v_addr) > 300 then raise exception 'Địa chỉ tối đa 300 ký tự' using errcode = '22023'; end if;
  insert into public.staff_personal (user_id, org_id, address) values (auth.uid(), v_org, v_addr)
  on conflict (user_id) do update set address = excluded.address, updated_at = now();
  perform app.write_audit(v_org, 'staff.self_profile', 'profile', auth.uid(), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Tài liệu yêu cầu nộp
-- ---------------------------------------------------------------------
create type public.doc_request_status as enum ('pending', 'submitted', 'approved', 'rejected');

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  instructions text check (length(instructions) <= 600),
  is_required boolean not null default true,
  allowed_exts text[] not null default '{pdf,jpg,jpeg,png}' check (cardinality(allowed_exts) between 1 and 8),
  max_mb integer not null default 5 check (max_mb between 1 and 5),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);
create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  type_id uuid not null,
  is_required boolean not null default true,
  due_date date,
  note text check (length(note) <= 600),
  status public.doc_request_status not null default 'pending',
  document_id uuid,
  reject_reason text,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  foreign key (org_id, type_id) references public.document_types(org_id, id) on delete cascade,
  unique (user_id, type_id)
);
create index document_requests_user_idx on public.document_requests (user_id);
create index document_requests_status_idx on public.document_requests (org_id, status);
alter table public.user_documents add column request_id uuid references public.document_requests(id) on delete set null;
alter table public.document_requests add constraint document_requests_doc_fk foreign key (document_id) references public.user_documents(id) on delete set null;

alter table public.document_types enable row level security;
alter table public.document_requests enable row level security;
create policy document_types_sel on public.document_types for select to authenticated using (org_id = app.current_org_id() and not app.has_role('collaborator'));
create policy document_requests_sel on public.document_requests for select to authenticated using (org_id = app.current_org_id() and app.can_staff(user_id));
revoke all on public.document_types, public.document_requests from anon, authenticated;
grant select on public.document_types, public.document_requests to authenticated;
grant all on public.document_types, public.document_requests to service_role;

-- Mẫu tài liệu mặc định cho mỗi doanh nghiệp (cả doanh nghiệp mới tạo sau này).
create or replace function public.seed_document_types(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.document_types (org_id, name, instructions, is_required, allowed_exts)
  values (p_org, 'Căn cước công dân (2 mặt)', 'Ảnh chụp hoặc bản quét rõ nét cả hai mặt.', true, '{pdf,jpg,jpeg,png}'),
         (p_org, 'Hợp đồng lao động đã ký', 'Bản quét có đủ chữ ký hai bên.', true, '{pdf}'),
         (p_org, 'Bằng cấp / chứng chỉ', 'Không bắt buộc; nộp nếu có.', false, '{pdf,jpg,jpeg,png}')
  on conflict do nothing
$$;
revoke all on function public.seed_document_types(uuid) from public, anon, authenticated;
create or replace function app.org_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_crm_defaults(new.id);
  perform public.seed_finance_defaults(new.id);
  perform public.seed_document_types(new.id);
  insert into public.payroll_settings (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;
select public.seed_document_types(id) from public.organizations;

create or replace function public.save_document_type(p_id uuid, p_name text, p_instructions text, p_required boolean, p_exts text[], p_max_mb integer, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_id uuid := p_id; v_exts text[] := (select coalesce(array_agg(distinct lower(regexp_replace(x, '^\.', ''))), '{}') from unnest(coalesce(p_exts, '{}')) x where trim(x) <> '');
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên tài liệu' using errcode = '22023'; end if;
  if cardinality(v_exts) = 0 then v_exts := '{pdf,jpg,jpeg,png}'; end if;
  if exists (select 1 from unnest(v_exts) x where x !~ '^[a-z0-9]{2,5}$') then raise exception 'Định dạng tệp không hợp lệ' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.document_types (org_id, name, instructions, is_required, allowed_exts, max_mb, is_active)
    values (v_org, trim(p_name), nullif(trim(coalesce(p_instructions, '')), ''), coalesce(p_required, true), v_exts, coalesce(p_max_mb, 5), coalesce(p_active, true)) returning id into v_id;
  else
    update public.document_types set name = trim(p_name), instructions = nullif(trim(coalesce(p_instructions, '')), ''), is_required = coalesce(p_required, true),
      allowed_exts = v_exts, max_mb = coalesce(p_max_mb, 5), is_active = coalesce(p_active, true) where id = v_id and org_id = v_org;
    if not found then raise exception 'Không tìm thấy loại tài liệu' using errcode = 'P0002'; end if;
  end if;
  perform app.write_audit(v_org, 'doc_type.save', 'document_type', v_id, '{}'::jsonb);
  return v_id;
exception when unique_violation then
  raise exception 'Đã có loại tài liệu tên "%"', trim(p_name) using errcode = '23505';
end $$;

-- Giao yêu cầu cho nhiều nhân viên: danh sách chọn + toàn bộ thành viên một phòng. Yêu cầu đã duyệt không bị đổi.
create or replace function public.assign_document_request(p_type uuid, p_users uuid[], p_dept uuid, p_due date, p_note text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); t public.document_types%rowtype; u uuid; v_n int := 0; v_users uuid[]; r public.document_requests%rowtype;
begin
  select * into t from public.document_types where id = p_type and org_id = v_org and is_active;
  if not found then raise exception 'Không tìm thấy loại tài liệu (hoặc đã ngừng dùng)' using errcode = 'P0002'; end if;
  if p_due is not null and p_due < current_date then raise exception 'Hạn nộp không được ở quá khứ' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_users from (
    select unnest(coalesce(p_users, '{}')) x
    union select d.user_id from public.user_departments_positions d where p_dept is not null and d.department_id = p_dept and d.org_id = v_org) s
  where exists (select 1 from public.profiles p where p.id = s.x and p.org_id = v_org and p.is_active and p.employment_status <> 'resigned')
    and not app.has_role_of(s.x, 'collaborator');
  if cardinality(v_users) = 0 then raise exception 'Chọn ít nhất một nhân viên đang làm việc hoặc một phòng có thành viên' using errcode = '22023'; end if;
  foreach u in array v_users loop
    select * into r from public.document_requests where user_id = u and type_id = p_type for update;
    if found then
      if r.status = 'approved' then continue; end if;
      update public.document_requests set due_date = p_due, note = nullif(trim(coalesce(p_note, '')), ''), is_required = t.is_required where id = r.id;
    else
      insert into public.document_requests (org_id, user_id, type_id, is_required, due_date, note) values (v_org, u, p_type, t.is_required, p_due, nullif(trim(coalesce(p_note, '')), ''));
    end if;
    v_n := v_n + 1;
    perform app.notify_link(v_org, u, 'doc_request', 'HR yêu cầu bạn nộp tài liệu: ' || t.name || case when p_due is not null then ' (hạn ' || to_char(p_due, 'DD/MM/YYYY') || ')' else '' end, '/cai-dat/ho-so#tai-lieu');
  end loop;
  perform app.write_audit(v_org, 'doc_request.assign', 'document_type', p_type, jsonb_build_object('count', v_n, 'dept', p_dept));
  return v_n;
end $$;

-- Nhân viên nộp / thay tệp cho đúng yêu cầu của CHÍNH MÌNH (nhận diện từ phiên đăng nhập).
create or replace function public.submit_my_document(p_request uuid, p_name text, p_mime text, p_content_base64 text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); r public.document_requests%rowtype; t public.document_types%rowtype; v_bin bytea; v_id uuid; v_name text; v_ext text; v_me text;
begin
  if v_org is null or not app.is_active_user() then raise exception 'Bạn cần đăng nhập' using errcode = '42501'; end if;
  select * into r from public.document_requests where id = p_request and org_id = v_org and user_id = auth.uid() for update;
  if not found then raise exception 'Không tìm thấy yêu cầu tài liệu của bạn' using errcode = 'P0002'; end if;
  if r.status = 'approved' then raise exception 'Tài liệu đã được duyệt — liên hệ HR nếu cần thay bản khác' using errcode = '22023'; end if;
  select * into t from public.document_types where id = r.type_id;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '[/\\\r\n]', '_', 'g'), 160);
  v_ext := lower(substring(v_name from '\.([A-Za-z0-9]{2,5})$'));
  if v_name = '' or v_ext is null then raise exception 'Tên tệp cần có phần mở rộng (vd. .pdf)' using errcode = '22023'; end if;
  if not (v_ext = any (t.allowed_exts)) then raise exception 'Tài liệu này chỉ nhận định dạng: %', array_to_string(t.allowed_exts, ', ') using errcode = '22023'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung tệp không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp rỗng' using errcode = '22023'; end if;
  if length(v_bin) > t.max_mb * 1048576 then raise exception 'Tệp vượt quá % MB', t.max_mb using errcode = '22023'; end if;
  insert into public.user_documents (org_id, user_id, name, mime, size_bytes, request_id) values (v_org, auth.uid(), v_name, coalesce(nullif(p_mime, ''), 'application/octet-stream'), length(v_bin), r.id) returning id into v_id;
  insert into public.user_document_files (document_id, content) values (v_id, v_bin);
  -- bản cũ của chính yêu cầu này được thay thế (giải phóng dung lượng); nhật ký vẫn ghi lại
  delete from public.user_documents where request_id = r.id and id <> v_id;
  update public.document_requests set status = 'submitted', document_id = v_id, submitted_at = now(), reject_reason = null, reviewed_by = null, reviewed_at = null where id = r.id;
  select full_name into v_me from public.profiles where id = auth.uid();
  perform app.notify_permission(v_org, 'staff.manage', 'doc_submitted', v_me || ' đã nộp tài liệu: ' || t.name || ' — chờ duyệt', '/nhan-su?xem=chi-tiet&id=' || auth.uid() || '&muc=tai-lieu');
  perform app.write_audit(v_org, 'doc_request.submit', 'profile', auth.uid(), jsonb_build_object('type', t.name));
  return v_id;
end $$;

create or replace function public.review_document_request(p_request uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); r public.document_requests%rowtype; t public.document_types%rowtype; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into r from public.document_requests where id = p_request and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy yêu cầu tài liệu' using errcode = 'P0002'; end if;
  if r.status <> 'submitted' then raise exception 'Chỉ duyệt được tài liệu đang chờ duyệt' using errcode = '22023'; end if;
  select * into t from public.document_types where id = r.type_id;
  if p_decision = 'approve' then
    update public.document_requests set status = 'approved', reject_reason = null, reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
    perform app.notify_link(v_org, r.user_id, 'doc_approved', 'Tài liệu "' || t.name || '" đã được duyệt', '/cai-dat/ho-so#tai-lieu');
  elsif p_decision = 'reject' then
    if v_reason is null then raise exception 'Nhập lý do yêu cầu nộp lại' using errcode = '22023'; end if;
    update public.document_requests set status = 'rejected', reject_reason = v_reason, reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
    perform app.notify_link(v_org, r.user_id, 'doc_rejected', 'Cần nộp lại tài liệu "' || t.name || '": ' || v_reason, '/cai-dat/ho-so#tai-lieu');
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
  perform app.write_audit(v_org, 'doc_request.' || p_decision, 'profile', r.user_id, jsonb_build_object('type', t.name));
end $$;

create or replace function public.delete_document_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); r public.document_requests%rowtype;
begin
  select * into r from public.document_requests where id = p_request and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy yêu cầu tài liệu' using errcode = 'P0002'; end if;
  delete from public.user_documents where request_id = r.id;
  delete from public.document_requests where id = r.id;
  perform app.write_audit(v_org, 'doc_request.delete', 'profile', r.user_id, '{}'::jsonb);
end $$;

-- Tình trạng hồ sơ theo nhân viên (cho HR): hoàn thành = mọi tài liệu BẮT BUỘC đã duyệt. Chỉ người có quyền thấy yêu cầu của người khác (RLS).
create or replace function public.doc_status_list(p_q text default null, p_dept uuid default null, p_status text default null, p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_res jsonb;
begin
  if not app.is_staff_admin() then raise exception 'Chỉ quản trị hoặc nhân sự xem được tình trạng hồ sơ' using errcode = '42501'; end if;
  with d as (
    select p.id, p.employee_code code, p.full_name nm,
      (count(r.id) filter (where r.is_required))::int req, (count(r.id) filter (where r.is_required and r.status = 'approved'))::int appr,
      (count(r.id) filter (where r.status = 'submitted'))::int subm, (count(r.id) filter (where r.status = 'rejected'))::int rej, (count(r.id) filter (where r.status = 'pending'))::int pend
    from public.profiles p left join public.document_requests r on r.user_id = p.id
    where p.id in (select public.staff_filtered_ids(p_q, p_dept, null, null, null, false)) and p.employment_status <> 'resigned'
    group by p.id
  ), e as (select d.*, case when req = 0 then 'none' when appr = req then 'complete' else 'incomplete' end st from d),
  f as (select * from e where coalesce(p_status, '') = '' or (p_status = 'complete' and st = 'complete') or (p_status = 'incomplete' and st = 'incomplete')
        or (p_status = 'none' and st = 'none') or (p_status = 'review' and subm > 0) or (p_status = 'rejected' and rej > 0) or (p_status = 'missing' and pend > 0))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'summary', (select jsonb_build_object('total', count(*), 'complete', count(*) filter (where st = 'complete'), 'incomplete', count(*) filter (where st = 'incomplete'), 'none', count(*) filter (where st = 'none'),
                 'review', count(*) filter (where subm > 0), 'rejected', count(*) filter (where rej > 0), 'missing', count(*) filter (where pend > 0)) from e),
    'rows', (select coalesce(jsonb_agg(x.j order by x.nm), '[]'::jsonb) from (
      select f.nm, jsonb_build_object('id', f.id, 'code', f.code, 'name', f.nm, 'required', f.req, 'approved', f.appr, 'submitted', f.subm, 'rejected', f.rej, 'pending', f.pend, 'state', f.st,
        'depts', (select coalesce(jsonb_agg(distinct dp.name), '[]'::jsonb) from public.user_departments_positions u join public.departments dp on dp.id = u.department_id where u.user_id = f.id)) j
      from f order by f.nm limit least(greatest(coalesce(p_limit, 20), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x)) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- Danh sách / tổng quan phòng ban có kèm ảnh đại diện (thay thế bản 0930)
-- ---------------------------------------------------------------------
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
        'type', p.employment_type, 'active', p.is_active, 'avatar', p.avatar_updated_at,
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

create or replace function public.department_overview(p_dept uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'dept', jsonb_build_object('id', d.id, 'name', d.name, 'active', d.is_active),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'code', p.employee_code, 'name', p.full_name, 'avatar', p.avatar_updated_at, 'position_id', dm.position_id, 'position', ps.name) order by p.full_name), '[]'::jsonb)
                 from public.department_managers dm join public.profiles p on p.id = dm.user_id left join public.positions ps on ps.id = dm.position_id where dm.department_id = d.id),
    'members', (select coalesce(jsonb_agg(m.j order by m.name), '[]'::jsonb) from (
        select p.full_name name, jsonb_build_object('id', p.id, 'code', p.employee_code, 'name', p.full_name, 'avatar', p.avatar_updated_at, 'email', p.email, 'work_form', p.work_form, 'status', p.employment_status, 'type', p.employment_type,
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


grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid), app.sync_video_tasks(uuid), app.trg_videos_sync_tasks(), app.trg_items_sync_tasks(), app.trg_tasks_guard(),
  app.trg_profile_code(), app.check_dept_staff(uuid, uuid, uuid, boolean), app.sync_dept_manager(uuid) from authenticated;
revoke all on function public.submit_my_document(uuid, text, text, text), public.set_my_avatar(text, text) from public, anon;
