-- =====================================================================
-- 0800 · Chấm công & bảng lương theo kỳ
--   Chấm công → Nhân sự lập bảng lương (nháp) → Nhân sự kiểm tra → Kế toán duyệt → Kế toán chi trả.
--   Thưởng theo dự án: quản lý dự án đề xuất, kế toán duyệt, tự vào bảng lương của tháng.
--   Thuế TNCN KHÔNG tự tính (cần cập nhật theo quy định hiện hành) — kế toán nhập tay thành một dòng "tax".
-- =====================================================================
create type public.attendance_status as enum ('present', 'half', 'leave_paid', 'leave_unpaid', 'absent', 'holiday');
create type public.payroll_status as enum ('draft', 'checked', 'approved', 'paid');
create type public.bonus_status as enum ('requested', 'approved', 'rejected');

create table public.payroll_settings (
  org_id          uuid primary key references public.organizations(id) on delete cascade,
  standard_days   numeric(4,1) not null default 26 check (standard_days between 1 and 31),
  insurance_rate  numeric(5,2) not null default 10.5 check (insurance_rate between 0 and 100),
  updated_at      timestamptz not null default now()
);
insert into public.payroll_settings (org_id) select id from public.organizations on conflict do nothing;

create table public.salary_profiles (
  user_id      uuid primary key,
  org_id       uuid not null,
  base_salary  numeric(16,2) not null default 0 check (base_salary >= 0),
  insurance_base numeric(16,2) check (insurance_base is null or insurance_base >= 0),   -- mức đóng bảo hiểm (trống = lương cơ bản)
  bank_name    text, account_no text, account_name text,
  note         text,
  updated_at   timestamptz not null default now(),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create table public.salary_allowances (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null,
  user_id  uuid not null,
  name     text not null check (length(trim(name)) > 0),
  amount   numeric(16,2) not null check (amount >= 0),
  is_active boolean not null default true,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index salary_allowances_user_idx on public.salary_allowances(user_id);

create table public.attendance_records (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  user_id    uuid not null,
  work_date  date not null,
  status     public.attendance_status not null default 'present',
  check_in   timestamptz,
  check_out  timestamptz,
  note       text,
  updated_by uuid references auth.users(id) on delete set null,
  unique (user_id, work_date),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index attendance_org_date_idx on public.attendance_records(org_id, work_date);

create table public.payroll_periods (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  year        int not null check (year between 2000 and 2100),
  month       int not null check (month between 1 and 12),
  status      public.payroll_status not null default 'draft',
  standard_days numeric(4,1) not null,
  insurance_rate numeric(5,2) not null,
  created_by  uuid references auth.users(id) on delete set null,
  checked_by  uuid references auth.users(id) on delete set null, checked_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz,
  paid_by     uuid references auth.users(id) on delete set null, paid_on date,
  note        text,
  created_at  timestamptz not null default now(),
  unique (org_id, id), unique (org_id, year, month)
);
create table public.payroll_lines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  period_id   uuid not null,
  user_id     uuid not null,
  base_salary numeric(16,2) not null default 0,
  worked_days numeric(5,1) not null default 0,
  base_pay    numeric(16,2) not null default 0,
  allowances  numeric(16,2) not null default 0,
  bonuses     numeric(16,2) not null default 0,
  insurance   numeric(16,2) not null default 0,
  tax         numeric(16,2) not null default 0,
  deductions  numeric(16,2) not null default 0,
  net_pay     numeric(16,2) not null default 0,
  note        text,
  unique (period_id, user_id),
  foreign key (org_id, period_id) references public.payroll_periods(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete restrict
);
create table public.payroll_items (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null,
  line_id   uuid not null references public.payroll_lines(id) on delete cascade,
  kind      text not null check (kind in ('allowance', 'bonus', 'insurance', 'tax', 'deduction')),
  name      text not null,
  amount    numeric(16,2) not null check (amount >= 0),
  is_manual boolean not null default false,
  bonus_id  uuid
);
create index payroll_items_line_idx on public.payroll_items(line_id);

create table public.project_bonuses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  project_id uuid not null,
  user_id    uuid not null,
  month_date date not null,                      -- ngày đầu tháng được trả
  amount     numeric(16,2) not null check (amount > 0),
  reason     text,
  status     public.bonus_status not null default 'requested',
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check (month_date = date_trunc('month', month_date)::date),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade
);
create index project_bonuses_month_idx on public.project_bonuses(org_id, month_date, status);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.payroll_settings enable row level security;
alter table public.salary_profiles enable row level security;
alter table public.salary_allowances enable row level security;
alter table public.attendance_records enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_items enable row level security;
alter table public.project_bonuses enable row level security;

create policy payroll_settings_sel on public.payroll_settings for select to authenticated using (org_id = app.current_org_id() and app.has_permission('payroll.view'));
create policy salary_profiles_sel on public.salary_profiles for select to authenticated using (org_id = app.current_org_id() and (app.has_permission('payroll.view') or user_id = auth.uid()));
create policy salary_allowances_sel on public.salary_allowances for select to authenticated using (org_id = app.current_org_id() and (app.has_permission('payroll.view') or user_id = auth.uid()));
create policy attendance_sel on public.attendance_records for select to authenticated using (org_id = app.current_org_id() and (app.has_permission('payroll.view') or user_id = auth.uid()));
-- Hàm SECURITY DEFINER để tránh vòng lặp chính sách giữa kỳ lương ↔ dòng lương
create or replace function app.can_see_period(p_period uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.payroll_periods p
    where p.id = p_period and p.org_id = app.current_org_id()
      and (app.has_permission('payroll.view')
           or (p.status in ('approved', 'paid') and exists (select 1 from public.payroll_lines l where l.period_id = p.id and l.user_id = auth.uid()))))
$$;
create or replace function app.can_see_line(p_line uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and exists (
    select 1 from public.payroll_lines l join public.payroll_periods p on p.id = l.period_id
    where l.id = p_line and l.org_id = app.current_org_id()
      and (app.has_permission('payroll.view') or (l.user_id = auth.uid() and p.status in ('approved', 'paid'))))
$$;
create policy payroll_periods_sel on public.payroll_periods for select to authenticated using (org_id = app.current_org_id() and app.can_see_period(id));
create policy payroll_lines_sel on public.payroll_lines for select to authenticated using (org_id = app.current_org_id() and app.can_see_line(id));
create policy payroll_items_sel on public.payroll_items for select to authenticated using (org_id = app.current_org_id() and app.can_see_line(line_id));
create policy project_bonuses_sel on public.project_bonuses for select to authenticated
  using (org_id = app.current_org_id() and (app.has_permission('payroll.view') or user_id = auth.uid() or requested_by = auth.uid() or app.can_manage_project(project_id)));

revoke all on public.payroll_settings, public.salary_profiles, public.salary_allowances, public.attendance_records, public.payroll_periods,
  public.payroll_lines, public.payroll_items, public.project_bonuses from anon, authenticated;
grant select on public.payroll_settings, public.salary_profiles, public.salary_allowances, public.attendance_records, public.payroll_periods,
  public.payroll_lines, public.payroll_items, public.project_bonuses to authenticated;
grant all on public.payroll_settings, public.salary_profiles, public.salary_allowances, public.attendance_records, public.payroll_periods,
  public.payroll_lines, public.payroll_items, public.project_bonuses to service_role;

-- Cộng tác viên không thấy bảng lương nội bộ (chính sách chặn chồng)
do $$
declare t text;
begin
  foreach t in array array['payroll_settings','salary_profiles','salary_allowances','attendance_records','payroll_periods','payroll_lines','payroll_items','project_bonuses'] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (not app.has_role(%L))', t || '_no_collab', t, 'collaborator');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RPC: hồ sơ lương
-- ---------------------------------------------------------------------
create or replace function app.require_payroll(p_perm text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if v_org is null or not app.has_permission(p_perm) then raise exception 'Bạn không có quyền thực hiện thao tác lương này' using errcode = '42501'; end if;
  return v_org;
end $$;

create or replace function public.save_payroll_settings(p_standard_days numeric, p_insurance_rate numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage');
begin
  if p_standard_days is null or p_standard_days < 1 or p_standard_days > 31 then raise exception 'Số công chuẩn phải từ 1 đến 31' using errcode = '22023'; end if;
  if p_insurance_rate is null or p_insurance_rate < 0 or p_insurance_rate > 100 then raise exception 'Tỷ lệ bảo hiểm phải từ 0 đến 100' using errcode = '22023'; end if;
  insert into public.payroll_settings (org_id, standard_days, insurance_rate) values (v_org, p_standard_days, p_insurance_rate)
  on conflict (org_id) do update set standard_days = excluded.standard_days, insurance_rate = excluded.insurance_rate, updated_at = now();
end $$;

create or replace function public.save_salary_profile(
  p_user uuid, p_base numeric, p_insurance_base numeric default null, p_bank text default null, p_account_no text default null,
  p_account_name text default null, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage');
begin
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org and is_active) or app.has_role_of(p_user, 'collaborator') then
    raise exception 'Chỉ lập hồ sơ lương cho nhân viên đang hoạt động (cộng tác viên trả theo đầu việc)' using errcode = '22023';
  end if;
  if coalesce(p_base, -1) < 0 then raise exception 'Lương cơ bản không hợp lệ' using errcode = '22023'; end if;
  insert into public.salary_profiles (user_id, org_id, base_salary, insurance_base, bank_name, account_no, account_name, note)
  values (p_user, v_org, p_base, p_insurance_base, nullif(trim(coalesce(p_bank, '')), ''), nullif(trim(coalesce(p_account_no, '')), ''),
          nullif(trim(coalesce(p_account_name, '')), ''), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (user_id) do update set base_salary = excluded.base_salary, insurance_base = excluded.insurance_base, bank_name = excluded.bank_name,
    account_no = excluded.account_no, account_name = excluded.account_name, note = excluded.note, updated_at = now();
  perform app.write_audit(v_org, 'salary.profile', 'user', p_user, jsonb_build_object('base', p_base));
end $$;

create or replace function public.save_allowance(p_id uuid, p_user uuid, p_name text, p_amount numeric, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage'); v_id uuid;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên khoản phụ cấp' using errcode = '22023'; end if;
  if coalesce(p_amount, -1) < 0 then raise exception 'Số tiền không hợp lệ' using errcode = '22023'; end if;
  if p_id is null then
    if not exists (select 1 from public.salary_profiles where user_id = p_user and org_id = v_org) then raise exception 'Cần lập hồ sơ lương trước' using errcode = '22023'; end if;
    insert into public.salary_allowances (org_id, user_id, name, amount, is_active) values (v_org, p_user, trim(p_name), p_amount, coalesce(p_active, true)) returning id into v_id;
  else
    update public.salary_allowances set name = trim(p_name), amount = p_amount, is_active = coalesce(p_active, true) where id = p_id and org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy khoản phụ cấp' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: chấm công
-- ---------------------------------------------------------------------
create or replace function public.check_in() returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_today date := app.today();
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền chấm công' using errcode = '42501'; end if;
  insert into public.attendance_records (org_id, user_id, work_date, status, check_in, updated_by) values (v_org, auth.uid(), v_today, 'present', now(), auth.uid())
  on conflict (user_id, work_date) do update set check_in = coalesce(public.attendance_records.check_in, now()),
    status = case when public.attendance_records.status in ('absent') then 'present' else public.attendance_records.status end;
end $$;

create or replace function public.check_out() returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_today date := app.today(); n int;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền chấm công' using errcode = '42501'; end if;
  update public.attendance_records set check_out = now() where user_id = auth.uid() and work_date = v_today and check_in is not null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Hôm nay bạn chưa chấm công vào' using errcode = '22023'; end if;
end $$;

create or replace function app.period_locked(p_org uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payroll_periods where org_id = p_org and year = extract(year from p_date) and month = extract(month from p_date) and status <> 'draft')
$$;

create or replace function public.set_attendance(p_user uuid, p_date date, p_status public.attendance_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage');
begin
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org and is_active) then raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002'; end if;
  if p_date > app.today() + 31 then raise exception 'Ngày chấm công quá xa trong tương lai' using errcode = '22023'; end if;
  if app.period_locked(v_org, p_date) then raise exception 'Kỳ lương của tháng này đã khóa — mở lại kỳ lương trước khi sửa công' using errcode = '22023'; end if;
  insert into public.attendance_records (org_id, user_id, work_date, status, note, updated_by) values (v_org, p_user, p_date, p_status, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (user_id, work_date) do update set status = excluded.status, note = excluded.note, updated_by = auth.uid();
end $$;

-- Điền công đủ cho các ngày làm việc (thứ 2 – thứ 6) còn trống trong khoảng
create or replace function public.fill_attendance(p_user uuid, p_from date, p_to date, p_include_saturday boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage'); n int;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'Khoảng ngày không hợp lệ (tối đa 62 ngày)' using errcode = '22023'; end if;
  if app.period_locked(v_org, p_from) or app.period_locked(v_org, p_to) then raise exception 'Kỳ lương đã khóa' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user and org_id = v_org and is_active) then raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002'; end if;
  insert into public.attendance_records (org_id, user_id, work_date, status, updated_by)
  select v_org, p_user, d::date, 'present', auth.uid() from generate_series(p_from, p_to, interval '1 day') d
  where extract(isodow from d) <= case when p_include_saturday then 6 else 5 end
  on conflict (user_id, work_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- RPC: thưởng theo dự án
-- ---------------------------------------------------------------------
create or replace function public.request_project_bonus(p_project uuid, p_user uuid, p_amount numeric, p_month date, p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; v_m date := date_trunc('month', p_month)::date;
begin
  if not app.can_manage_project(p_project) then raise exception 'Chỉ quản lý dự án được đề xuất thưởng' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền thưởng phải lớn hơn 0' using errcode = '22023'; end if;
  if p_month is null then raise exception 'Chọn tháng chi trả' using errcode = '22023'; end if;
  if not exists (select 1 from public.project_members where project_id = p_project and user_id = p_user) then raise exception 'Người nhận phải là thành viên của dự án' using errcode = '22023'; end if;
  if app.period_locked(v_org, v_m) then raise exception 'Kỳ lương tháng này đã khóa — chọn tháng sau' using errcode = '22023'; end if;
  insert into public.project_bonuses (org_id, project_id, user_id, month_date, amount, reason) values (v_org, p_project, p_user, v_m, p_amount, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  perform app.notify_permission(v_org, 'payroll.approve', 'bonus_requested', 'Có đề xuất thưởng dự án ' || p_amount::bigint::text || ' đ chờ duyệt', '/luong/thuong');
  return v_id;
end $$;

create or replace function public.decide_project_bonus(p_id uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.approve'); b public.project_bonuses%rowtype;
begin
  select * into b from public.project_bonuses where id = p_id and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy đề xuất thưởng' using errcode = 'P0002'; end if;
  if b.status <> 'requested' then raise exception 'Đề xuất đã được xử lý' using errcode = '22023'; end if;
  if b.requested_by = auth.uid() and not app.has_role('system_admin') then raise exception 'Không tự duyệt đề xuất của chính mình' using errcode = '42501'; end if;
  if not p_approve and nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cần nhập lý do từ chối' using errcode = '22023'; end if;
  if p_approve and app.period_locked(v_org, b.month_date) then raise exception 'Kỳ lương tháng này đã khóa' using errcode = '22023'; end if;
  update public.project_bonuses set status = (case when p_approve then 'approved' else 'rejected' end)::public.bonus_status, decided_by = auth.uid(), decided_at = now(),
    reject_reason = case when p_approve then null else trim(p_reason) end where id = b.id;
  perform app.notify_link(v_org, b.requested_by, 'bonus', case when p_approve then 'Đã duyệt' else 'Từ chối' end || ' thưởng dự án ' || b.amount::bigint::text || ' đ', '/luong/thuong');
end $$;

-- ---------------------------------------------------------------------
-- RPC: bảng lương theo kỳ
-- ---------------------------------------------------------------------
create or replace function app.recalc_line(p_line uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.payroll_lines%rowtype;
begin
  select * into l from public.payroll_lines where id = p_line;
  update public.payroll_lines set
    allowances = coalesce((select sum(amount) from public.payroll_items where line_id = p_line and kind = 'allowance'), 0),
    bonuses    = coalesce((select sum(amount) from public.payroll_items where line_id = p_line and kind = 'bonus'), 0),
    insurance  = coalesce((select sum(amount) from public.payroll_items where line_id = p_line and kind = 'insurance'), 0),
    tax        = coalesce((select sum(amount) from public.payroll_items where line_id = p_line and kind = 'tax'), 0),
    deductions = coalesce((select sum(amount) from public.payroll_items where line_id = p_line and kind = 'deduction'), 0)
  where id = p_line;
  update public.payroll_lines set net_pay = base_pay + allowances + bonuses - insurance - tax - deductions where id = p_line;
end $$;

create or replace function public.generate_payroll(p_year int, p_month int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage'); pr public.payroll_periods%rowtype; s public.payroll_settings%rowtype;
        u record; v_line uuid; v_from date; v_to date; v_worked numeric; v_base numeric; v_ins numeric;
begin
  if p_year is null or p_month is null or p_month not between 1 and 12 then raise exception 'Kỳ lương không hợp lệ' using errcode = '22023'; end if;
  v_from := make_date(p_year, p_month, 1); v_to := (v_from + interval '1 month - 1 day')::date;
  select * into s from public.payroll_settings where org_id = v_org;
  if not found then insert into public.payroll_settings (org_id) values (v_org) returning * into s; end if;
  select * into pr from public.payroll_periods where org_id = v_org and year = p_year and month = p_month for update;
  if not found then
    insert into public.payroll_periods (org_id, year, month, standard_days, insurance_rate, created_by) values (v_org, p_year, p_month, s.standard_days, s.insurance_rate, auth.uid())
    returning * into pr;
  elsif pr.status <> 'draft' then
    raise exception 'Kỳ lương đã được kiểm tra / duyệt — mở lại về nháp trước khi tính lại' using errcode = '22023';
  else
    update public.payroll_periods set standard_days = s.standard_days, insurance_rate = s.insurance_rate where id = pr.id returning * into pr;
  end if;
  for u in select sp.* from public.salary_profiles sp join public.profiles p on p.id = sp.user_id and p.is_active
           where sp.org_id = v_org and not app.has_role_of(sp.user_id, 'collaborator') loop
    select coalesce(sum(case status when 'present' then 1 when 'half' then 0.5 when 'leave_paid' then 1 when 'holiday' then 1 else 0 end), 0)
      into v_worked from public.attendance_records where user_id = u.user_id and work_date between v_from and v_to;
    v_worked := least(v_worked, pr.standard_days);
    v_base := round(u.base_salary * v_worked / pr.standard_days, 2);
    insert into public.payroll_lines (org_id, period_id, user_id, base_salary, worked_days, base_pay, note)
    values (v_org, pr.id, u.user_id, u.base_salary, v_worked, v_base, case when v_worked = 0 then 'Chưa có chấm công trong tháng' end)
    on conflict (period_id, user_id) do update set base_salary = excluded.base_salary, worked_days = excluded.worked_days, base_pay = excluded.base_pay, note = excluded.note
    returning id into v_line;
    -- giữ lại các dòng nhập tay (khấu trừ, thuế…), tính lại các dòng tự động
    delete from public.payroll_items where line_id = v_line and not is_manual;
    insert into public.payroll_items (org_id, line_id, kind, name, amount)
      select v_org, v_line, 'allowance', name, amount from public.salary_allowances where user_id = u.user_id and is_active and amount > 0;
    insert into public.payroll_items (org_id, line_id, kind, name, amount, bonus_id)
      select v_org, v_line, 'bonus', 'Thưởng dự án ' || pj.code, b.amount, b.id
      from public.project_bonuses b join public.projects pj on pj.id = b.project_id
      where b.user_id = u.user_id and b.month_date = v_from and b.status = 'approved';
    v_ins := round(coalesce(u.insurance_base, u.base_salary) * pr.insurance_rate / 100, 2);
    if v_ins > 0 then insert into public.payroll_items (org_id, line_id, kind, name, amount) values (v_org, v_line, 'insurance', 'Bảo hiểm (' || pr.insurance_rate || '%)', v_ins); end if;
    perform app.recalc_line(v_line);
  end loop;
  -- Nhân viên đã nghỉ / không còn hồ sơ lương: xóa dòng không còn hợp lệ
  delete from public.payroll_lines l where l.period_id = pr.id
    and not exists (select 1 from public.salary_profiles sp join public.profiles p on p.id = sp.user_id and p.is_active where sp.user_id = l.user_id);
  perform app.write_audit(v_org, 'payroll.generate', 'payroll', pr.id, jsonb_build_object('year', p_year, 'month', p_month));
  return pr.id;
end $$;

create or replace function public.add_payroll_item(p_line uuid, p_kind text, p_name text, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); l public.payroll_lines%rowtype; pr public.payroll_periods%rowtype;
begin
  select * into l from public.payroll_lines where id = p_line and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy dòng lương' using errcode = 'P0002'; end if;
  select * into pr from public.payroll_periods where id = l.period_id;
  if pr.status <> 'draft' then raise exception 'Chỉ sửa được khi kỳ lương ở trạng thái nháp' using errcode = '22023'; end if;
  if p_kind not in ('allowance', 'bonus', 'deduction', 'tax') then raise exception 'Loại khoản không hợp lệ' using errcode = '22023'; end if;
  if p_kind = 'tax' and not (app.has_permission('payroll.approve') or app.has_permission('payroll.manage')) then raise exception 'Không có quyền nhập thuế' using errcode = '42501'; end if;
  if not app.has_permission('payroll.manage') then raise exception 'Bạn không có quyền sửa bảng lương' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null or coalesce(p_amount, 0) <= 0 then raise exception 'Nhập tên khoản và số tiền lớn hơn 0' using errcode = '22023'; end if;
  insert into public.payroll_items (org_id, line_id, kind, name, amount, is_manual) values (v_org, p_line, p_kind, trim(p_name), p_amount, true);
  perform app.recalc_line(p_line);
end $$;

create or replace function public.remove_payroll_item(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_payroll('payroll.manage'); i public.payroll_items%rowtype; st public.payroll_status;
begin
  select * into i from public.payroll_items where id = p_item and org_id = v_org;
  if not found then raise exception 'Không tìm thấy khoản' using errcode = 'P0002'; end if;
  select p.status into st from public.payroll_lines l join public.payroll_periods p on p.id = l.period_id where l.id = i.line_id;
  if st <> 'draft' then raise exception 'Chỉ sửa được khi kỳ lương ở trạng thái nháp' using errcode = '22023'; end if;
  if not i.is_manual then raise exception 'Khoản tự động — sửa ở hồ sơ lương rồi tính lại' using errcode = '22023'; end if;
  delete from public.payroll_items where id = p_item;
  perform app.recalc_line(i.line_id);
end $$;

create or replace function public.payroll_step(p_period uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); pr public.payroll_periods%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into pr from public.payroll_periods where id = p_period and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy kỳ lương' using errcode = 'P0002'; end if;
  if p_action = 'check' then
    if not app.has_permission('payroll.manage') then raise exception 'Chỉ nhân sự được kiểm tra bảng lương' using errcode = '42501'; end if;
    if pr.status <> 'draft' then raise exception 'Kỳ lương không ở trạng thái nháp' using errcode = '22023'; end if;
    if not exists (select 1 from public.payroll_lines where period_id = pr.id) then raise exception 'Bảng lương chưa có dòng nào' using errcode = '22023'; end if;
    update public.payroll_periods set status = 'checked', checked_by = auth.uid(), checked_at = now(), note = coalesce(v_note, note) where id = pr.id;
    perform app.notify_permission(v_org, 'payroll.approve', 'payroll_checked', 'Bảng lương ' || pr.month || '/' || pr.year || ' đã kiểm tra, chờ kế toán duyệt', '/luong/' || pr.id::text);
  elsif p_action = 'approve' then
    if not app.has_permission('payroll.approve') then raise exception 'Chỉ kế toán được duyệt bảng lương' using errcode = '42501'; end if;
    if pr.status <> 'checked' then raise exception 'Bảng lương chưa được nhân sự kiểm tra' using errcode = '22023'; end if;
    if pr.checked_by = auth.uid() and not app.has_role('system_admin') then raise exception 'Người kiểm tra không được tự duyệt' using errcode = '42501'; end if;
    update public.payroll_periods set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = pr.id;
    perform app.notify_permission(v_org, 'payroll.manage', 'payroll_approved', 'Bảng lương ' || pr.month || '/' || pr.year || ' đã được duyệt', '/luong/' || pr.id::text);
  elsif p_action = 'pay' then
    if not app.has_permission('payroll.approve') then raise exception 'Chỉ kế toán được xác nhận chi trả' using errcode = '42501'; end if;
    if pr.status <> 'approved' then raise exception 'Bảng lương chưa được duyệt' using errcode = '22023'; end if;
    update public.payroll_periods set status = 'paid', paid_by = auth.uid(), paid_on = app.today() where id = pr.id;
  elsif p_action = 'reopen' then
    if pr.status = 'draft' then return; end if;
    if pr.status = 'paid' then raise exception 'Bảng lương đã chi trả — không mở lại được' using errcode = '22023'; end if;
    if not (app.has_permission('payroll.approve') or (pr.status = 'checked' and app.has_permission('payroll.manage'))) then raise exception 'Bạn không có quyền mở lại kỳ lương' using errcode = '42501'; end if;
    if v_note is null then raise exception 'Cần nhập lý do mở lại' using errcode = '22023'; end if;
    update public.payroll_periods set status = 'draft', checked_by = null, checked_at = null, approved_by = null, approved_at = null, note = v_note where id = pr.id;
  else
    raise exception 'Hành động không hợp lệ' using errcode = '22023';
  end if;
  perform app.write_audit(v_org, 'payroll.' || p_action, 'payroll', pr.id, jsonb_build_object('year', pr.year, 'month', pr.month));
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date) from authenticated;
