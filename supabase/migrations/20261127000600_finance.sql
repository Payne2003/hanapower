-- =====================================================================
-- 0600 · Tài chính: thu, chi (duyệt → thanh toán), tạm ứng, công nợ
--   Mọi khoản gắn dự án được; chi phí có trạng thái duyệt và trạng thái thanh toán riêng.
--   Công nợ phải thu = mốc đã nghiệm thu / đã xuất hóa đơn nhưng chưa thu.
--   Công nợ phải trả = chi phí đã duyệt nhưng chưa thanh toán.
-- =====================================================================
create type public.approval_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.expense_payment as enum ('unpaid', 'paid');
create type public.advance_status as enum ('requested', 'approved', 'rejected', 'disbursed', 'settled');
create type public.payee_type as enum ('employee', 'freelancer', 'vendor', 'other');

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  unique (org_id, id), unique (org_id, name)
);
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  unique (org_id, id), unique (org_id, name)
);

create table public.incomes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  occurred_on   date not null,
  project_id    uuid,
  channel_id    uuid,
  source_id     uuid,
  milestone_id  uuid unique,
  amount        numeric(16,2) not null check (amount > 0),
  description   text,
  invoice_no    text,
  payment_method text,
  status        text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancel_reason text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id),
  foreign key (org_id, channel_id) references public.channels(org_id, id) on delete set null (channel_id),
  foreign key (org_id, source_id) references public.income_sources(org_id, id) on delete set null (source_id),
  foreign key (org_id, milestone_id) references public.project_milestones(org_id, id) on delete set null (milestone_id)
);
create index incomes_org_date_idx on public.incomes(org_id, occurred_on desc);
create index incomes_project_idx on public.incomes(project_id);

create table public.advances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  user_id       uuid not null,
  project_id    uuid,
  amount        numeric(16,2) not null check (amount > 0),
  purpose       text not null check (length(trim(purpose)) > 0),
  status        public.advance_status not null default 'requested',
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  reject_reason text,
  disbursed_on  date,
  disbursed_by  uuid references auth.users(id) on delete set null,
  settled_on    date,
  settled_amount numeric(16,2) not null default 0,   -- tổng chi phí đã duyệt gắn với khoản ứng
  refund_amount numeric(16,2) not null default 0,    -- tiền nhân viên hoàn lại
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete restrict,
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id)
);
create index advances_user_idx on public.advances(user_id, status);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  occurred_on   date not null,
  project_id    uuid,
  video_id      uuid,
  category_id   uuid,
  payee_type    public.payee_type not null default 'other',
  payee_name    text,
  advance_id    uuid,
  amount        numeric(16,2) not null check (amount > 0),
  due_date      date,
  description   text,
  invoice_url   text,
  approval      public.approval_status not null default 'draft',
  requested_by  uuid references auth.users(id) on delete set null,
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  reject_reason text,
  payment       public.expense_payment not null default 'unpaid',
  paid_on       date,
  paid_by       uuid references auth.users(id) on delete set null,
  payment_method text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, id),
  check (payment = 'unpaid' or approval = 'approved'),
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id),
  foreign key (org_id, video_id) references public.videos(org_id, id) on delete set null (video_id),
  foreign key (org_id, category_id) references public.expense_categories(org_id, id) on delete set null (category_id),
  foreign key (org_id, advance_id) references public.advances(org_id, id) on delete set null (advance_id)
);
create index expenses_org_date_idx on public.expenses(org_id, occurred_on desc) where deleted_at is null;
create index expenses_project_idx on public.expenses(project_id) where deleted_at is null;
create index expenses_status_idx on public.expenses(org_id, approval, payment) where deleted_at is null;

create trigger incomes_touch before update on public.incomes for each row execute function app.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function app.touch_updated_at();
create trigger advances_touch before update on public.advances for each row execute function app.touch_updated_at();

