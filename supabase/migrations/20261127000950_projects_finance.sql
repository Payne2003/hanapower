-- =====================================================================
-- 0950 · Nâng cấp Dự án và Thu chi & công nợ
--   Dự án: nhiều quản lý, tiến độ, rủi ro, phương thức thanh toán, tài liệu dự án, góc nhìn đã lưu, danh sách / lọc / tổng hợp ở CSDL.
--   Ghi nhận thu: MỘT luồng duy nhất (record_milestone_receipt) dùng cho mọi màn hình — idempotent, khóa dòng mốc, một mốc ↔ một khoản thu.
--   Thu chi: phòng ban + người phụ trách trên giao dịch, nhiều chứng từ / giao dịch, kỳ tài chính có ghi chú + chốt kỳ (khóa) + đối chiếu,
--   phải thu theo mốc theo tuổi nợ, báo cáo theo nhiều chiều, nhắc việc một lần.
-- Ý nghĩa dữ liệu đã xác minh:
--   project_budgets.contract_value = giá trị hợp đồng (căn cứ quy đổi %), budget_cost = NGÂN SÁCH CHI (so với chi đã duyệt).
--   incomes.occurred_on = ngày thực thu (tiền đã vào); expenses.occurred_on = ngày phát sinh, chi "ghi nhận" khi approval = approved.
--   Tiền numeric(16,2), đơn vị VND, không có đa tiền tệ; không làm tròn ngầm (số tiền nhập đúng 2 chữ số thập phân).
-- =====================================================================

create type public.risk_level as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------
-- Dự án: tiến độ, rủi ro, phương thức thanh toán
-- ---------------------------------------------------------------------
alter table public.projects
  add column progress integer not null default 0 check (progress between 0 and 100),
  add column risk_level public.risk_level not null default 'low',
  add column risk_note text check (length(risk_note) <= 1000),
  add column payment_terms text check (length(payment_terms) <= 300);

-- Nhiều quản lý / dự án (projects.manager_id giữ làm "quản lý chính")
create table public.project_managers (
  org_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  primary key (project_id, user_id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index project_managers_user_idx on public.project_managers(user_id);
insert into public.project_managers (org_id, project_id, user_id) select org_id, id, manager_id from public.projects where manager_id is not null on conflict do nothing;

create or replace function app.trg_project_manager_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_id is not null then
    insert into public.project_managers (org_id, project_id, user_id) values (new.org_id, new.id, new.manager_id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger projects_manager_sync after insert or update of manager_id on public.projects for each row execute function app.trg_project_manager_sync();

create or replace function app.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project and p.org_id = app.current_org_id() and p.deleted_at is null
      and (app.has_permission('projects.view_all') or p.manager_id = auth.uid()
           or exists (select 1 from public.project_managers m where m.project_id = p.id and m.user_id = auth.uid())
           or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid()))
  )
$$;
create or replace function app.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.projects p
    where p.id = p_project and p.org_id = app.current_org_id() and p.deleted_at is null
      and (app.has_permission('projects.manage_all') or p.manager_id = auth.uid()
           or exists (select 1 from public.project_managers m where m.project_id = p.id and m.user_id = auth.uid()))
  )
$$;

alter table public.project_managers enable row level security;
create policy project_managers_select on public.project_managers for select to authenticated using (org_id = app.current_org_id() and app.can_view_project(project_id));
revoke all on public.project_managers from anon, authenticated;
grant select on public.project_managers to authenticated;
grant all on public.project_managers to service_role;

create or replace function public.set_project_managers(p_id uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); pr public.projects%rowtype; v_users uuid[]; v_primary uuid;
begin
  select * into pr from public.projects where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền đổi người quản lý dự án này' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_users from unnest(coalesce(p_users, '{}')) x where x is not null;
  if cardinality(v_users) = 0 then raise exception 'Dự án cần ít nhất một người quản lý' using errcode = '22023'; end if;
  perform app.check_members(v_org, v_users);
  v_primary := case when pr.manager_id = any (v_users) then pr.manager_id else v_users[1] end;
  delete from public.project_managers where project_id = p_id and user_id <> all (v_users);
  insert into public.project_managers (org_id, project_id, user_id) select v_org, p_id, u from unnest(v_users) u on conflict do nothing;
  update public.projects set manager_id = v_primary where id = p_id;
  perform app.write_audit(v_org, 'project.managers', 'project', p_id, jsonb_build_object('count', cardinality(v_users)));
end $$;

-- set_project_members cũ đã gỡ thành viên không có trong danh sách (kể cả quản lý phụ) → giữ mọi quản lý
create or replace function public.set_project_members(p_id uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); pr public.projects%rowtype; v_all uuid[];
begin
  select * into pr from public.projects where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền sửa thành viên' using errcode = '42501'; end if;
  v_all := coalesce(p_members, '{}') || coalesce((select array_agg(user_id) from public.project_managers where project_id = p_id), '{}');
  perform app.check_members(v_org, v_all);
  delete from public.project_members where project_id = p_id and user_id <> all (v_all);
  insert into public.project_members (org_id, project_id, user_id) select v_org, p_id, u from (select distinct unnest(coalesce(p_members, '{}')) u) s where u is not null on conflict do nothing;
  perform app.write_audit(v_org, 'project.members', 'project', p_id, jsonb_build_object('count', cardinality(v_all)));
end $$;

create or replace function public.update_project_progress(p_id uuid, p_progress integer, p_risk public.risk_level, p_risk_note text, p_payment_terms text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype;
begin
  select * into pr from public.projects where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy dự án' using errcode = 'P0002'; end if;
  if not app.can_manage_project(p_id) then raise exception 'Bạn không có quyền cập nhật tiến độ dự án này' using errcode = '42501'; end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then raise exception 'Tiến độ từ 0 đến 100%%' using errcode = '22023'; end if;
  update public.projects set progress = p_progress, risk_level = coalesce(p_risk, 'low'), risk_note = nullif(trim(coalesce(p_risk_note, '')), ''),
    payment_terms = nullif(trim(coalesce(p_payment_terms, '')), '') where id = p_id;
  perform app.write_audit(pr.org_id, 'project.progress', 'project', p_id, jsonb_build_object('progress', jsonb_build_array(pr.progress, p_progress), 'risk', jsonb_build_array(pr.risk_level, p_risk)));
end $$;

-- Tài liệu dự án (tệp dự án / kế hoạch / báo cáo; báo giá / hợp đồng chỉ người xem được tiền)
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid not null,
  kind text not null default 'project' check (kind in ('project', 'plan', 'report', 'quote', 'contract', 'other')),
  name text not null check (length(trim(name)) between 1 and 160),
  mime text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade
);
create index project_files_project_idx on public.project_files(project_id);
create table public.project_file_blobs (file_id uuid primary key references public.project_files(id) on delete cascade, content bytea not null);
alter table public.project_files enable row level security;
alter table public.project_file_blobs enable row level security;
create policy project_files_select on public.project_files for select to authenticated
  using (org_id = app.current_org_id() and app.can_view_project(project_id) and (kind in ('project', 'plan', 'report', 'other') or app.can_see_money(project_id)));
create policy project_file_blobs_select on public.project_file_blobs for select to authenticated using (exists (select 1 from public.project_files f where f.id = file_id));
revoke all on public.project_files, public.project_file_blobs from anon, authenticated;
grant select on public.project_files, public.project_file_blobs to authenticated;
grant all on public.project_files, public.project_file_blobs to service_role;

