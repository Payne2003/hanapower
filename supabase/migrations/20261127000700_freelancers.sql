-- =====================================================================
-- 0700 · Cộng tác viên (freelancer): hồ sơ, giao việc, hạn bàn giao, nghiệm thu, thù lao, trạng thái thanh toán.
--   Cộng tác viên có thể có tài khoản (vai trò collaborator) — chỉ thấy việc được giao cho mình.
--   Nghiệm thu một việc → tự tạo đề nghị chi "Thù lao cộng tác viên" để kế toán duyệt và thanh toán.
-- =====================================================================
create type public.assignment_status as enum ('assigned', 'accepted', 'delivered', 'approved', 'declined', 'cancelled');

create table public.freelancers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid,
  full_name   text not null check (length(trim(full_name)) > 0),
  phones      text[] not null default '{}',
  emails      text[] not null default '{}',
  skills      text[] not null default '{}',
  rate_note   text,
  note        text,
  is_active   boolean not null default true,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, id),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete set null (user_id)
);
create unique index freelancers_user_uidx on public.freelancers(user_id) where user_id is not null and deleted_at is null;
create trigger freelancers_touch before update on public.freelancers for each row execute function app.touch_updated_at();

create table public.freelancer_payment_info (
  freelancer_id uuid primary key,
  org_id        uuid not null,
  bank_name     text, account_no text, account_name text, tax_code text, id_number text,
  updated_at    timestamptz not null default now(),
  foreign key (org_id, freelancer_id) references public.freelancers(org_id, id) on delete cascade
);

create table public.freelance_assignments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  freelancer_id uuid not null,
  project_id    uuid,
  video_id      uuid,
  context       text,                       -- tên dự án / video hiển thị cho cộng tác viên
  title         text not null check (length(trim(title)) > 0),
  description   text,
  due_date      date,
  fee           numeric(16,2) not null default 0 check (fee >= 0),
  status        public.assignment_status not null default 'assigned',
  delivered_url text,
  delivered_at  timestamptz,
  review_note   text,
  reviewed_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  expense_id    uuid,
  payment       text not null default 'unpaid' check (payment in ('unpaid', 'paid')),
  paid_on       date,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, freelancer_id) references public.freelancers(org_id, id) on delete restrict,
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id),
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete set null (video_id),
  foreign key (org_id, expense_id) references public.expenses(org_id, id) on delete set null (expense_id)
);
create index freelance_assignments_fl_idx on public.freelance_assignments(freelancer_id, status);
create index freelance_assignments_project_idx on public.freelance_assignments(project_id);
create trigger freelance_assignments_touch before update on public.freelance_assignments for each row execute function app.touch_updated_at();

-- Đồng bộ trạng thái thanh toán từ chi phí (hàm 0600 gọi mỗi khi duyệt / thanh toán chi phí)
create or replace function app.sync_assignment_fee(p_expense uuid) returns void
language sql security definer set search_path = '' as $$
  update public.freelance_assignments a set payment = case when e.payment = 'paid' then 'paid' else 'unpaid' end, paid_on = e.paid_on
  from public.expenses e where e.id = p_expense and a.expense_id = e.id
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
create or replace function app.is_my_freelancer(p_freelancer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.freelancers f where f.id = p_freelancer and f.user_id = auth.uid() and f.deleted_at is null)
$$;

alter table public.freelancers enable row level security;
alter table public.freelancer_payment_info enable row level security;
alter table public.freelance_assignments enable row level security;

create policy freelancers_select on public.freelancers for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and (user_id = auth.uid() or (not app.has_role('collaborator') and app.is_active_user())));
create policy freelancer_pay_select on public.freelancer_payment_info for select to authenticated
  using (org_id = app.current_org_id() and (app.has_permission('freelancers.manage') or app.has_permission('finance.view') or app.is_my_freelancer(freelancer_id)));
create policy assignments_select on public.freelance_assignments for select to authenticated
  using (org_id = app.current_org_id()
         and (app.is_my_freelancer(freelancer_id) or app.has_permission('freelancers.manage') or app.has_permission('finance.view')
              or (project_id is not null and app.can_manage_project(project_id)) or created_by = auth.uid()));