-- Danh mục mặc định (gọi khi tạo doanh nghiệp; không cấp cho người dùng)
create or replace function public.seed_finance_defaults(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.income_sources (org_id, name)
  select p_org, n from unnest(array['YouTube AdSense', 'Tài trợ / hợp tác thương hiệu', 'Sản xuất video theo đơn hàng', 'Hậu kỳ', 'Quản lý kênh cho khách hàng', 'Khác']) n
  on conflict do nothing;
  insert into public.expense_categories (org_id, name)
  select p_org, n from unnest(array['Thù lao cộng tác viên', 'Công cụ AI / phần mềm', 'Thiết bị / thuê thiết bị', 'Di chuyển / ăn ở',
    'Giọng đọc / thu âm', 'Bản quyền nhạc / footage', 'Marketing / quảng cáo', 'Văn phòng / hành chính', 'Khác']) n
  on conflict do nothing;
$$;
revoke execute on function public.seed_finance_defaults(uuid) from public, anon, authenticated;
select public.seed_finance_defaults(id) from public.organizations;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.income_sources     enable row level security;
alter table public.expense_categories enable row level security;
alter table public.incomes            enable row level security;
alter table public.expenses           enable row level security;
alter table public.advances           enable row level security;

create policy income_sources_select on public.income_sources for select to authenticated
  using (org_id = app.current_org_id() and not app.has_role('collaborator'));
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (org_id = app.current_org_id() and not app.has_role('collaborator'));
create policy incomes_select on public.incomes for select to authenticated
  using (org_id = app.current_org_id() and (app.has_permission('finance.view') or (project_id is not null and app.can_manage_project(project_id))));
create policy expenses_select on public.expenses for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null
         and (app.has_permission('finance.view') or requested_by = auth.uid() or (project_id is not null and app.can_manage_project(project_id))));
create policy advances_select on public.advances for select to authenticated
  using (org_id = app.current_org_id() and (app.has_permission('finance.view') or user_id = auth.uid() or (project_id is not null and app.can_manage_project(project_id))));

revoke all on public.income_sources, public.expense_categories, public.incomes, public.expenses, public.advances from anon, authenticated;
grant select on public.income_sources, public.expense_categories, public.incomes, public.expenses, public.advances to authenticated;
grant all on public.income_sources, public.expense_categories, public.incomes, public.expenses, public.advances to service_role;