create or replace function public.add_project_file(p_project uuid, p_kind text, p_name text, p_mime text, p_content_base64 text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_bin bytea; v_id uuid; v_name text := left(regexp_replace(trim(coalesce(p_name, '')), E'[/\\\\\r\n]', '_', 'g'), 160);
begin
  if not app.can_manage_project(p_project) then raise exception 'Bạn không có quyền thêm tài liệu vào dự án này' using errcode = '42501'; end if;
  if coalesce(p_kind, 'project') not in ('project', 'plan', 'report', 'quote', 'contract', 'other') then raise exception 'Loại tài liệu không hợp lệ' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Thiếu tên tệp' using errcode = '22023'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung tệp không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp rỗng' using errcode = '22023'; end if;
  if length(v_bin) > 5242880 then raise exception 'Tệp tối đa 5 MB' using errcode = '22023'; end if;
  if coalesce(p_kind, 'project') in ('quote', 'contract') and not app.can_see_money(p_project) then raise exception 'Chỉ người xem được tiền mới thêm báo giá / hợp đồng' using errcode = '42501'; end if;
  insert into public.project_files (org_id, project_id, kind, name, mime, size_bytes) values (v_org, p_project, coalesce(p_kind, 'project'), v_name, coalesce(nullif(p_mime, ''), 'application/octet-stream'), length(v_bin)) returning id into v_id;
  insert into public.project_file_blobs (file_id, content) values (v_id, v_bin);
  perform app.write_audit(v_org, 'project.file_add', 'project', p_project, jsonb_build_object('name', v_name, 'kind', p_kind));
  return v_id;
end $$;

create or replace function public.get_project_file(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('name', f.name, 'mime', f.mime, 'size', f.size_bytes, 'content', encode(b.content, 'base64'))
  from public.project_files f join public.project_file_blobs b on b.file_id = f.id where f.id = p_id
$$;

create or replace function public.delete_project_file(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.project_files%rowtype;
begin
  select * into f from public.project_files where id = p_id and org_id = app.current_org_id();
  if not found or not app.can_manage_project(f.project_id) then raise exception 'Không tìm thấy tài liệu' using errcode = 'P0002'; end if;
  delete from public.project_files where id = p_id;
  perform app.write_audit(f.org_id, 'project.file_delete', 'project', f.project_id, jsonb_build_object('name', f.name));
end $$;

-- Góc nhìn đã lưu (của riêng từng người)
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope text not null check (scope in ('project', 'finance')),
  name text not null check (length(trim(name)) between 1 and 60),
  params text not null check (params ~ '^[A-Za-z0-9_=&%.,:+-]*$' and length(params) <= 600),
  created_at timestamptz not null default now(),
  unique (user_id, scope, name)
);
alter table public.saved_views enable row level security;
create policy saved_views_select on public.saved_views for select to authenticated using (user_id = auth.uid());
revoke all on public.saved_views from anon, authenticated;
grant select on public.saved_views to authenticated;
grant all on public.saved_views to service_role;
create or replace function public.save_view(p_scope text, p_name text, p_params text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if app.current_org_id() is null then raise exception 'Bạn cần đăng nhập' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên góc nhìn' using errcode = '22023'; end if;
  insert into public.saved_views (org_id, user_id, scope, name, params) values (app.current_org_id(), auth.uid(), p_scope, trim(p_name), coalesce(p_params, ''))
  on conflict (user_id, scope, name) do update set params = excluded.params returning id into v_id;
  return v_id;
end $$;
create or replace function public.delete_view(p_id uuid) returns void
language sql security definer set search_path = '' as $$ delete from public.saved_views where id = p_id and user_id = auth.uid() $$;

-- ---------------------------------------------------------------------
-- Giao dịch: phòng ban, người phụ trách, chứng từ nhiều tệp, giữ vết liên kết mốc khi hủy
-- ---------------------------------------------------------------------
alter table public.incomes
  add column department_id uuid, add column owner_id uuid, add column cancelled_milestone_id uuid,
  add foreign key (org_id, department_id) references public.departments(org_id, id) on delete set null (department_id),
  add foreign key (org_id, owner_id) references public.profiles(org_id, id) on delete set null (owner_id);
alter table public.expenses
  add column department_id uuid,
  add foreign key (org_id, department_id) references public.departments(org_id, id) on delete set null (department_id);
create index incomes_dept_idx on public.incomes(department_id) where department_id is not null;
create index expenses_dept_idx on public.expenses(department_id) where department_id is not null;
-- Khoản thu đã hủy trả lại mốc: bỏ liên kết hiệu lực (để mốc thu lại được) nhưng GIỮ vết ở cancelled_milestone_id
update public.incomes set cancelled_milestone_id = milestone_id, milestone_id = null where status = 'cancelled' and milestone_id is not null;

create table public.finance_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  kind text not null check (kind in ('income', 'expense')),
  ref_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  mime text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id) references public.organizations(id) on delete cascade
);
create index finance_files_ref_idx on public.finance_files(kind, ref_id);
create table public.finance_file_blobs (file_id uuid primary key references public.finance_files(id) on delete cascade, content bytea not null);
alter table public.finance_files enable row level security;
alter table public.finance_file_blobs enable row level security;
create policy finance_files_select on public.finance_files for select to authenticated
  using (org_id = app.current_org_id() and ((kind = 'income' and exists (select 1 from public.incomes i where i.id = ref_id))
                                           or (kind = 'expense' and exists (select 1 from public.expenses e where e.id = ref_id))));
create policy finance_file_blobs_select on public.finance_file_blobs for select to authenticated using (exists (select 1 from public.finance_files f where f.id = file_id));
revoke all on public.finance_files, public.finance_file_blobs from anon, authenticated;
grant select on public.finance_files, public.finance_file_blobs to authenticated;
grant all on public.finance_files, public.finance_file_blobs to service_role;

create or replace function public.add_finance_file(p_kind text, p_ref uuid, p_name text, p_mime text, p_content_base64 text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_bin bytea; v_id uuid; v_name text := left(regexp_replace(trim(coalesce(p_name, '')), E'[/\\\\\r\n]', '_', 'g'), 160); e public.expenses%rowtype;
begin
  if p_kind = 'income' then
    if not app.has_permission('finance.manage') then raise exception 'Chỉ kế toán đính kèm chứng từ cho khoản thu' using errcode = '42501'; end if;
    if not exists (select 1 from public.incomes where id = p_ref and org_id = v_org) then raise exception 'Không tìm thấy khoản thu' using errcode = 'P0002'; end if;
  elsif p_kind = 'expense' then
    select * into e from public.expenses where id = p_ref and org_id = v_org and deleted_at is null;
    if not found then raise exception 'Không tìm thấy khoản chi' using errcode = 'P0002'; end if;
    if not (app.has_permission('finance.manage') or (e.requested_by = auth.uid() and e.approval in ('draft', 'submitted', 'rejected'))) then
      raise exception 'Bạn không có quyền đính kèm chứng từ cho khoản chi này' using errcode = '42501';
    end if;
  else raise exception 'Loại giao dịch không hợp lệ' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Thiếu tên tệp' using errcode = '22023'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung tệp không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp rỗng' using errcode = '22023'; end if;
  if length(v_bin) > 5242880 then raise exception 'Tệp tối đa 5 MB' using errcode = '22023'; end if;
  insert into public.finance_files (org_id, kind, ref_id, name, mime, size_bytes) values (v_org, p_kind, p_ref, v_name, coalesce(nullif(p_mime, ''), 'application/octet-stream'), length(v_bin)) returning id into v_id;
  insert into public.finance_file_blobs (file_id, content) values (v_id, v_bin);
  perform app.write_audit(v_org, 'finance.file_add', p_kind, p_ref, jsonb_build_object('name', v_name));
  return v_id;
end $$;

create or replace function public.get_finance_file(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('name', f.name, 'mime', f.mime, 'size', f.size_bytes, 'content', encode(b.content, 'base64'))
  from public.finance_files f join public.finance_file_blobs b on b.file_id = f.id where f.id = p_id
$$;

create or replace function public.delete_finance_file(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.finance_files%rowtype; e public.expenses%rowtype;
begin
  select * into f from public.finance_files where id = p_id and org_id = app.current_org_id();
  if not found then raise exception 'Không tìm thấy chứng từ' using errcode = 'P0002'; end if;
  if f.kind = 'expense' then select * into e from public.expenses where id = f.ref_id; end if;
  if not (app.has_permission('finance.manage') or (f.kind = 'expense' and e.requested_by = auth.uid() and e.approval in ('draft', 'rejected'))) then
    raise exception 'Bạn không có quyền xóa chứng từ này' using errcode = '42501';
  end if;
  delete from public.finance_files where id = p_id;
  perform app.write_audit(f.org_id, 'finance.file_delete', f.kind, f.ref_id, jsonb_build_object('name', f.name));
end $$;

-- ---------------------------------------------------------------------
-- Kỳ tài chính: ghi chú, chốt kỳ (khóa giao dịch) và mở lại có lý do
-- ---------------------------------------------------------------------
create table public.finance_periods (
  org_id uuid not null references public.organizations(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  note text check (length(note) <= 1000),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_income numeric(16,2),
  closed_expense numeric(16,2),
  reopened_at timestamptz,
  reopen_reason text,
  primary key (org_id, year, month)
);
alter table public.finance_periods enable row level security;
create policy finance_periods_select on public.finance_periods for select to authenticated using (org_id = app.current_org_id() and app.has_permission('finance.view'));
revoke all on public.finance_periods from anon, authenticated;
grant select on public.finance_periods to authenticated;
grant all on public.finance_periods to service_role;

create or replace function app.period_closed(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_date is not null and exists (select 1 from public.finance_periods p where p.org_id = app.current_org_id()
    and p.year = extract(year from p_date)::int and p.month = extract(month from p_date)::int and p.closed_at is not null)
$$;

-- Khóa kỳ ở tầng bảng: mọi đường thêm / sửa / hủy / duyệt giao dịch (cũ hay mới) đều bị chặn khi kỳ đã chốt.
create or replace function app.trg_finance_period_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old date; v_new date; v_hit boolean := false;
begin
  if tg_table_name = 'incomes' then
    if tg_op = 'INSERT' then v_new := new.occurred_on; v_hit := true;
    else
      v_old := old.occurred_on; v_new := new.occurred_on;
      v_hit := (old.amount, old.status, old.occurred_on, old.project_id, old.department_id) is distinct from (new.amount, new.status, new.occurred_on, new.project_id, new.department_id);
    end if;
  else
    if tg_op = 'INSERT' then v_new := new.occurred_on; v_hit := true;
    else
      v_old := old.occurred_on; v_new := new.occurred_on;
      v_hit := (old.amount, old.approval, old.occurred_on, old.deleted_at, old.project_id, old.department_id) is distinct from (new.amount, new.approval, new.occurred_on, new.deleted_at, new.project_id, new.department_id);
    end if;
  end if;
  if v_hit and (app.period_closed(v_new) or app.period_closed(v_old)) then
    raise exception 'Kỳ tài chính đã chốt — mở lại kỳ (kèm lý do) trước khi thêm / sửa / hủy / duyệt giao dịch trong kỳ' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger incomes_period_lock before insert or update on public.incomes for each row execute function app.trg_finance_period_lock();
create trigger expenses_period_lock before insert or update on public.expenses for each row execute function app.trg_finance_period_lock();

-- Tổng thu / chi thực tế của một kỳ theo giao dịch chi tiết (nguồn sự thật).
create or replace function app.period_totals(p_year int, p_month int, out income numeric, out expense numeric) returns record
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(amount) from public.incomes where org_id = app.current_org_id() and status = 'confirmed'
                   and extract(year from occurred_on) = p_year and extract(month from occurred_on) = p_month), 0),
         coalesce((select sum(amount) from public.expenses where org_id = app.current_org_id() and deleted_at is null and approval = 'approved'
                   and extract(year from occurred_on) = p_year and extract(month from occurred_on) = p_month), 0)
$$;

create or replace function public.save_finance_period_note(p_year int, p_month int, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền ghi chú kỳ tài chính' using errcode = '42501'; end if;
  if p_month not between 1 and 12 then raise exception 'Tháng không hợp lệ' using errcode = '22023'; end if;
  insert into public.finance_periods (org_id, year, month, note) values (app.current_org_id(), p_year, p_month, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (org_id, year, month) do update set note = excluded.note;
end $$;

-- Chốt kỳ: người có quyền DUYỆT tài chính (tách khỏi người ghi nhận). Lưu tổng tại thời điểm chốt để đối chiếu về sau.
create or replace function public.close_finance_period(p_year int, p_month int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); t record; v_bad int;
begin
  if not app.has_permission('finance.approve') then raise exception 'Chỉ người duyệt tài chính được chốt kỳ' using errcode = '42501'; end if;
  if p_month not between 1 and 12 then raise exception 'Tháng không hợp lệ' using errcode = '22023'; end if;
  if make_date(p_year, p_month, 1) > date_trunc('month', app.today())::date then raise exception 'Chưa chốt được kỳ trong tương lai' using errcode = '22023'; end if;
  select count(*) into v_bad from public.expenses where org_id = v_org and deleted_at is null and approval = 'submitted'
    and extract(year from occurred_on) = p_year and extract(month from occurred_on) = p_month;
  if v_bad > 0 then raise exception 'Còn % khoản chi đang chờ duyệt trong kỳ — duyệt hoặc từ chối trước khi chốt', v_bad using errcode = '22023'; end if;
  select * into t from app.period_totals(p_year, p_month);
  insert into public.finance_periods (org_id, year, month, closed_at, closed_by, closed_income, closed_expense) values (v_org, p_year, p_month, now(), auth.uid(), t.income, t.expense)
  on conflict (org_id, year, month) do update set closed_at = now(), closed_by = auth.uid(), closed_income = t.income, closed_expense = t.expense, reopened_at = null, reopen_reason = null;
  perform app.write_audit(v_org, 'finance.period_close', 'finance_period', null, jsonb_build_object('year', p_year, 'month', p_month, 'income', t.income, 'expense', t.expense));
end $$;

create or replace function public.reopen_finance_period(p_year int, p_month int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_permission('finance.approve') then raise exception 'Chỉ người duyệt tài chính được mở lại kỳ' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cần nhập lý do mở lại kỳ' using errcode = '22023'; end if;
  update public.finance_periods set closed_at = null, closed_by = null, reopened_at = now(), reopen_reason = trim(p_reason)
  where org_id = app.current_org_id() and year = p_year and month = p_month and closed_at is not null;
  if not found then raise exception 'Kỳ chưa được chốt' using errcode = '22023'; end if;
  perform app.write_audit(app.current_org_id(), 'finance.period_reopen', 'finance_period', null, jsonb_build_object('year', p_year, 'month', p_month, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------
-- GHI NHẬN THU THEO MỐC — một luồng duy nhất
-- ---------------------------------------------------------------------
-- Trong MỘT giao dịch: khóa dòng mốc → (nếu đã thu: trả về khoản thu đã có) → kiểm tra → tạo khoản thu liên kết → đóng mốc → thông báo.
-- Hai lần bấm / gửi lại / hai người cùng xác nhận chỉ tạo đúng một khoản thu (dòng mốc bị khóa + milestone_id duy nhất).
-- Mốc ↔ khoản thu là 1–1: chỉ thu TRỌN mốc. Thu từng phần cần bảng phân bổ riêng (xem docs) — hàm từ chối số tiền khác số tiền mốc.
create or replace function public.record_milestone_receipt(
  p_milestone uuid, p_amount numeric default null, p_received_on date default null, p_source uuid default null, p_method text default null,
  p_owner uuid default null, p_department uuid default null, p_note text default null, p_invoice_no text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); m public.project_milestones%rowtype; pr public.projects%rowtype; v_inc uuid; v_src uuid := p_source; v_date date := coalesce(p_received_on, app.today());
  v_existing public.incomes%rowtype; v_owner uuid := coalesce(p_owner, auth.uid());
begin
  if v_org is null or not app.has_permission('finance.manage') then raise exception 'Chỉ kế toán (quyền quản lý tài chính) được ghi nhận tiền đã thu' using errcode = '42501'; end if;
  select * into m from public.project_milestones where id = p_milestone and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy mốc thanh toán' using errcode = 'P0002'; end if;
  select * into v_existing from public.incomes where milestone_id = m.id and status = 'confirmed';
  if found then
    return jsonb_build_object('income_id', v_existing.id, 'already', true, 'amount', v_existing.amount, 'received_on', v_existing.occurred_on);
  end if;
  if m.amount <= 0 then raise exception 'Mốc không có số tiền để thu' using errcode = '22023'; end if;
  if p_amount is not null and p_amount <> m.amount then
    raise exception 'Số tiền ghi nhận (%) khác số tiền mốc (%). Một mốc chỉ ghi nhận thu trọn; thu từng phần chưa được hỗ trợ — tách mốc thành các đợt nhỏ hơn', p_amount, m.amount using errcode = '22023';
  end if;
  if v_date > app.today() then raise exception 'Ngày thực thu không được ở tương lai' using errcode = '22023'; end if;
  if p_source is not null and not exists (select 1 from public.income_sources where id = p_source and org_id = v_org and is_active) then raise exception 'Không tìm thấy nguồn thu' using errcode = 'P0002'; end if;
  if p_department is not null and not exists (select 1 from public.departments where id = p_department and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and org_id = v_org and is_active) then raise exception 'Không tìm thấy người phụ trách' using errcode = 'P0002'; end if;
  select * into pr from public.projects where id = m.project_id;
  if v_src is null then select id into v_src from public.income_sources where org_id = v_org and name = 'Sản xuất video theo đơn hàng' limit 1; end if;
  -- kỳ đã chốt bị trigger chặn với thông báo rõ ràng
  insert into public.incomes (org_id, occurred_on, project_id, source_id, milestone_id, amount, description, invoice_no, payment_method, department_id, owner_id, created_by)
  values (v_org, v_date, m.project_id, v_src, m.id, m.amount, coalesce(nullif(trim(coalesce(p_note, '')), ''), pr.code || ' – ' || m.name),
          coalesce(nullif(trim(coalesce(p_invoice_no, '')), ''), m.invoice_no), nullif(trim(coalesce(p_method, '')), ''), p_department, v_owner, auth.uid())
  returning id into v_inc;
  update public.project_milestones set payment = 'paid', paid_at = (v_date::timestamp at time zone coalesce((select o.timezone from public.organizations o where o.id = v_org), 'Asia/Ho_Chi_Minh')), invoice_no = coalesce(nullif(trim(coalesce(p_invoice_no, '')), ''), invoice_no) where id = m.id;
  perform app.write_audit(v_org, 'milestone.paid', 'milestone', m.id, jsonb_build_object('project', pr.code, 'amount', m.amount, 'income', v_inc, 'received_on', v_date, 'due', m.due_date));
  perform app.notify_link(v_org, pr.manager_id, 'paid', 'Đã thu mốc "' || m.name || '" của ' || pr.code, '/du-an/' || pr.id::text || '?tab=thanh-toan');
  return jsonb_build_object('income_id', v_inc, 'already', false, 'amount', m.amount, 'received_on', v_date);
end $$;

-- Tên cũ giữ nguyên hợp đồng (uuid khoản thu) nhưng dùng chung luồng trên
create or replace function public.milestone_pay(p_id uuid, p_paid_on date default null, p_method text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return (public.record_milestone_receipt(p_id, null, p_paid_on, null, p_method) ->> 'income_id')::uuid;
end $$;

-- Hủy khoản thu (điều chỉnh sai sót): giữ vết liên kết mốc thay vì xóa; mốc về "đã xuất hóa đơn" để thu lại được
create or replace function public.cancel_income(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.incomes%rowtype;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền hủy khoản thu' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cần nhập lý do hủy' using errcode = '22023'; end if;
  select * into i from public.incomes where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy khoản thu' using errcode = 'P0002'; end if;
  if i.status = 'cancelled' then return; end if;
  update public.incomes set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_milestone_id = milestone_id, milestone_id = null where id = i.id;
  if i.milestone_id is not null then
    update public.project_milestones set payment = 'invoiced', paid_at = null where id = i.milestone_id;
  end if;
  perform app.write_audit(i.org_id, 'income.cancel', 'income', i.id, jsonb_build_object('amount', i.amount, 'reason', p_reason, 'milestone', i.milestone_id, 'occurred_on', i.occurred_on));
end $$;

-- Khoản thu khác (không theo mốc): thêm phòng ban / người phụ trách (thay chữ ký cũ để tránh trùng tên hàm)
drop function public.record_income(date, numeric, uuid, uuid, uuid, text, text, text);
create or replace function public.record_income(
  p_occurred_on date, p_amount numeric, p_source_id uuid default null, p_project_id uuid default null,
  p_channel_id uuid default null, p_description text default null, p_invoice_no text default null, p_method text default null,
  p_department_id uuid default null, p_owner_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền ghi nhận khoản thu' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = '22023'; end if;
  if p_occurred_on is null then raise exception 'Nhập ngày thu' using errcode = '22023'; end if;
  if p_occurred_on > app.today() then raise exception 'Ngày thu không được ở tương lai' using errcode = '22023'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and org_id = v_org and deleted_at is null) then
    raise exception 'Không tìm thấy dự án' using errcode = 'P0002';
  end if;
  insert into public.incomes (org_id, occurred_on, project_id, channel_id, source_id, amount, description, invoice_no, payment_method, department_id, owner_id, created_by)
  values (v_org, p_occurred_on, p_project_id, p_channel_id, p_source_id, p_amount, nullif(trim(coalesce(p_description, '')), ''),
          nullif(trim(coalesce(p_invoice_no, '')), ''), nullif(trim(coalesce(p_method, '')), ''), p_department_id, coalesce(p_owner_id, auth.uid()), auth.uid())
  returning id into v_id;
  perform app.write_audit(v_org, 'income.create', 'income', v_id, jsonb_build_object('amount', p_amount, 'project', p_project_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Dữ liệu tổng hợp: chạy ở CSDL, security invoker → RLS của người xem quyết định thấy gì; tổng tính trên toàn bộ tập lọc
-- ---------------------------------------------------------------------
-- Tên khách hàng hiển thị theo QUYỀN XEM DỰ ÁN (không đòi quyền CRM); chỉ gọi trên dự án đã qua RLS.
create or replace function app.account_name(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.name from public.accounts a where a.id = p_account and a.org_id = app.current_org_id() and a.deleted_at is null
    and exists (select 1 from public.projects p where p.customer_id = a.id and p.deleted_at is null and app.can_view_project(p.id))
$$;

-- Một dòng / dự án, kèm số liệu tiền (chỉ khi người xem được xem tiền của dự án đó).
create or replace function public.project_rows() returns table (
  id uuid, code text, name text, kind public.project_kind, stage public.project_stage, customer_id uuid, customer_name text,
  start_date date, end_date date, progress int, risk_level public.risk_level, risk_note text, payment_terms text, created_at timestamptz,
  manager_ids uuid[], manager_names text[], member_count int, is_manager boolean, is_member boolean,
  money_ok boolean, contract_value numeric, budget_cost numeric, revenue numeric, cost numeric,
  open_receivable numeric, overdue_count int, overdue_amount numeric, max_overdue_days int, due7_count int,
  next_due date, next_name text, next_amount numeric, late boolean, over_budget boolean, effective_risk text, risk_flags text[]
) language sql stable security invoker set search_path = '' as $$
  with t as (select app.today() d)
  select p.id, p.code, p.name, p.kind, p.stage, p.customer_id, app.account_name(p.customer_id), p.start_date, p.end_date, p.progress, p.risk_level, p.risk_note, p.payment_terms, p.created_at,
    mg.ids, mg.names, (select count(distinct x.u)::int from (select user_id u from public.project_members where project_id = p.id union select user_id from public.project_managers where project_id = p.id) x),
    (auth.uid() = any (mg.ids)) or p.manager_id = auth.uid(),
    exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid()),
    mo.ok,
    case when mo.ok then b.contract_value end, case when mo.ok then b.budget_cost end,
    case when mo.ok then coalesce((select sum(i.amount) from public.incomes i where i.project_id = p.id and i.status = 'confirmed'), 0) end,
    case when mo.ok then coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved'), 0) end,
    case when mo.ok then coalesce(ms.open_amt, 0) end, case when mo.ok then coalesce(ms.over_n, 0) end, case when mo.ok then coalesce(ms.over_amt, 0) end, case when mo.ok then ms.max_days end, case when mo.ok then coalesce(ms.due7_n, 0) end,
    case when mo.ok then nx.due_date end, case when mo.ok then nx.name end, case when mo.ok then nx.amount end,
    (p.end_date is not null and p.end_date < (select d from t) and p.stage not in ('completed', 'cancelled')) late,
    (mo.ok and coalesce(b.budget_cost, 0) > 0 and coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved'), 0) > b.budget_cost) over_budget,
    (case when p.stage in ('completed', 'cancelled') then 'low'
          when p.risk_level = 'high' or (mo.ok and coalesce(ms.max_days, 0) > 30)
               or (mo.ok and coalesce(b.budget_cost, 0) > 0 and coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved'), 0) > b.budget_cost) then 'high'
          when p.risk_level = 'medium' or coalesce(ms.over_n, 0) > 0 or (p.end_date is not null and p.end_date < (select d from t)) then 'medium' else 'low' end),
    array_remove(array[
      case when p.risk_level = 'high' then 'manual_high' end,
      case when p.risk_level = 'medium' then 'manual_medium' end,
      case when mo.ok and coalesce(ms.max_days, 0) > 30 then 'overdue_30' end,
      case when mo.ok and coalesce(ms.over_n, 0) > 0 then 'overdue' end,
      case when mo.ok and coalesce(b.budget_cost, 0) > 0 and coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved'), 0) > b.budget_cost then 'over_budget' end,
      case when p.end_date is not null and p.end_date < (select d from t) and p.stage not in ('completed', 'cancelled') then 'late' end], null)
  from public.projects p
  left join public.project_budgets b on b.project_id = p.id
  cross join lateral (select app.can_see_money(p.id) ok) mo
  cross join lateral (select coalesce(array_agg(pm.user_id order by pr.full_name), '{}') ids, coalesce(array_agg(pr.full_name order by pr.full_name), '{}') names
                      from public.project_managers pm join public.profiles pr on pr.id = pm.user_id where pm.project_id = p.id) mg
  left join lateral (select sum(m.amount) filter (where m.payment <> 'paid') open_amt,
                            (count(*) filter (where m.payment <> 'paid' and m.due_date < (select d from t)))::int over_n,
                            sum(m.amount) filter (where m.payment <> 'paid' and m.due_date < (select d from t)) over_amt,
                            max(((select d from t) - m.due_date)) filter (where m.payment <> 'paid' and m.due_date < (select d from t))::int max_days,
                            (count(*) filter (where m.payment <> 'paid' and m.due_date between (select d from t) and (select d from t) + 7))::int due7_n
                     from public.project_milestones m where m.project_id = p.id) ms on true
  left join lateral (select m.due_date, m.name, m.amount from public.project_milestones m where m.project_id = p.id and m.payment <> 'paid'
                     order by m.due_date nulls last, m.sort_order limit 1) nx on true
  where p.deleted_at is null
$$;


-- Danh sách dự án: lọc / sắp xếp / phân trang ở CSDL; tổng và số đếm tính trên TOÀN BỘ tập lọc trước khi phân trang.
-- Chế độ xem nhanh: mine = tôi quản lý · member = tôi tham gia · risk = rủi ro cao · due7 = HẠN DỰ ÁN (end_date) trong 7 ngày
-- · overdue_pay = có mốc thu QUÁ HẠN (due_date của mốc < hôm nay, chưa thu) · pay7 = HẠN THU của mốc trong 7 ngày.
create or replace function public.project_list(p_q text default null, p_stage text default null, p_view text default null, p_customer uuid default null,
  p_sort text default 'name', p_dir text default 'asc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_today date := app.today(); v_order text; v_cond text; v_res jsonb; v_counts jsonb; v_stages jsonb; v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_like text; v_lim int := least(greatest(coalesce(p_limit, 20), 1), 500); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  v_order := (case p_sort when 'code' then 'r.code' when 'progress' then 'r.progress' when 'stage' then 'r.stage::text' when 'end' then 'r.end_date'
    when 'risk' then $o$(case r.effective_risk when 'high' then 3 when 'medium' then 2 else 1 end)$o$ when 'next' then 'r.next_due'
    when 'customer' then 'r.customer_name' else 'r.name' end)
    || case when lower(coalesce(p_dir, 'asc')) = 'desc' then ' desc nulls last' else ' asc nulls last' end || ', r.name, r.id';
  v_like := case when v_q is null then null else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_cond := case p_view
    when 'mine' then 'x.is_manager'
    when 'member' then 'x.is_member'
    when 'risk' then $c$x.effective_risk = 'high'$c$
    when 'due7' then format($c$(x.end_date between %L::date and %L::date and x.stage::text not in ('completed', 'cancelled'))$c$, v_today, v_today + 7)
    when 'overdue_pay' then 'coalesce(x.overdue_count, 0) > 0'
    when 'pay7' then 'coalesce(x.due7_count, 0) > 0'
    else 'true' end;
  execute format($f$
    with r as (select x.* from public.project_rows() x
      where ($1::text is null or x.name ilike $1 or x.code ilike $1 or coalesce(x.customer_name, '') ilike $1)
        and ($2::text is null or x.stage::text = $2) and ($3::uuid is null or x.customer_id = $3) and (%s))
    select jsonb_build_object('total', (select count(*) from r),
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from r order by %s limit $4 offset $5) t), '[]'::jsonb))$f$, v_cond, v_order)
    into v_res using v_like, nullif(p_stage, ''), p_customer, v_lim, v_off;
  select jsonb_build_object('all', count(*), 'mine', count(*) filter (where x.is_manager), 'member', count(*) filter (where x.is_member),
    'risk', count(*) filter (where x.effective_risk = 'high'),
    'due7', count(*) filter (where x.end_date between v_today and v_today + 7 and x.stage::text not in ('completed', 'cancelled')),
    'overdue_pay', count(*) filter (where coalesce(x.overdue_count, 0) > 0),
    'pay7', count(*) filter (where coalesce(x.due7_count, 0) > 0))
  into v_counts from public.project_rows() x;
  select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) into v_stages from (select stage::text st, count(*) n from public.project_rows() group by 1) q;
  return v_res || jsonb_build_object('counts', v_counts, 'stages', v_stages);
end $$;

-- Tổng hợp tiền của MỘT dự án (null nếu người xem không được xem tiền). Không nhân đôi: mỗi nguồn tính trong CTE riêng.
create or replace function public.project_money(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when not app.can_see_money(p_id) then null else (
    with b as (select contract_value, budget_cost from public.project_budgets where project_id = p_id),
    i as (select coalesce(sum(amount), 0) v, count(*)::int n from public.incomes where project_id = p_id and status = 'confirmed'),
    e as (select coalesce(sum(amount) filter (where approval = 'approved'), 0) ok, coalesce(sum(amount) filter (where approval = 'submitted'), 0) pending
          from public.expenses where project_id = p_id and deleted_at is null),
    m as (select coalesce(sum(amount), 0) tot, coalesce(sum(amount) filter (where payment = 'paid'), 0) paid, coalesce(sum(amount) filter (where payment <> 'paid'), 0) open_amt,
                 count(*)::int n, (count(*) filter (where payment <> 'paid' and due_date < app.today()))::int over_n,
                 coalesce(sum(amount) filter (where payment <> 'paid' and due_date < app.today()), 0) over_amt
          from public.project_milestones where project_id = p_id),
    cs as (select coalesce(jsonb_agg(jsonb_build_object('category', coalesce(c.name, 'Chưa phân loại'), 'amount', q.amt) order by q.amt desc), '[]'::jsonb) v
           from (select category_id, sum(amount) amt from public.expenses where project_id = p_id and deleted_at is null and approval = 'approved' group by 1) q
           left join public.expense_categories c on c.id = q.category_id)
    select jsonb_build_object(
      'contract_value', (select contract_value from b), 'budget_cost', (select budget_cost from b),
      'income', i.v, 'income_count', i.n, 'expense', e.ok, 'expense_pending', e.pending, 'diff', i.v - e.ok,
      'schedule_total', m.tot, 'schedule_paid', m.paid, 'schedule_open', m.open_amt, 'milestone_count', m.n,
      'overdue_count', m.over_n, 'overdue_amount', m.over_amt,
      'unallocated', case when coalesce((select contract_value from b), 0) > 0 then (select contract_value from b) - m.tot end,
      'budget_remaining', case when coalesce((select budget_cost from b), 0) > 0 then (select budget_cost from b) - e.ok end,
      'cost_structure', cs.v)
    from i, e, m, cs) end
$$;

-- Lịch sử thay đổi của dự án + mốc (ai sửa tiến độ / ngân sách / mốc) — chỉ người quản lý dự án đọc được
create or replace function public.project_history(p_id uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_manage_project(p_id) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', q.created_at, 'action', q.action, 'by', q.actor, 'details', q.details) order by q.created_at desc)
    from (select a.created_at, a.action, pr.full_name actor, a.details from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id
          where a.org_id = app.current_org_id() and (
            (a.entity_type = 'project' and a.entity_id = p_id)
            or (a.entity_type = 'milestone' and a.entity_id in (select id from public.project_milestones where project_id = p_id)))
          order by a.created_at desc limit least(coalesce(p_limit, 50), 200)) q), '[]'::jsonb);
end $$;

-- Danh sách khoản thu: tổng tính trên cả tập lọc (RLS của người xem), mỗi dòng đếm chứng từ bằng truy vấn riêng nên không nhân đôi.
create or replace function public.income_list(p_from date default null, p_to date default null, p_source uuid default null, p_customer uuid default null,
  p_project uuid default null, p_dept uuid default null, p_owner uuid default null, p_method text default null, p_voucher text default null,
  p_kind text default null, p_status text default 'confirmed', p_sort text default 'date', p_dir text default 'desc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_order text; v_res jsonb; v_lim int := least(greatest(coalesce(p_limit, 20), 1), 100000); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  v_order := (case p_sort when 'amount' then 'r.amount' when 'project' then 'r.project_code' else 'r.occurred_on' end)
    || case when lower(coalesce(p_dir, 'desc')) = 'asc' then ' asc nulls last' else ' desc nulls last' end || ', r.created_at desc, r.id';
  execute format($f$
    with r as (
      select i.id, i.occurred_on, i.amount, i.status, i.description, i.invoice_no, i.payment_method, i.created_at, i.cancel_reason,
        i.project_id, p.code project_code, p.name project_name, p.customer_id, app.account_name(p.customer_id) customer_name,
        i.source_id, s.name source_name, coalesce(i.milestone_id, i.cancelled_milestone_id) milestone_id, i.milestone_id is not null is_milestone, ms.name milestone_name,
        i.department_id, d.name department_name, i.owner_id, o.full_name owner_name, fc.n file_count
      from public.incomes i
      left join public.projects p on p.id = i.project_id
      left join public.income_sources s on s.id = i.source_id
      left join public.project_milestones ms on ms.id = coalesce(i.milestone_id, i.cancelled_milestone_id)
      left join public.departments d on d.id = i.department_id
      left join public.profiles o on o.id = i.owner_id
      cross join lateral (select count(*)::int n from public.finance_files f where f.kind = 'income' and f.ref_id = i.id) fc
      where ($1::date is null or i.occurred_on >= $1) and ($2::date is null or i.occurred_on <= $2)
        and ($3::uuid is null or i.source_id = $3) and ($4::uuid is null or p.customer_id = $4) and ($5::uuid is null or i.project_id = $5)
        and ($6::uuid is null or i.department_id = $6) and ($7::uuid is null or i.owner_id = $7)
        and ($8::text is null or i.payment_method = $8)
        and ($9::text is null or ($9 = 'missing' and fc.n = 0) or ($9 = 'has' and fc.n > 0))
        and ($10::text is null or ($10 = 'milestone' and coalesce(i.milestone_id, i.cancelled_milestone_id) is not null) or ($10 = 'other' and coalesce(i.milestone_id, i.cancelled_milestone_id) is null))
        and ($11::text = 'all' or i.status = $11))
    select jsonb_build_object('total', (select count(*) from r), 'sum', coalesce((select sum(amount) from r where status = 'confirmed'), 0),
      'sum_milestone', coalesce((select sum(amount) from r where status = 'confirmed' and is_milestone), 0),
      'sum_other', coalesce((select sum(amount) from r where status = 'confirmed' and not is_milestone), 0),
      'missing_voucher', (select count(*) from r where status = 'confirmed' and file_count = 0),
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from r order by %s limit $12 offset $13) t), '[]'::jsonb))$f$, v_order)
    into v_res using p_from, p_to, p_source, p_customer, p_project, p_dept, p_owner, nullif(p_method, ''), nullif(p_voucher, ''), nullif(p_kind, ''), coalesce(nullif(p_status, ''), 'confirmed'), v_lim, v_off;
  return v_res;
end $$;

-- Danh sách khoản chi. "Đã ghi nhận" = đã duyệt; chờ duyệt tách riêng; chi chung = không gắn dự án.
create or replace function public.expense_list(p_from date default null, p_to date default null, p_category uuid default null, p_project uuid default null,
  p_general boolean default false, p_dept uuid default null, p_owner uuid default null, p_method text default null, p_voucher text default null,
  p_approval text default null, p_sort text default 'date', p_dir text default 'desc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_order text; v_res jsonb; v_lim int := least(greatest(coalesce(p_limit, 20), 1), 100000); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  v_order := (case p_sort when 'amount' then 'r.amount' when 'project' then 'r.project_code' else 'r.occurred_on' end)
    || case when lower(coalesce(p_dir, 'desc')) = 'asc' then ' asc nulls last' else ' desc nulls last' end || ', r.created_at desc, r.id';
  execute format($f$
    with r as (
      select e.id, e.occurred_on, e.amount, e.approval::text approval, e.payment::text payment, e.description, e.invoice_url, e.payment_method, e.created_at, e.due_date, e.payee_name,
        e.project_id, p.code project_code, p.name project_name, e.category_id, c.name category_name, e.department_id, d.name department_name,
        e.requested_by owner_id, o.full_name owner_name, fc.n file_count, (fc.n > 0 or nullif(trim(coalesce(e.invoice_url, '')), '') is not null) has_voucher
      from public.expenses e
      left join public.projects p on p.id = e.project_id
      left join public.expense_categories c on c.id = e.category_id
      left join public.departments d on d.id = e.department_id
      left join public.profiles o on o.id = e.requested_by
      cross join lateral (select count(*)::int n from public.finance_files f where f.kind = 'expense' and f.ref_id = e.id) fc
      where e.deleted_at is null
        and ($1::date is null or e.occurred_on >= $1) and ($2::date is null or e.occurred_on <= $2)
        and ($3::uuid is null or e.category_id = $3) and ($4::uuid is null or e.project_id = $4) and (not $5::boolean or e.project_id is null)
        and ($6::uuid is null or e.department_id = $6) and ($7::uuid is null or e.requested_by = $7) and ($8::text is null or e.payment_method = $8)
        and ($9::text is null or ($9 = 'missing' and not (fc.n > 0 or nullif(trim(coalesce(e.invoice_url, '')), '') is not null))
                              or ($9 = 'has' and (fc.n > 0 or nullif(trim(coalesce(e.invoice_url, '')), '') is not null)))
        and ($10::text is null or e.approval::text = $10))
    select jsonb_build_object('total', (select count(*) from r), 'sum', coalesce((select sum(amount) from r where approval = 'approved'), 0),
      'sum_pending', coalesce((select sum(amount) from r where approval = 'submitted'), 0),
      'missing_voucher', (select count(*) from r where approval = 'approved' and not has_voucher),
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from r order by %s limit $11 offset $12) t), '[]'::jsonb))$f$, v_order)
    into v_res using p_from, p_to, p_category, p_project, coalesce(p_general, false), p_dept, p_owner, nullif(p_method, ''), nullif(p_voucher, ''), nullif(p_approval, ''), v_lim, v_off;
  return v_res;
end $$;

-- Gán phòng ban / người phụ trách cho giao dịch (phòng ban của CHÍNH giao dịch, không theo phòng ban hiện tại của nhân viên)
create or replace function public.set_transaction_scope(p_kind text, p_id uuid, p_department uuid, p_owner uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền sửa phòng ban / người phụ trách giao dịch' using errcode = '42501'; end if;
  if p_department is not null and not exists (select 1 from public.departments where id = p_department and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and org_id = v_org and is_active) then raise exception 'Không tìm thấy người phụ trách' using errcode = 'P0002'; end if;
  if p_kind = 'income' then
    update public.incomes set department_id = p_department, owner_id = coalesce(p_owner, owner_id) where id = p_id and org_id = v_org;
  elsif p_kind = 'expense' then
    update public.expenses set department_id = p_department where id = p_id and org_id = v_org and deleted_at is null;
  else raise exception 'Loại giao dịch không hợp lệ' using errcode = '22023'; end if;
  if not found then raise exception 'Không tìm thấy giao dịch' using errcode = 'P0002'; end if;
  perform app.write_audit(v_org, 'finance.scope', p_kind, p_id, jsonb_build_object('department', p_department, 'owner', p_owner));
end $$;

-- ---------------------------------------------------------------------
-- Phải thu theo mốc (theo tuổi nợ). Chỉ mốc CHƯA thu của dự án chưa hủy; số ngày tính theo ngày của tổ chức.
-- ---------------------------------------------------------------------
create or replace function public.receivables(p_group text default 'customer', p_customer uuid default null, p_project uuid default null, p_bucket text default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_today date := app.today(); v_res jsonb;
begin
  if not (app.has_permission('finance.view') or app.has_permission('projects.view_all') or exists (select 1 from public.project_managers where user_id = auth.uid())) then
    raise exception 'Bạn không có quyền xem công nợ phải thu' using errcode = '42501';
  end if;
  with r as (
    select m.id milestone_id, m.name milestone, m.amount, m.due_date, m.payment, m.acceptance, m.invoice_no, p.id project_id, p.code project_code, p.name project_name,
      p.customer_id, coalesce(app.account_name(p.customer_id), 'Chưa gán khách hàng') customer_name,
      (v_today - m.due_date) days_late,
      case when m.due_date is null then 'no_date' when m.due_date > v_today then 'not_due' when m.due_date = v_today then 'today'
           when v_today - m.due_date <= 30 then 'd1_30' when v_today - m.due_date <= 60 then 'd31_60' when v_today - m.due_date <= 90 then 'd61_90' else 'd90p' end bucket,
      (select coalesce(string_agg(pr.full_name, ', ' order by pr.full_name), '') from public.project_managers pm join public.profiles pr on pr.id = pm.user_id where pm.project_id = p.id) managers,
      case when m.acceptance = 'pending' then 'Chờ nghiệm thu' when m.payment = 'unpaid' then 'Xuất hóa đơn / đề nghị thanh toán' else 'Đòi tiền và ghi nhận thu' end next_action
    from public.project_milestones m join public.projects p on p.id = m.project_id
    where m.payment <> 'paid' and m.amount > 0 and p.deleted_at is null and p.stage <> 'cancelled'
      and (p_customer is null or p.customer_id = p_customer) and (p_project is null or p.id = p_project)),
  f as (select * from r where p_bucket is null or p_bucket = '' or bucket = p_bucket),
  g as (select case when p_group = 'project' then project_id::text else coalesce(customer_id::text, 'none') end gkey,
               case when p_group = 'project' then project_code || ' – ' || project_name else customer_name end gname,
               sum(amount) total, count(*) n, max(coalesce(days_late, 0)) max_late,
               jsonb_agg(to_jsonb(f) order by f.due_date nulls last, f.milestone_id) items
        from f group by 1, 2)
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from f), 0), 'count', (select count(*) from f),
    'buckets', (select coalesce(jsonb_object_agg(bucket, jsonb_build_object('amount', a, 'count', n)), '{}'::jsonb) from (select bucket, sum(amount) a, count(*) n from r group by 1) q),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('key', gkey, 'name', gname, 'total', total, 'count', n, 'max_late', max_late, 'items', items) order by max_late desc, total desc, gname) from g), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- Tổng quan, báo cáo, kỳ tài chính, đối chiếu
-- ---------------------------------------------------------------------
create or replace function public.finance_overview(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_today date := app.today(); v_from date := coalesce(p_from, date_trunc('year', app.today())::date); v_to date := coalesce(p_to, app.today()); v_res jsonb;
begin
  if not app.has_permission('finance.view') then raise exception 'Bạn không có quyền xem tổng quan thu chi' using errcode = '42501'; end if;
  if v_to < v_from then raise exception 'Khoảng thời gian không hợp lệ' using errcode = '22023'; end if;
  if (extract(year from v_to) * 12 + extract(month from v_to)) - (extract(year from v_from) * 12 + extract(month from v_from)) > 35 then raise exception 'Tối đa 36 tháng' using errcode = '22023'; end if;
  with om as (select m.amount, m.due_date from public.project_milestones m join public.projects p on p.id = m.project_id
              where m.payment <> 'paid' and m.amount > 0 and p.deleted_at is null and p.stage <> 'cancelled'),
  inc as (select occurred_on, amount from public.incomes where status = 'confirmed' and occurred_on between v_from and v_to),
  exp as (select occurred_on, amount from public.expenses where deleted_at is null and approval = 'approved' and occurred_on between v_from and v_to),
  months as (select generate_series(date_trunc('month', v_from)::date, date_trunc('month', v_to)::date, interval '1 month')::date mth)
  select jsonb_build_object('from', v_from, 'to', v_to,
    'income', coalesce((select sum(amount) from inc), 0), 'income_count', (select count(*) from inc),
    'expense', coalesce((select sum(amount) from exp), 0), 'expense_count', (select count(*) from exp),
    'diff', coalesce((select sum(amount) from inc), 0) - coalesce((select sum(amount) from exp), 0),
    'open_total', coalesce((select sum(amount) from om), 0), 'open_count', (select count(*) from om),
    'overdue_total', coalesce((select sum(amount) from om where due_date < v_today), 0), 'overdue_count', (select count(*) from om where due_date < v_today),
    'due7_total', coalesce((select sum(amount) from om where due_date between v_today and v_today + 7), 0), 'due7_count', (select count(*) from om where due_date between v_today and v_today + 7),
    'expected_in_range', coalesce((select sum(amount) from om where due_date between v_from and v_to), 0),
    'pending_expense_count', (select count(*) from public.expenses where deleted_at is null and approval = 'submitted'),
    'missing_income_voucher', (select count(*) from public.incomes i where i.status = 'confirmed' and i.occurred_on between v_from and v_to and not exists (select 1 from public.finance_files f where f.kind = 'income' and f.ref_id = i.id)),
    'missing_expense_voucher', (select count(*) from public.expenses e where e.deleted_at is null and e.approval = 'approved' and e.occurred_on between v_from and v_to
        and nullif(trim(coalesce(e.invoice_url, '')), '') is null and not exists (select 1 from public.finance_files f where f.kind = 'expense' and f.ref_id = e.id)),
    'series', (select jsonb_agg(jsonb_build_object('month', to_char(mth, 'YYYY-MM'),
        'income', coalesce((select sum(amount) from inc where date_trunc('month', occurred_on) = mth), 0),
        'expense', coalesce((select sum(amount) from exp where date_trunc('month', occurred_on) = mth), 0),
        'expected', coalesce((select sum(amount) from om where date_trunc('month', due_date) = mth), 0)) order by mth) from months))
  into v_res;
  return v_res;
end $$;

-- Báo cáo theo chiều: project | customer | month | department | source | category. "Thực tế" từ giao dịch đã ghi; "Dự kiến" từ mốc chưa thu theo due_date — tách riêng.
create or replace function public.finance_report(p_dim text, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_from date := coalesce(p_from, date_trunc('year', app.today())::date); v_to date := coalesce(p_to, app.today()); v_res jsonb;
begin
  if not app.has_permission('finance.view') then raise exception 'Bạn không có quyền xem báo cáo thu chi' using errcode = '42501'; end if;
  if p_dim not in ('project', 'customer', 'month', 'department', 'source', 'category') then raise exception 'Chiều báo cáo không hợp lệ' using errcode = '22023'; end if;
  with inc as (
    select i.amount, 0::numeric exp_amt, 0::numeric exp_pending,
      case p_dim when 'project' then i.project_id::text when 'customer' then p.customer_id::text when 'month' then to_char(i.occurred_on, 'YYYY-MM')
                 when 'department' then i.department_id::text when 'source' then i.source_id::text end k,
      case p_dim when 'project' then p.code || ' – ' || p.name when 'customer' then app.account_name(p.customer_id) when 'month' then to_char(i.occurred_on, 'YYYY-MM')
                 when 'department' then d.name when 'source' then s.name end l
    from public.incomes i left join public.projects p on p.id = i.project_id left join public.departments d on d.id = i.department_id left join public.income_sources s on s.id = i.source_id
    where i.status = 'confirmed' and i.occurred_on between v_from and v_to),
  ex as (
    select 0::numeric amount, e.amount exp_amt, 0::numeric exp_pending,
      case p_dim when 'project' then e.project_id::text when 'customer' then p.customer_id::text when 'month' then to_char(e.occurred_on, 'YYYY-MM')
                 when 'department' then e.department_id::text when 'category' then e.category_id::text end k,
      case p_dim when 'project' then p.code || ' – ' || p.name when 'customer' then app.account_name(p.customer_id) when 'month' then to_char(e.occurred_on, 'YYYY-MM')
                 when 'department' then d.name when 'category' then c.name end l
    from public.expenses e left join public.projects p on p.id = e.project_id left join public.departments d on d.id = e.department_id left join public.expense_categories c on c.id = e.category_id
    where e.deleted_at is null and e.approval = 'approved' and e.occurred_on between v_from and v_to),
  ms as (
    select 0::numeric amount, 0::numeric exp_amt, m.amount exp_pending,
      case p_dim when 'project' then p.id::text when 'customer' then p.customer_id::text when 'month' then to_char(m.due_date, 'YYYY-MM') end k,
      case p_dim when 'project' then p.code || ' – ' || p.name when 'customer' then app.account_name(p.customer_id) when 'month' then to_char(m.due_date, 'YYYY-MM') end l
    from public.project_milestones m join public.projects p on p.id = m.project_id
    where m.payment <> 'paid' and m.amount > 0 and p.deleted_at is null and p.stage <> 'cancelled' and m.due_date between v_from and v_to),
  u as (select * from inc union all select * from ex union all select * from ms),
  g as (select k, coalesce(max(l), case p_dim when 'project' then 'Chi chung (không gắn dự án)' when 'customer' then 'Chưa gán khách hàng' when 'month' then '—' else 'Chưa phân loại' end) label,
               sum(amount) income, sum(exp_amt) expense, sum(amount) - sum(exp_amt) diff, sum(exp_pending) expected from u group by k)
  select jsonb_build_object('dim', p_dim, 'from', v_from, 'to', v_to,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'label', label, 'income', income, 'expense', expense, 'diff', diff, 'expected', expected)
                      order by case when p_dim = 'month' then null else abs(diff) end desc nulls last, label) from g), '[]'::jsonb),
    'income', coalesce((select sum(income) from g), 0), 'expense', coalesce((select sum(expense) from g), 0), 'expected', coalesce((select sum(expected) from g), 0))
  into v_res;
  return v_res;
end $$;

-- 12 kỳ trong năm: thu / chi thực tế, chênh lệch thu–chi (KHÔNG phải lợi nhuận kế toán), trạng thái chốt, có ghi chú, lệch snapshot
create or replace function public.finance_periods_year(p_year int) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app.has_permission('finance.view') then raise exception 'Bạn không có quyền xem kỳ tài chính' using errcode = '42501'; end if;
  return (select jsonb_agg(jsonb_build_object('month', m, 'income', t.i, 'expense', t.e, 'diff', t.i - t.e, 'income_count', t.ic, 'expense_count', t.ec,
      'closed', fp.closed_at is not null, 'has_note', nullif(fp.note, '') is not null,
      'mismatch', fp.closed_at is not null and (fp.closed_income is distinct from t.i or fp.closed_expense is distinct from t.e)) order by m)
    from generate_series(1, 12) m
    cross join lateral (select coalesce((select sum(amount) from public.incomes where status = 'confirmed' and extract(year from occurred_on) = p_year and extract(month from occurred_on) = m), 0) i,
                               (select count(*) from public.incomes where status = 'confirmed' and extract(year from occurred_on) = p_year and extract(month from occurred_on) = m) ic,
                               coalesce((select sum(amount) from public.expenses where deleted_at is null and approval = 'approved' and extract(year from occurred_on) = p_year and extract(month from occurred_on) = m), 0) e,
                               (select count(*) from public.expenses where deleted_at is null and approval = 'approved' and extract(year from occurred_on) = p_year and extract(month from occurred_on) = m) ec) t
    left join public.finance_periods fp on fp.org_id = app.current_org_id() and fp.year = p_year and fp.month = m);
end $$;

create or replace function public.finance_period_detail(p_year int, p_month int) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_from date; v_to date; fp public.finance_periods%rowtype; v_inc numeric; v_exp numeric; v_inc_n int; v_exp_n int; v_tz text;
begin
  if not app.has_permission('finance.view') then raise exception 'Bạn không có quyền xem kỳ tài chính' using errcode = '42501'; end if;
  if p_month not between 1 and 12 then raise exception 'Tháng không hợp lệ' using errcode = '22023'; end if;
  v_from := make_date(p_year, p_month, 1); v_to := (v_from + interval '1 month - 1 day')::date;
  select * into fp from public.finance_periods where org_id = app.current_org_id() and year = p_year and month = p_month;
  select coalesce(sum(amount), 0), count(*) into v_inc, v_inc_n from public.incomes where status = 'confirmed' and occurred_on between v_from and v_to;
  select coalesce(sum(amount), 0), count(*) into v_exp, v_exp_n from public.expenses where deleted_at is null and approval = 'approved' and occurred_on between v_from and v_to;
  return jsonb_build_object('year', p_year, 'month', p_month, 'from', v_from, 'to', v_to,
    'income', v_inc, 'income_count', v_inc_n, 'expense', v_exp, 'expense_count', v_exp_n, 'diff', v_inc - v_exp,
    'note', fp.note, 'closed', fp.closed_at is not null, 'closed_at', fp.closed_at, 'closed_by', (select full_name from public.profiles where id = fp.closed_by),
    'closed_income', fp.closed_income, 'closed_expense', fp.closed_expense,
    'income_gap', case when fp.closed_at is not null then v_inc - fp.closed_income end, 'expense_gap', case when fp.closed_at is not null then v_exp - fp.closed_expense end,
    'reopened_at', fp.reopened_at, 'reopen_reason', fp.reopen_reason,
    'pending_expense_count', (select count(*) from public.expenses where deleted_at is null and approval = 'submitted' and occurred_on between v_from and v_to),
    'expected_amount', coalesce((select sum(m.amount) from public.project_milestones m join public.projects p on p.id = m.project_id where p.deleted_at is null and p.stage <> 'cancelled' and m.amount > 0 and m.due_date between v_from and v_to), 0),
    'expected_open', coalesce((select sum(m.amount) from public.project_milestones m join public.projects p on p.id = m.project_id where p.deleted_at is null and p.stage <> 'cancelled' and m.payment <> 'paid' and m.amount > 0 and m.due_date between v_from and v_to), 0),
    'late_receipts_amount', coalesce((select sum(i.amount) from public.incomes i join public.project_milestones m on m.id = i.milestone_id where i.status = 'confirmed' and i.occurred_on between v_from and v_to and m.due_date < v_from), 0),
    'late_receipts_count', (select count(*) from public.incomes i join public.project_milestones m on m.id = i.milestone_id where i.status = 'confirmed' and i.occurred_on between v_from and v_to and m.due_date < v_from));
end $$;

-- Gắn khoản thu có sẵn (nhập tay trước đây) vào mốc đã đánh dấu "đã thu" thiếu liên kết — thao tác tường minh của kế toán
create or replace function public.link_income_to_milestone(p_income uuid, p_milestone uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); m public.project_milestones%rowtype; i public.incomes%rowtype; v_tz text;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền liên kết khoản thu với mốc' using errcode = '42501'; end if;
  select * into m from public.project_milestones where id = p_milestone and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
  select * into i from public.incomes where id = p_income and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy khoản thu' using errcode = 'P0002'; end if;
  if i.status <> 'confirmed' or i.milestone_id is not null then raise exception 'Khoản thu đã hủy hoặc đã gắn mốc khác' using errcode = '22023'; end if;
  if i.project_id is distinct from m.project_id then raise exception 'Khoản thu thuộc dự án khác' using errcode = '22023'; end if;
  if i.amount <> m.amount then raise exception 'Số tiền khoản thu (%) khác số tiền mốc (%)', i.amount, m.amount using errcode = '22023'; end if;
  if exists (select 1 from public.incomes where milestone_id = m.id and status = 'confirmed') then raise exception 'Mốc đã có khoản thu liên kết' using errcode = '22023'; end if;
  select coalesce(o.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.organizations o where o.id = v_org;
  update public.incomes set milestone_id = m.id where id = i.id;
  update public.project_milestones set payment = 'paid', paid_at = coalesce(paid_at, (i.occurred_on::timestamp at time zone coalesce(v_tz, 'Asia/Ho_Chi_Minh'))) where id = m.id;
  perform app.write_audit(v_org, 'milestone.link_income', 'milestone', m.id, jsonb_build_object('income', i.id, 'amount', i.amount));
end $$;

-- Đối chiếu: liệt kê bản ghi lệch để xử lý — KHÔNG tự tạo / sửa tiền khi mở trang.
create or replace function public.finance_reconcile(p_year int default null, p_month int default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_from date := '1900-01-01'; v_to date := '2999-12-31'; v_tz text; v_res jsonb;
begin
  if not app.has_permission('finance.view') then raise exception 'Bạn không có quyền xem đối chiếu' using errcode = '42501'; end if;
  if p_year is not null and p_month is not null then v_from := make_date(p_year, p_month, 1); v_to := (v_from + interval '1 month - 1 day')::date; end if;
  select coalesce(timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.organizations where id = app.current_org_id();
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  with issues as (
    select 'paid_no_income' kind, 'high' sev, 'milestone' ref_type, m.id ref_id, m.project_id, p.code || ' – ' || m.name label,
      'Mốc đã đánh dấu đã thu nhưng chưa có khoản thu liên kết' detail, m.amount, (m.paid_at at time zone v_tz)::date dt
    from public.project_milestones m join public.projects p on p.id = m.project_id
    where m.payment = 'paid' and not exists (select 1 from public.incomes i where i.milestone_id = m.id and i.status = 'confirmed')
    union all
    select 'income_no_paid', 'high', 'income', i.id, i.project_id, p.code || ' – ' || coalesce(i.description, 'Khoản thu'),
      'Khoản thu gắn mốc nhưng mốc chưa ở trạng thái đã thu', i.amount, i.occurred_on
    from public.incomes i join public.project_milestones m on m.id = i.milestone_id join public.projects p on p.id = i.project_id
    where i.status = 'confirmed' and m.payment <> 'paid'
    union all
    select 'amount_mismatch', 'high', 'income', i.id, i.project_id, p.code || ' – ' || m.name,
      'Số tiền thu ' || i.amount::text || ' khác số tiền mốc ' || m.amount::text, i.amount - m.amount, i.occurred_on
    from public.incomes i join public.project_milestones m on m.id = i.milestone_id join public.projects p on p.id = i.project_id
    where i.status = 'confirmed' and i.amount <> m.amount
    union all
    select 'date_mismatch', 'medium', 'income', i.id, i.project_id, p.code || ' – ' || m.name,
      'Ngày thu của mốc (' || (m.paid_at at time zone v_tz)::date::text || ') khác ngày khoản thu (' || i.occurred_on::text || ')', i.amount, i.occurred_on
    from public.incomes i join public.project_milestones m on m.id = i.milestone_id join public.projects p on p.id = i.project_id
    where i.status = 'confirmed' and m.payment = 'paid' and m.paid_at is not null and (m.paid_at at time zone v_tz)::date <> i.occurred_on
    union all
    select 'income_no_voucher', 'low', 'income', i.id, i.project_id, coalesce(p.code || ' – ', '') || coalesce(i.description, 'Khoản thu'),
      'Khoản thu chưa có chứng từ đính kèm', i.amount, i.occurred_on
    from public.incomes i left join public.projects p on p.id = i.project_id
    where i.status = 'confirmed' and not exists (select 1 from public.finance_files f where f.kind = 'income' and f.ref_id = i.id)
    union all
    select 'expense_no_voucher', 'low', 'expense', e.id, e.project_id, coalesce(p.code || ' – ', '') || coalesce(e.description, e.payee_name, 'Khoản chi'),
      'Khoản chi đã duyệt chưa có chứng từ', e.amount, e.occurred_on
    from public.expenses e left join public.projects p on p.id = e.project_id
    where e.deleted_at is null and e.approval = 'approved' and nullif(trim(coalesce(e.invoice_url, '')), '') is null
      and not exists (select 1 from public.finance_files f where f.kind = 'expense' and f.ref_id = e.id)
    union all
    select 'period_mismatch', 'high', 'period', null, null, 'Kỳ ' || lpad(fp.month::text, 2, '0') || '/' || fp.year::text,
      'Tổng đã chốt (thu ' || fp.closed_income::text || ', chi ' || fp.closed_expense::text || ') khác tổng chi tiết hiện tại (thu ' || t.i::text || ', chi ' || t.e::text || ')',
      (t.i - fp.closed_income) - (t.e - fp.closed_expense), make_date(fp.year, fp.month, 1)
    from public.finance_periods fp
    cross join lateral (select coalesce((select sum(amount) from public.incomes where status = 'confirmed' and extract(year from occurred_on) = fp.year and extract(month from occurred_on) = fp.month), 0) i,
                               coalesce((select sum(amount) from public.expenses where deleted_at is null and approval = 'approved' and extract(year from occurred_on) = fp.year and extract(month from occurred_on) = fp.month), 0) e) t
    where fp.closed_at is not null and (fp.closed_income is distinct from t.i or fp.closed_expense is distinct from t.e)
    union all
    select 'project_no_milestone', 'medium', 'project', p.id, p.id, p.code || ' – ' || p.name,
      'Dự án có giá trị hợp đồng nhưng chưa lập lịch thu', b.contract_value, p.created_at::date
    from public.projects p join public.project_budgets b on b.project_id = p.id
    where p.deleted_at is null and p.stage::text in ('planning', 'in_progress', 'acceptance') and coalesce(b.contract_value, 0) > 0
      and not exists (select 1 from public.project_milestones m where m.project_id = p.id)
    union all
    select 'schedule_gap', 'medium', 'project', p.id, p.id, p.code || ' – ' || p.name,
      'Tổng các mốc (' || s.tot::text || ') khác giá trị hợp đồng (' || b.contract_value::text || ')', b.contract_value - s.tot, p.created_at::date
    from public.projects p join public.project_budgets b on b.project_id = p.id
    cross join lateral (select sum(amount) tot from public.project_milestones m where m.project_id = p.id having count(*) > 0) s
    where p.deleted_at is null and p.stage::text <> 'cancelled' and coalesce(b.contract_value, 0) > 0 and s.tot <> b.contract_value)
  select jsonb_build_object('count', count(*), 'by_kind', coalesce(jsonb_object_agg(kind, c) filter (where kind is not null), '{}'::jsonb), 'items', coalesce(
      (select jsonb_agg(to_jsonb(q)) from (select * from issues where (p_year is null or p_month is null) or dt between v_from and v_to
        order by case sev when 'high' then 1 when 'medium' then 2 else 3 end, dt desc nulls last limit 300) q), '[]'::jsonb))
  into v_res
  from (select kind, count(*) c from issues where (p_year is null or p_month is null) or dt between v_from and v_to group by kind) k;
  return coalesce(v_res, jsonb_build_object('count', 0, 'by_kind', '{}'::jsonb, 'items', '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Nhắc việc tài chính: mỗi sự kiện đúng MỘT lần (khóa duy nhất), gọi lười khi mở trang — không cần job nền
-- ---------------------------------------------------------------------
create table public.finance_reminders (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  ref_id uuid not null,
  key_date date not null default date '1970-01-01',
  created_at timestamptz not null default now(),
  primary key (org_id, kind, ref_id, key_date)
);
alter table public.finance_reminders enable row level security;
revoke all on public.finance_reminders from anon, authenticated;
grant all on public.finance_reminders to service_role;

create or replace function app.notify_direct(p_org uuid, p_user uuid, p_kind text, p_message text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (org_id, user_id, kind, message, link)
  select p_org, p_user, p_kind, p_message, p_link
  where p_user is not null and exists (select 1 from public.profiles where id = p_user and org_id = p_org and is_active)
$$;

create or replace function public.run_finance_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_today date := app.today(); r record; u uuid; v_n int := 0; v_kind text; v_msg text; v_users uuid[];
  v_fmt text := 'FM999G999G999G990';
begin
  if v_org is null or auth.uid() is null then return 0; end if;
  for r in select m.id, m.name, m.amount, m.due_date, p.id pid, p.code, p.manager_id
           from public.project_milestones m join public.projects p on p.id = m.project_id
           where m.org_id = v_org and m.payment <> 'paid' and m.amount > 0 and m.due_date is not null and m.due_date <= v_today + 3 and p.deleted_at is null and p.stage <> 'cancelled'
           order by m.due_date limit 300 loop
    select coalesce(array_agg(distinct x), '{}') into v_users from (
      select ur.user_id x from public.user_roles ur join public.role_permissions rp on rp.role = ur.role where ur.org_id = v_org and rp.permission = 'finance.manage'
      union select user_id from public.project_managers where project_id = r.pid union select r.manager_id) q where x is not null;
    for v_kind in select unnest(case when r.due_date < v_today - 30 then array['milestone_overdue', 'milestone_overdue30'] when r.due_date < v_today then array['milestone_overdue'] else array['milestone_due'] end) loop
      insert into public.finance_reminders (org_id, kind, ref_id, key_date) values (v_org, v_kind, r.id, r.due_date) on conflict do nothing;
      if found then
        v_msg := case v_kind when 'milestone_due' then 'Mốc "' || r.name || '" của ' || r.code || ' đến hạn thu ' || to_char(r.due_date, 'DD/MM/YYYY')
                             when 'milestone_overdue' then 'Mốc "' || r.name || '" của ' || r.code || ' quá hạn thu từ ' || to_char(r.due_date, 'DD/MM/YYYY')
                             else 'Mốc "' || r.name || '" của ' || r.code || ' quá hạn thu trên 30 ngày' end;
        foreach u in array v_users loop perform app.notify_direct(v_org, u, 'finance_due', v_msg, '/du-an/' || r.pid::text || '?tab=thanh-toan'); end loop;
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  for r in select p.id, p.code, p.name, p.manager_id from public.projects p where p.org_id = v_org and p.deleted_at is null and p.risk_level = 'high' and p.stage::text not in ('completed', 'cancelled') limit 200 loop
    insert into public.finance_reminders (org_id, kind, ref_id) values (v_org, 'project_risk', r.id) on conflict do nothing;
    if found then
      select coalesce(array_agg(distinct x), '{}') into v_users from (
        select user_id x from public.project_managers where project_id = r.id union select r.manager_id
        union select ur.user_id from public.user_roles ur join public.role_permissions rp on rp.role = ur.role where ur.org_id = v_org and rp.permission = 'projects.view_all') q where x is not null;
      foreach u in array v_users loop perform app.notify_direct(v_org, u, 'project_risk', 'Dự án ' || r.code || ' – ' || r.name || ' được đánh dấu rủi ro cao', '/du-an/' || r.id::text); end loop;
      v_n := v_n + 1;
    end if;
  end loop;
  for r in select e.id, e.amount, e.description, e.requested_by from public.expenses e
           where e.org_id = v_org and e.deleted_at is null and e.approval = 'approved' and e.occurred_on <= v_today - 3 and nullif(trim(coalesce(e.invoice_url, '')), '') is null
             and not exists (select 1 from public.finance_files f where f.kind = 'expense' and f.ref_id = e.id) order by e.occurred_on limit 200 loop
    insert into public.finance_reminders (org_id, kind, ref_id) values (v_org, 'expense_voucher', r.id) on conflict do nothing;
    if found then
      select coalesce(array_agg(distinct x), '{}') into v_users from (select r.requested_by x
        union select ur.user_id from public.user_roles ur join public.role_permissions rp on rp.role = ur.role where ur.org_id = v_org and rp.permission = 'finance.manage') q where x is not null;
      foreach u in array v_users loop perform app.notify_direct(v_org, u, 'finance_voucher', 'Khoản chi ' || coalesce(r.description, '') || ' (' || to_char(r.amount, v_fmt) || ') còn thiếu chứng từ', '/thu-chi?tab=chung-tu&voucher=missing'); end loop;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Tài khoản cộng tác viên chỉ thấy việc của mình: chặn mọi bảng nội bộ mới (cùng mẫu với các bảng tài chính / lương).
do $$ declare t text; begin
  foreach t in array array['project_managers', 'project_files', 'project_file_blobs', 'saved_views', 'finance_files', 'finance_file_blobs', 'finance_periods'] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (not app.has_role(%L))', t || '_no_collab', t, 'collaborator');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Quyền truy cập: mọi hàm mới chỉ cho người đăng nhập
-- ---------------------------------------------------------------------
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
    'set_project_managers', 'set_project_members', 'update_project_progress', 'add_project_file', 'get_project_file', 'delete_project_file', 'save_view', 'delete_view',
    'add_finance_file', 'get_finance_file', 'delete_finance_file', 'save_finance_period_note', 'close_finance_period', 'reopen_finance_period',
    'record_milestone_receipt', 'milestone_pay', 'cancel_income', 'record_income', 'project_rows', 'project_list', 'project_money', 'project_history', 'income_list', 'expense_list',
    'set_transaction_scope', 'receivables', 'finance_overview', 'finance_report', 'finance_periods_year', 'finance_period_detail', 'link_income_to_milestone',
    'finance_reconcile', 'run_finance_reminders']) loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid), app.sync_video_tasks(uuid), app.trg_videos_sync_tasks(), app.trg_items_sync_tasks(), app.trg_tasks_guard(),
  app.trg_profile_code(), app.check_dept_staff(uuid, uuid, uuid, boolean), app.sync_dept_manager(uuid) , app.trg_project_manager_sync(), app.trg_finance_period_lock(), app.period_closed(date), app.period_totals(int, int),
  app.notify_direct(uuid, uuid, text, text, text) from authenticated;