revoke all on public.freelancers, public.freelancer_payment_info, public.freelance_assignments from anon, authenticated;
grant select on public.freelancers, public.freelancer_payment_info, public.freelance_assignments to authenticated;
grant all on public.freelancers, public.freelancer_payment_info, public.freelance_assignments to service_role;

-- ---------------------------------------------------------------------
-- Cộng tác viên (vai trò collaborator) chỉ thấy phần của mình: policy RESTRICTIVE chồng thêm lên mọi bảng nội bộ
-- ---------------------------------------------------------------------
create or replace function app.collab_sees_video(p_video uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.freelance_assignments a join public.freelancers f on f.id = a.freelancer_id
                 where a.video_id = p_video and f.user_id = auth.uid() and a.status in ('assigned', 'accepted', 'delivered', 'approved'))
$$;

do $$
declare t text;
begin
  -- bảng nội bộ: cộng tác viên không đọc được
  foreach t in array array['audit_logs','channels','departments','department_managers','positions','user_departments_positions','video_comments','video_events',
                           'income_sources','expense_categories','incomes','expenses','advances','org_counters'] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (not app.has_role(%L))', t || '_no_collab', t, 'collaborator');
  end loop;
end $$;
create policy profiles_collab on public.profiles as restrictive for select to authenticated using (id = auth.uid() or not app.has_role('collaborator'));
create policy user_roles_collab on public.user_roles as restrictive for select to authenticated using (user_id = auth.uid() or not app.has_role('collaborator'));
create policy videos_collab on public.videos as restrictive for select to authenticated using (not app.has_role('collaborator') or app.collab_sees_video(id));
create policy video_items_collab on public.video_items as restrictive for select to authenticated using (not app.has_role('collaborator') or app.collab_sees_video(video_id));

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create or replace function public.save_freelancer(
  p_id uuid, p_name text, p_phones text[] default '{}', p_emails text[] default '{}', p_skills text[] default '{}',
  p_rate_note text default null, p_note text default null, p_active boolean default true, p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if v_org is null or not app.has_permission('freelancers.manage') then raise exception 'Bạn không có quyền quản lý cộng tác viên' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập họ tên cộng tác viên' using errcode = '22023'; end if;
  if p_user_id is not null and not app.has_role_of(p_user_id, 'collaborator') then raise exception 'Tài khoản liên kết phải có vai trò Cộng tác viên' using errcode = '22023'; end if;
  if p_user_id is not null and exists (select 1 from public.freelancers where user_id = p_user_id and deleted_at is null and id is distinct from p_id) then
    raise exception 'Tài khoản này đã gắn với cộng tác viên khác' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.freelancers (org_id, user_id, full_name, phones, emails, skills, rate_note, note, is_active)
    values (v_org, p_user_id, trim(p_name), coalesce(p_phones, '{}'), coalesce(p_emails, '{}'), coalesce(p_skills, '{}'),
            nullif(trim(coalesce(p_rate_note, '')), ''), nullif(trim(coalesce(p_note, '')), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.freelancers set user_id = p_user_id, full_name = trim(p_name), phones = coalesce(p_phones, '{}'), emails = coalesce(p_emails, '{}'),
      skills = coalesce(p_skills, '{}'), rate_note = nullif(trim(coalesce(p_rate_note, '')), ''), note = nullif(trim(coalesce(p_note, '')), ''),
      is_active = coalesce(p_active, true)
    where id = p_id and org_id = v_org and deleted_at is null returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy cộng tác viên' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.save_freelancer_payment(
  p_id uuid, p_bank text default null, p_account_no text default null, p_account_name text default null, p_tax_code text default null, p_id_number text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not (app.has_permission('freelancers.manage') or app.has_permission('finance.manage') or app.is_my_freelancer(p_id)) then
    raise exception 'Bạn không có quyền sửa thông tin thanh toán' using errcode = '42501';
  end if;
  if not exists (select 1 from public.freelancers where id = p_id and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy cộng tác viên' using errcode = 'P0002'; end if;
  insert into public.freelancer_payment_info (freelancer_id, org_id, bank_name, account_no, account_name, tax_code, id_number)
  values (p_id, v_org, nullif(trim(coalesce(p_bank, '')), ''), nullif(trim(coalesce(p_account_no, '')), ''), nullif(trim(coalesce(p_account_name, '')), ''),
          nullif(trim(coalesce(p_tax_code, '')), ''), nullif(trim(coalesce(p_id_number, '')), ''))
  on conflict (freelancer_id) do update set bank_name = excluded.bank_name, account_no = excluded.account_no, account_name = excluded.account_name,
    tax_code = excluded.tax_code, id_number = excluded.id_number, updated_at = now();
end $$;

create or replace function public.assign_freelancer(
  p_freelancer uuid, p_title text, p_fee numeric, p_due date default null, p_project uuid default null, p_video uuid default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); f public.freelancers%rowtype; v_id uuid; v_ctx text; pr public.projects%rowtype;
begin
  if v_org is null then raise exception 'Bạn không có quyền giao việc' using errcode = '42501'; end if;
  select * into f from public.freelancers where id = p_freelancer and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy cộng tác viên' using errcode = 'P0002'; end if;
  if not f.is_active then raise exception 'Cộng tác viên đang ngừng hợp tác' using errcode = '22023'; end if;
  if not (app.has_permission('freelancers.manage') or (p_project is not null and app.can_manage_project(p_project))) then
    raise exception 'Bạn không có quyền giao việc cho cộng tác viên' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Nhập tên đầu việc' using errcode = '22023'; end if;
  if coalesce(p_fee, 0) < 0 then raise exception 'Thù lao không hợp lệ' using errcode = '22023'; end if;
  if p_due is not null and p_due < app.today() then raise exception 'Hạn bàn giao phải từ hôm nay trở đi' using errcode = '22023'; end if;
  if p_project is not null then
    select * into pr from public.projects where id = p_project and org_id = v_org and deleted_at is null;
    if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
    v_ctx := pr.code || ' – ' || pr.name;
  end if;
  if p_video is not null then
    if not exists (select 1 from public.videos where id = p_video and org_id = v_org) then raise exception 'Không tìm thấy video' using errcode = 'P0002'; end if;
    v_ctx := coalesce(v_ctx || ' / ', '') || (select code || ' ' || title from public.videos where id = p_video);
  end if;
  insert into public.freelance_assignments (org_id, freelancer_id, project_id, video_id, context, title, description, due_date, fee)
  values (v_org, f.id, p_project, p_video, v_ctx, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_due, coalesce(p_fee, 0))
  returning id into v_id;
  perform app.notify_link(v_org, f.user_id, 'assignment', 'Bạn được giao việc: ' || trim(p_title), '/cong-tac-vien/viec/' || v_id::text);
  perform app.write_audit(v_org, 'assignment.create', 'assignment', v_id, jsonb_build_object('freelancer', f.id, 'fee', p_fee));
  return v_id;
end $$;

-- Hành động trên một đầu việc: accept | decline | deliver | approve | revise | cancel
create or replace function public.assignment_action(p_id uuid, p_action text, p_url text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); a public.freelance_assignments%rowtype; f public.freelancers%rowtype; v_mine boolean; v_mgr boolean;
        v_cat uuid; v_exp uuid; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from public.freelance_assignments where id = p_id and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy đầu việc' using errcode = 'P0002'; end if;
  select * into f from public.freelancers where id = a.freelancer_id;
  v_mine := f.user_id = auth.uid();
  v_mgr := app.has_permission('freelancers.manage') or (a.project_id is not null and app.can_manage_project(a.project_id)) or a.created_by = auth.uid();
  if p_action in ('accept', 'decline') then
    if not (v_mine or v_mgr) then raise exception 'Bạn không có quyền với đầu việc này' using errcode = '42501'; end if;
    if a.status <> 'assigned' then raise exception 'Đầu việc không ở trạng thái chờ nhận' using errcode = '22023'; end if;
    if p_action = 'decline' and v_note is null then raise exception 'Cần nhập lý do từ chối' using errcode = '22023'; end if;
    update public.freelance_assignments set status = (case when p_action = 'accept' then 'accepted' else 'declined' end)::public.assignment_status, review_note = v_note where id = a.id;
    if a.created_by is not null then perform app.notify_link(v_org, a.created_by, 'assignment', f.full_name || (case when p_action = 'accept' then ' đã nhận việc: ' else ' từ chối việc: ' end) || a.title, '/cong-tac-vien/viec/' || a.id::text); end if;
  elsif p_action = 'deliver' then
    if not (v_mine or v_mgr) then raise exception 'Bạn không có quyền với đầu việc này' using errcode = '42501'; end if;
    if a.status <> 'accepted' then raise exception 'Cần nhận việc trước khi bàn giao' using errcode = '22023'; end if;
    if p_url is null or trim(p_url) !~* '^https?://' then raise exception 'Cần link sản phẩm bàn giao (http:// hoặc https://)' using errcode = '22023'; end if;
    update public.freelance_assignments set status = 'delivered', delivered_url = trim(p_url), delivered_at = now(), review_note = null where id = a.id;
    if a.created_by is not null then perform app.notify_link(v_org, a.created_by, 'assignment', f.full_name || ' đã bàn giao: ' || a.title, '/cong-tac-vien/viec/' || a.id::text); end if;
  elsif p_action = 'revise' then
    if not v_mgr then raise exception 'Chỉ người giao việc được yêu cầu sửa' using errcode = '42501'; end if;
    if a.status <> 'delivered' then raise exception 'Đầu việc chưa bàn giao' using errcode = '22023'; end if;
    if v_note is null then raise exception 'Cần nhập yêu cầu chỉnh sửa' using errcode = '22023'; end if;
    update public.freelance_assignments set status = 'accepted', review_note = v_note where id = a.id;
    perform app.notify_link(v_org, f.user_id, 'assignment', 'Yêu cầu sửa: ' || a.title, '/cong-tac-vien/viec/' || a.id::text);
  elsif p_action = 'approve' then
    if not v_mgr then raise exception 'Chỉ người giao việc được nghiệm thu' using errcode = '42501'; end if;
    if a.status <> 'delivered' then raise exception 'Đầu việc chưa bàn giao' using errcode = '22023'; end if;
    select id into v_cat from public.expense_categories where org_id = v_org and name = 'Thù lao cộng tác viên' limit 1;
    if a.fee > 0 then
      insert into public.expenses (org_id, occurred_on, project_id, video_id, category_id, payee_type, payee_name, amount, description, approval, requested_by)
      values (v_org, app.today(), a.project_id, a.video_id, v_cat, 'freelancer', f.full_name, a.fee, 'Thù lao: ' || a.title, 'submitted', auth.uid())
      returning id into v_exp;
      perform app.notify_permission(v_org, 'finance.approve', 'expense_submitted', 'Thù lao CTV ' || f.full_name || ' ' || a.fee::bigint::text || ' đ chờ duyệt', '/chi-phi');
    end if;
    update public.freelance_assignments set status = 'approved', approved_at = now(), reviewed_by = auth.uid(), review_note = v_note, expense_id = v_exp where id = a.id;
    perform app.notify_link(v_org, f.user_id, 'assignment', 'Đã nghiệm thu: ' || a.title, '/cong-tac-vien/viec/' || a.id::text);
  elsif p_action = 'cancel' then
    if not v_mgr then raise exception 'Chỉ người giao việc được hủy' using errcode = '42501'; end if;
    if a.status in ('approved', 'cancelled') then raise exception 'Đầu việc đã chốt — không hủy được' using errcode = '22023'; end if;
    update public.freelance_assignments set status = 'cancelled', review_note = v_note where id = a.id;
  else
    raise exception 'Hành động không hợp lệ' using errcode = '22023';
  end if;
  perform app.write_audit(v_org, 'assignment.' || p_action, 'assignment', a.id, jsonb_build_object('title', a.title));
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid) from authenticated;