-- ---------------------------------------------------------------------
-- RPC: danh mục
-- ---------------------------------------------------------------------
create or replace function public.save_finance_category(p_kind text, p_id uuid, p_name text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền quản lý danh mục tài chính' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên danh mục' using errcode = '22023'; end if;
  if p_kind = 'income' then
    if p_id is null then insert into public.income_sources (org_id, name) values (v_org, trim(p_name)) returning id into v_id;
    else update public.income_sources set name = trim(p_name), is_active = coalesce(p_active, true) where id = p_id and org_id = v_org returning id into v_id; end if;
  elsif p_kind = 'expense' then
    if p_id is null then insert into public.expense_categories (org_id, name) values (v_org, trim(p_name)) returning id into v_id;
    else update public.expense_categories set name = trim(p_name), is_active = coalesce(p_active, true) where id = p_id and org_id = v_org returning id into v_id; end if;
  else raise exception 'Loại danh mục không hợp lệ' using errcode = '22023'; end if;
  if v_id is null then raise exception 'Không tìm thấy danh mục' using errcode = 'P0002'; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: thu
-- ---------------------------------------------------------------------
create or replace function public.record_income(
  p_occurred_on date, p_amount numeric, p_source_id uuid default null, p_project_id uuid default null,
  p_channel_id uuid default null, p_description text default null, p_invoice_no text default null, p_method text default null
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
  insert into public.incomes (org_id, occurred_on, project_id, channel_id, source_id, amount, description, invoice_no, payment_method, created_by)
  values (v_org, p_occurred_on, p_project_id, p_channel_id, p_source_id, p_amount, nullif(trim(coalesce(p_description, '')), ''),
          nullif(trim(coalesce(p_invoice_no, '')), ''), nullif(trim(coalesce(p_method, '')), ''), auth.uid())
  returning id into v_id;
  perform app.write_audit(v_org, 'income.create', 'income', v_id, jsonb_build_object('amount', p_amount, 'project', p_project_id));
  return v_id;
end $$;

create or replace function public.cancel_income(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.incomes%rowtype;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền hủy khoản thu' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cần nhập lý do hủy' using errcode = '22023'; end if;
  select * into i from public.incomes where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy khoản thu' using errcode = 'P0002'; end if;
  if i.status = 'cancelled' then return; end if;
  update public.incomes set status = 'cancelled', cancel_reason = trim(p_reason) where id = i.id;
  if i.milestone_id is not null then
    update public.project_milestones set payment = 'invoiced', paid_at = null where id = i.milestone_id;
  end if;
  perform app.write_audit(i.org_id, 'income.cancel', 'income', i.id, jsonb_build_object('amount', i.amount, 'reason', p_reason));
end $$;

-- Thu tiền của một mốc thanh toán: tạo khoản thu liên kết, đóng mốc
create or replace function public.milestone_pay(p_id uuid, p_paid_on date default null, p_method text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.project_milestones%rowtype; pr public.projects%rowtype; v_src uuid; v_inc uuid; v_date date := coalesce(p_paid_on, app.today());
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền ghi nhận thanh toán' using errcode = '42501'; end if;
  select * into m from public.project_milestones where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy mốc' using errcode = 'P0002'; end if;
  if m.payment = 'paid' then
    select id into v_inc from public.incomes where milestone_id = m.id and status = 'confirmed';
    return v_inc;
  end if;
  if m.amount <= 0 then raise exception 'Mốc không có số tiền để thu' using errcode = '22023'; end if;
  if v_date > app.today() then raise exception 'Ngày thu không được ở tương lai' using errcode = '22023'; end if;
  select * into pr from public.projects where id = m.project_id;
  select id into v_src from public.income_sources where org_id = m.org_id and name = 'Sản xuất video theo đơn hàng' limit 1;
  delete from public.incomes where milestone_id = m.id and status = 'cancelled';
  insert into public.incomes (org_id, occurred_on, project_id, source_id, milestone_id, amount, description, invoice_no, payment_method, created_by)
  values (m.org_id, v_date, m.project_id, v_src, m.id, m.amount, pr.code || ' – ' || m.name, m.invoice_no, nullif(trim(coalesce(p_method, '')), ''), auth.uid())
  returning id into v_inc;
  update public.project_milestones set payment = 'paid', paid_at = v_date::timestamptz where id = m.id;
  perform app.write_audit(m.org_id, 'milestone.paid', 'milestone', m.id, jsonb_build_object('project', pr.code, 'amount', m.amount));
  perform app.notify_link(m.org_id, pr.manager_id, 'paid', 'Đã thu mốc "' || m.name || '" của ' || pr.code, '/du-an/' || pr.id::text || '?tab=nghiem-thu');
  return v_inc;
end $$;

-- ---------------------------------------------------------------------
-- RPC: chi phí
-- ---------------------------------------------------------------------
create or replace function app.check_expense_scope(p_project_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_project_id is null then
    if not app.has_permission('finance.manage') then raise exception 'Chi phí không gắn dự án chỉ kế toán được ghi nhận' using errcode = '42501'; end if;
  elsif not (app.can_view_project(p_project_id) or app.has_permission('finance.manage')) then
    raise exception 'Bạn không thuộc dự án này' using errcode = '42501';
  end if;
end $$;

create or replace function public.create_expense(
  p_occurred_on date, p_amount numeric, p_category_id uuid default null, p_project_id uuid default null, p_video_id uuid default null,
  p_payee_type public.payee_type default 'other', p_payee_name text default null, p_description text default null,
  p_due_date date default null, p_invoice_url text default null, p_advance_id uuid default null, p_submit boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; a public.advances%rowtype;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền tạo chi phí' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = '22023'; end if;
  if p_occurred_on is null then raise exception 'Nhập ngày phát sinh' using errcode = '22023'; end if;
  if p_invoice_url is not null and trim(p_invoice_url) <> '' and trim(p_invoice_url) !~* '^https?://' then
    raise exception 'Link chứng từ phải bắt đầu bằng http:// hoặc https://' using errcode = '22023';
  end if;
  perform app.check_expense_scope(p_project_id);
  if p_advance_id is not null then
    select * into a from public.advances where id = p_advance_id and org_id = v_org;
    if not found or a.user_id <> auth.uid() or a.status <> 'disbursed' then
      raise exception 'Chỉ gắn được vào khoản tạm ứng của bạn đã được giải ngân' using errcode = '22023';
    end if;
  end if;
  insert into public.expenses (org_id, occurred_on, project_id, video_id, category_id, payee_type, payee_name, advance_id, amount, due_date,
                               description, invoice_url, requested_by, approval)
  values (v_org, p_occurred_on, p_project_id, p_video_id, p_category_id, coalesce(p_payee_type, 'other'), nullif(trim(coalesce(p_payee_name, '')), ''),
          p_advance_id, p_amount, p_due_date, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_invoice_url, '')), ''),
          auth.uid(), (case when coalesce(p_submit, false) then 'submitted' else 'draft' end)::public.approval_status)
  returning id into v_id;
  if coalesce(p_submit, false) then
    perform app.notify_permission(v_org, 'finance.approve', 'expense_submitted', 'Có đề nghị chi ' || p_amount::bigint::text || ' đ chờ duyệt', '/chi-phi');
  end if;
  return v_id;
end $$;

create or replace function public.update_expense(
  p_id uuid, p_occurred_on date, p_amount numeric, p_category_id uuid default null, p_description text default null,
  p_due_date date default null, p_invoice_url text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy chi phí' using errcode = 'P0002'; end if;
  if e.requested_by <> auth.uid() or e.approval not in ('draft', 'rejected') then
    raise exception 'Chỉ người đề nghị sửa được chi phí ở trạng thái nháp hoặc bị từ chối' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = '22023'; end if;
  if p_invoice_url is not null and trim(p_invoice_url) <> '' and trim(p_invoice_url) !~* '^https?://' then
    raise exception 'Link chứng từ phải bắt đầu bằng http:// hoặc https://' using errcode = '22023';
  end if;
  update public.expenses set occurred_on = p_occurred_on, amount = p_amount, category_id = p_category_id,
    description = nullif(trim(coalesce(p_description, '')), ''), due_date = p_due_date, invoice_url = nullif(trim(coalesce(p_invoice_url, '')), ''),
    approval = 'draft', reject_reason = null where id = e.id;
end $$;

create or replace function public.submit_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy chi phí' using errcode = 'P0002'; end if;
  if e.requested_by <> auth.uid() then raise exception 'Chỉ người đề nghị được gửi duyệt' using errcode = '42501'; end if;
  if e.approval = 'submitted' then return; end if;
  if e.approval <> 'draft' then raise exception 'Chi phí không ở trạng thái nháp' using errcode = '22023'; end if;
  update public.expenses set approval = 'submitted' where id = e.id;
  perform app.notify_permission(e.org_id, 'finance.approve', 'expense_submitted', 'Có đề nghị chi ' || e.amount::bigint::text || ' đ chờ duyệt', '/chi-phi');
end $$;

create or replace function app.sync_assignment_fee(p_expense uuid) returns void
language sql security definer set search_path = '' as $$ select 1 $$;  -- ghi đè ở 0700

create or replace function public.decide_expense(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into e from public.expenses where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy chi phí' using errcode = 'P0002'; end if;
  if not (app.has_permission('finance.approve') or (e.project_id is not null and app.can_manage_project(e.project_id))) then
    raise exception 'Bạn không có quyền duyệt chi phí này' using errcode = '42501';
  end if;
  if e.requested_by = auth.uid() and not app.has_role('system_admin') then
    raise exception 'Không tự duyệt khoản chi do chính mình đề nghị' using errcode = '42501';
  end if;
  if e.approval = 'approved' and p_decision = 'approve' then return; end if;
  if e.approval <> 'submitted' then raise exception 'Chi phí chưa được gửi duyệt' using errcode = '22023'; end if;
  if p_decision = 'approve' then
    update public.expenses set approval = 'approved', approved_by = auth.uid(), approved_at = now(), reject_reason = null where id = e.id;
    perform app.write_audit(e.org_id, 'expense.approve', 'expense', e.id, jsonb_build_object('amount', e.amount, 'project', e.project_id));
    perform app.notify_link(e.org_id, e.requested_by, 'expense_approved', 'Chi phí ' || e.amount::bigint::text || ' đ đã được duyệt', '/chi-phi');
    perform app.notify_permission(e.org_id, 'finance.manage', 'expense_to_pay', 'Chi phí ' || e.amount::bigint::text || ' đ đã duyệt, chờ thanh toán', '/chi-phi');
  elsif p_decision = 'reject' then
    if v_note is null then raise exception 'Cần ghi rõ lý do từ chối' using errcode = '22023'; end if;
    update public.expenses set approval = 'rejected', approved_by = auth.uid(), approved_at = now(), reject_reason = v_note where id = e.id;
    perform app.write_audit(e.org_id, 'expense.reject', 'expense', e.id, jsonb_build_object('reason', v_note));
    perform app.notify_link(e.org_id, e.requested_by, 'expense_rejected', 'Chi phí bị từ chối: ' || v_note, '/chi-phi');
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
  perform app.sync_assignment_fee(e.id);
end $$;

create or replace function public.pay_expense(p_id uuid, p_paid_on date default null, p_method text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype; v_date date := coalesce(p_paid_on, app.today());
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền ghi nhận thanh toán' using errcode = '42501'; end if;
  select * into e from public.expenses where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy chi phí' using errcode = 'P0002'; end if;
  if e.payment = 'paid' then return; end if;
  if e.approval <> 'approved' then raise exception 'Chi phí chưa được duyệt' using errcode = '22023'; end if;
  if v_date > app.today() then raise exception 'Ngày thanh toán không được ở tương lai' using errcode = '22023'; end if;
  update public.expenses set payment = 'paid', paid_on = v_date, paid_by = auth.uid(), payment_method = nullif(trim(coalesce(p_method, '')), '') where id = e.id;
  perform app.write_audit(e.org_id, 'expense.pay', 'expense', e.id, jsonb_build_object('amount', e.amount));
  perform app.notify_link(e.org_id, e.requested_by, 'expense_paid', 'Chi phí ' || e.amount::bigint::text || ' đ đã được thanh toán', '/chi-phi');
  perform app.sync_assignment_fee(e.id);
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy chi phí' using errcode = 'P0002'; end if;
  if e.payment = 'paid' then raise exception 'Chi phí đã thanh toán — không xóa được' using errcode = '22023'; end if;
  if not ((e.requested_by = auth.uid() and e.approval in ('draft', 'rejected')) or app.has_role('system_admin')) then
    raise exception 'Bạn không có quyền xóa chi phí này' using errcode = '42501';
  end if;
  update public.expenses set deleted_at = now() where id = e.id;
  perform app.write_audit(e.org_id, 'expense.delete', 'expense', e.id, jsonb_build_object('amount', e.amount));
end $$;

-- ---------------------------------------------------------------------
-- RPC: tạm ứng
-- ---------------------------------------------------------------------
create or replace function public.request_advance(p_project_id uuid, p_amount numeric, p_purpose text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền đề nghị tạm ứng' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_purpose, '')), '') is null then raise exception 'Nhập mục đích tạm ứng' using errcode = '22023'; end if;
  if p_project_id is not null and not app.can_view_project(p_project_id) then raise exception 'Bạn không thuộc dự án này' using errcode = '42501'; end if;
  insert into public.advances (org_id, user_id, project_id, amount, purpose) values (v_org, auth.uid(), p_project_id, p_amount, trim(p_purpose)) returning id into v_id;
  perform app.notify_permission(v_org, 'finance.approve', 'advance_requested', 'Có đề nghị tạm ứng ' || p_amount::bigint::text || ' đ chờ duyệt', '/chi-phi?tab=tam-ung');
  return v_id;
end $$;

create or replace function public.decide_advance(p_id uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.advances%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from public.advances where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy khoản tạm ứng' using errcode = 'P0002'; end if;
  if not (app.has_permission('finance.approve') or (a.project_id is not null and app.can_manage_project(a.project_id))) then
    raise exception 'Bạn không có quyền duyệt tạm ứng' using errcode = '42501';
  end if;
  if a.user_id = auth.uid() and not app.has_role('system_admin') then raise exception 'Không tự duyệt khoản tạm ứng của chính mình' using errcode = '42501'; end if;
  if a.status <> 'requested' then raise exception 'Khoản tạm ứng không ở trạng thái chờ duyệt' using errcode = '22023'; end if;
  if p_decision = 'approve' then
    update public.advances set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = a.id;
    perform app.notify_permission(a.org_id, 'finance.manage', 'advance_to_disburse', 'Tạm ứng ' || a.amount::bigint::text || ' đ đã duyệt, chờ giải ngân', '/chi-phi?tab=tam-ung');
    perform app.notify_link(a.org_id, a.user_id, 'advance_approved', 'Đề nghị tạm ứng ' || a.amount::bigint::text || ' đ đã được duyệt', '/chi-phi?tab=tam-ung');
  elsif p_decision = 'reject' then
    if v_note is null then raise exception 'Cần ghi rõ lý do từ chối' using errcode = '22023'; end if;
    update public.advances set status = 'rejected', approved_by = auth.uid(), approved_at = now(), reject_reason = v_note where id = a.id;
    perform app.notify_link(a.org_id, a.user_id, 'advance_rejected', 'Đề nghị tạm ứng bị từ chối: ' || v_note, '/chi-phi?tab=tam-ung');
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
  perform app.write_audit(a.org_id, 'advance.' || p_decision, 'advance', a.id, jsonb_build_object('amount', a.amount));
end $$;

create or replace function public.disburse_advance(p_id uuid, p_date date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.advances%rowtype;
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền giải ngân' using errcode = '42501'; end if;
  select * into a from public.advances where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy khoản tạm ứng' using errcode = 'P0002'; end if;
  if a.status = 'disbursed' then return; end if;
  if a.status <> 'approved' then raise exception 'Khoản tạm ứng chưa được duyệt' using errcode = '22023'; end if;
  update public.advances set status = 'disbursed', disbursed_on = coalesce(p_date, app.today()), disbursed_by = auth.uid() where id = a.id;
  perform app.write_audit(a.org_id, 'advance.disburse', 'advance', a.id, jsonb_build_object('amount', a.amount));
  perform app.notify_link(a.org_id, a.user_id, 'advance_disbursed', 'Tạm ứng ' || a.amount::bigint::text || ' đ đã được giải ngân', '/chi-phi?tab=tam-ung');
end $$;

-- Quyết toán: chi phí đã duyệt gắn với khoản ứng + tiền hoàn lại phải đủ bù số đã ứng
create or replace function public.settle_advance(p_id uuid, p_refund numeric default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.advances%rowtype; v_spent numeric(16,2);
begin
  if not app.has_permission('finance.manage') then raise exception 'Bạn không có quyền quyết toán tạm ứng' using errcode = '42501'; end if;
  select * into a from public.advances where id = p_id and org_id = app.current_org_id() for update;
  if not found then raise exception 'Không tìm thấy khoản tạm ứng' using errcode = 'P0002'; end if;
  if a.status = 'settled' then return; end if;
  if a.status <> 'disbursed' then raise exception 'Khoản tạm ứng chưa giải ngân' using errcode = '22023'; end if;
  if coalesce(p_refund, 0) < 0 then raise exception 'Tiền hoàn ứng không được âm' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into v_spent from public.expenses where advance_id = a.id and approval = 'approved' and deleted_at is null;
  if v_spent + coalesce(p_refund, 0) < a.amount then
    raise exception 'Còn lệch % đ: cần thêm chứng từ chi đã duyệt hoặc ghi nhận tiền hoàn ứng', (a.amount - v_spent - coalesce(p_refund, 0))::bigint using errcode = '22023';
  end if;
  update public.advances set status = 'settled', settled_on = app.today(), settled_amount = v_spent, refund_amount = coalesce(p_refund, 0) where id = a.id;
  perform app.write_audit(a.org_id, 'advance.settle', 'advance', a.id, jsonb_build_object('amount', a.amount, 'spent', v_spent, 'refund', p_refund));
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.sync_assignment_fee(uuid), app.check_expense_scope(uuid) from authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.seed_finance_defaults(uuid) from authenticated;
