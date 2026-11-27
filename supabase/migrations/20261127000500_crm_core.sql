-- =====================================================================
-- 0500 · Lõi CRM theo mô hình CRM Apollo:
--   Lead → Tài khoản + Liên hệ → Cơ hội → Báo giá → Hợp đồng → Đơn hàng
--   Sản phẩm, danh mục, đơn vị, bảng giá; Công việc; Nhân sự (chức vụ, quản lý phòng ban).
-- Khác CRM gốc có chủ ý: báo giá / hợp đồng / đơn hàng CHỤP LẠI số liệu khi tạo
-- (CRM gốc lấy số liệu sống từ cơ hội nên đổi sản phẩm là số trên hợp đồng cũ đổi theo).
-- Ghi chú đơn giản hóa: SĐT/email/website lưu dạng mảng trong cột; chủ sở hữu 1 người (owner_id).
-- =====================================================================
create type public.lead_status as enum ('new', 'contacted', 'working', 'qualified', 'nurturing', 'unqualified', 'converted');
create type public.lead_rating as enum ('hot', 'warm', 'cold');
create type public.account_type as enum ('customer', 'competitor', 'partner');
create type public.opportunity_stage as enum ('needs_analysis', 'presentation', 'negotiation', 'won', 'lost');
create type public.opportunity_forecast as enum ('pipeline', 'best_case', 'commit', 'closed', 'omitted');
create type public.quote_status as enum ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired');
create type public.contract_status as enum ('draft', 'pending', 'active', 'expired', 'terminated', 'cancelled');
create type public.order_status as enum ('draft', 'active', 'cancelled');
create type public.task_type as enum ('to_do', 'call', 'email', 'meeting', 'appointment', 'visit', 'other');
create type public.task_status as enum ('not_started', 'in_progress', 'completed', 'deferred', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

-- Quyền CRM
create or replace function app.can_crm(p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_user() and not app.has_role('collaborator')
     and app.has_permission(case when p_write then 'crm.manage' else 'crm.view' end)
$$;

-- ---------------------------------------------------------------------
-- Danh mục dùng chung
-- ---------------------------------------------------------------------
create table public.industries (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0), is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz, unique (org_id, id));
create table public.lead_sources (like public.industries including all);
create table public.product_categories (like public.industries including all);
create table public.product_units (like public.industries including all);
alter table public.lead_sources add foreign key (org_id) references public.organizations(id) on delete cascade;
alter table public.product_categories add foreign key (org_id) references public.organizations(id) on delete cascade;
alter table public.product_units add foreign key (org_id) references public.organizations(id) on delete cascade;
alter table public.lead_sources add foreign key (created_by) references auth.users(id) on delete set null;
alter table public.product_categories add foreign key (created_by) references auth.users(id) on delete set null;
alter table public.product_units add foreign key (created_by) references auth.users(id) on delete set null;
-- "like … including all" sao chép cả mặc định nên id/created_by đã có giá trị mặc định

create table public.positions (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id));
create table public.user_departments_positions (
  org_id uuid not null, user_id uuid not null, department_id uuid not null, position_id uuid,
  sort_order int not null default 0,
  primary key (user_id, department_id),
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  foreign key (org_id, department_id) references public.departments(org_id, id) on delete cascade,
  foreign key (org_id, position_id) references public.positions(org_id, id) on delete set null (position_id));
create table public.department_managers (
  org_id uuid not null, department_id uuid not null, user_id uuid not null, position_id uuid,
  primary key (department_id, user_id),
  foreign key (org_id, department_id) references public.departments(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade,
  foreign key (org_id, position_id) references public.positions(org_id, id) on delete set null (position_id));

-- ---------------------------------------------------------------------
-- Lead, tài khoản, liên hệ
-- ---------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type public.account_type not null default 'customer',
  parent_account_id uuid, industry_id uuid, employee_count int check (employee_count is null or employee_count >= 0),
  annual_revenue numeric(18,2) check (annual_revenue is null or annual_revenue >= 0),
  phones text[] not null default '{}', emails text[] not null default '{}', websites text[] not null default '{}',
  billing_address text, shipping_address text, tax_code text, note text,
  source_lead_id uuid, owner_id uuid default auth.uid(),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, parent_account_id) references public.accounts(org_id, id) on delete set null (parent_account_id),
  foreign key (org_id, industry_id) references public.industries(org_id, id) on delete set null (industry_id),
  foreign key (org_id, owner_id) references public.profiles(org_id, id) on delete set null (owner_id));

create table public.contacts (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  salutation text, first_name text not null default '', last_name text not null check (length(trim(last_name)) > 0),
  account_id uuid, job_title text, phones text[] not null default '{}', emails text[] not null default '{}',
  date_of_birth date, do_not_call boolean not null default false, note text,
  source_lead_id uuid, owner_id uuid default auth.uid(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, account_id) references public.accounts(org_id, id) on delete set null (account_id),
  foreign key (org_id, owner_id) references public.profiles(org_id, id) on delete set null (owner_id));

create table public.leads (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  title text, first_name text not null default '', last_name text not null check (length(trim(last_name)) > 0),
  job_title text, company text, industry_id uuid, annual_revenue numeric(18,2) check (annual_revenue is null or annual_revenue >= 0),
  employee_count int check (employee_count is null or employee_count >= 0),
  status public.lead_status not null default 'new', rating public.lead_rating not null default 'warm',
  source_id uuid, phones text[] not null default '{}', emails text[] not null default '{}', websites text[] not null default '{}',
  address text, note text, owner_id uuid default auth.uid(),
  is_converted boolean not null default false,
  converted_account_id uuid, converted_contact_id uuid, converted_opportunity_id uuid, converted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, industry_id) references public.industries(org_id, id) on delete set null (industry_id),
  foreign key (org_id, source_id) references public.lead_sources(org_id, id) on delete set null (source_id),
  foreign key (org_id, owner_id) references public.profiles(org_id, id) on delete set null (owner_id),
  foreign key (org_id, converted_account_id) references public.accounts(org_id, id) on delete set null (converted_account_id),
  foreign key (org_id, converted_contact_id) references public.contacts(org_id, id) on delete set null (converted_contact_id));
alter table public.accounts add foreign key (org_id, source_lead_id) references public.leads(org_id, id) on delete set null (source_lead_id);
alter table public.contacts add foreign key (org_id, source_lead_id) references public.leads(org_id, id) on delete set null (source_lead_id);

-- ---------------------------------------------------------------------
-- Sản phẩm, bảng giá
-- ---------------------------------------------------------------------
create table public.price_books (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0), description text, is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id));
create table public.products (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0), code text, category_id uuid, unit_id uuid, description text,
  list_price numeric(16,2) not null default 0 check (list_price >= 0), is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, category_id) references public.product_categories(org_id, id) on delete set null (category_id),
  foreign key (org_id, unit_id) references public.product_units(org_id, id) on delete set null (unit_id));
create table public.price_book_products (
  id uuid primary key default gen_random_uuid(), org_id uuid not null,
  price_book_id uuid not null, product_id uuid not null,
  unit_price numeric(16,2) not null check (unit_price >= 0),
  fee_percent numeric(5,2) not null default 0 check (fee_percent between 0 and 100),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  unique (price_book_id, product_id),
  foreign key (org_id, price_book_id) references public.price_books(org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products(org_id, id) on delete cascade);

-- ---------------------------------------------------------------------
-- Cơ hội, báo giá, hợp đồng, đơn hàng
-- ---------------------------------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0), account_id uuid not null, contact_id uuid, price_book_id uuid,
  stage public.opportunity_stage not null default 'needs_analysis',
  win_probability numeric(5,2) not null default 20 check (win_probability between 0 and 100),
  forecast public.opportunity_forecast not null default 'pipeline',
  expected_revenue numeric(18,2) not null default 0 check (expected_revenue >= 0),
  expected_close_date date, lost_reason text, current_situation text, needs text, solution text,
  source_lead_id uuid, owner_id uuid default auth.uid(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, account_id) references public.accounts(org_id, id) on delete restrict,
  foreign key (org_id, contact_id) references public.contacts(org_id, id) on delete set null (contact_id),
  foreign key (org_id, price_book_id) references public.price_books(org_id, id) on delete set null (price_book_id),
  foreign key (org_id, source_lead_id) references public.leads(org_id, id) on delete set null (source_lead_id),
  foreign key (org_id, owner_id) references public.profiles(org_id, id) on delete set null (owner_id));
alter table public.leads add foreign key (org_id, converted_opportunity_id) references public.opportunities(org_id, id) on delete set null (converted_opportunity_id);

create table public.opportunity_products (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, opportunity_id uuid not null, product_id uuid,
  description text not null check (length(trim(description)) > 0), unit text,
  unit_price numeric(16,2) not null check (unit_price >= 0), quantity numeric(12,2) not null check (quantity > 0),
  fee_percent numeric(5,2) not null default 0 check (fee_percent between 0 and 100),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  total numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (org_id, opportunity_id) references public.opportunities(org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products(org_id, id) on delete set null (product_id));
create index opportunity_products_opp_idx on public.opportunity_products(opportunity_id);

create or replace function app.opp_line_total() returns trigger language plpgsql as $$
begin
  new.total := round(new.unit_price * new.quantity * (1 + new.fee_percent / 100) * (1 + new.tax_percent / 100), 2);
  return new;
end $$;
create trigger opp_lines_total before insert or update on public.opportunity_products for each row execute function app.opp_line_total();

create or replace function app.opp_sync_revenue() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_opp uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  update public.opportunities o set expected_revenue = (select coalesce(sum(total), 0) from public.opportunity_products where opportunity_id = v_opp)
  where o.id = v_opp and exists (select 1 from public.opportunity_products where opportunity_id = v_opp);
  return null;
end $$;
create trigger opp_lines_sync after insert or update or delete on public.opportunity_products for each row execute function app.opp_sync_revenue();

create table public.quotes (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, code text not null,
  opportunity_id uuid not null, owner_id uuid default auth.uid(), version int not null default 1,
  status public.quote_status not null default 'draft', expiry_date date,
  subtotal numeric(16,2) not null default 0, tax_amount numeric(16,2) not null default 0, total numeric(16,2) not null default 0,
  recipient_name text, billing_address text, shipping_address text, note text, accepted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id), unique (org_id, code),
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (org_id, opportunity_id) references public.opportunities(org_id, id) on delete cascade);
create table public.quote_items (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, quote_id uuid not null, position int not null default 0,
  description text not null, unit text, quantity numeric(12,2) not null, unit_price numeric(16,2) not null,
  fee_percent numeric(5,2) not null default 0, tax_percent numeric(5,2) not null default 0, amount numeric(16,2) not null,
  foreign key (org_id, quote_id) references public.quotes(org_id, id) on delete cascade);

create table public.contracts (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, code text not null,
  opportunity_id uuid not null, quote_id uuid, status public.contract_status not null default 'draft',
  effective_date date, expiry_date date, duration_months int check (duration_months is null or duration_months > 0),
  initial_value numeric(16,2) not null check (initial_value >= 0), current_value numeric(16,2) not null check (current_value >= 0),
  customer_signed_by text, customer_signed_date date, company_signed_by_id uuid, company_signed_date date,
  file_url text, note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id), unique (org_id, code),
  check (expiry_date is null or effective_date is null or expiry_date >= effective_date),
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (org_id, opportunity_id) references public.opportunities(org_id, id) on delete cascade,
  foreign key (org_id, quote_id) references public.quotes(org_id, id) on delete set null (quote_id),
  foreign key (org_id, company_signed_by_id) references public.profiles(org_id, id) on delete set null (company_signed_by_id));
create unique index contracts_one_open_per_opp on public.contracts(opportunity_id) where status in ('draft', 'pending', 'active') and deleted_at is null;

create table public.orders (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, code text not null, contract_id uuid not null,
  owner_id uuid default auth.uid(), status public.order_status not null default 'draft', activated_at timestamptz,
  total numeric(16,2) not null default 0, shipping_address text, billing_address text, note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id), unique (org_id, code),
  foreign key (org_id) references public.organizations(id) on delete cascade,
  foreign key (org_id, contract_id) references public.contracts(org_id, id) on delete restrict);

-- ---------------------------------------------------------------------
-- Công việc
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) > 0), task_type public.task_type not null default 'to_do',
  status public.task_status not null default 'not_started', priority public.task_priority not null default 'normal',
  scheduled_at timestamptz, reminder_at timestamptz, remind_before_minutes int check (remind_before_minutes is null or remind_before_minutes >= 0),
  content text, related_type text check (related_type in ('lead', 'account', 'contact', 'opportunity', 'project', 'video')), related_id uuid,
  reminded_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (org_id, id));
create table public.task_assignees (
  org_id uuid not null, task_id uuid not null, user_id uuid not null, primary key (task_id, user_id),
  foreign key (org_id, task_id) references public.tasks(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.profiles(org_id, id) on delete cascade);
create index tasks_org_sched_idx on public.tasks(org_id, scheduled_at) where deleted_at is null;

-- touch updated_at
do $$
declare t text;
begin
  foreach t in array array['industries','lead_sources','product_categories','product_units','positions','accounts','contacts','leads','price_books',
                           'products','opportunities','quotes','contracts','orders','tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS: đọc theo crm.view, ghi trực tiếp theo crm.manage (bảng danh mục & dữ liệu nhập tay);
--      báo giá / hợp đồng / đơn hàng chỉ ghi qua RPC để giữ quy trình.
-- ---------------------------------------------------------------------
do $$
declare t text; direct text[] := array['industries','lead_sources','product_categories','product_units','accounts','contacts','leads','price_books','products','opportunities','tasks'];
        readonly text[] := array['quotes','contracts','orders'];
begin
  foreach t in array direct || readonly loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (org_id = app.current_org_id() and deleted_at is null and app.can_crm(false))', t || '_sel', t);
  end loop;
  foreach t in array direct loop
    execute format('create policy %I on public.%I for insert to authenticated with check (org_id = app.current_org_id() and app.can_crm(true))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (org_id = app.current_org_id() and app.can_crm(true)) with check (org_id = app.current_org_id() and app.can_crm(true))', t || '_upd', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array readonly loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Bảng con (không có deleted_at)
do $$
declare t text;
begin
  foreach t in array array['opportunity_products','price_book_products','quote_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (org_id = app.current_org_id() and app.can_crm(false))', t || '_sel', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    if t <> 'quote_items' then
      execute format('create policy %I on public.%I for insert to authenticated with check (org_id = app.current_org_id() and app.can_crm(true))', t || '_ins', t);
      execute format('create policy %I on public.%I for update to authenticated using (org_id = app.current_org_id() and app.can_crm(true)) with check (org_id = app.current_org_id() and app.can_crm(true))', t || '_upd', t);
      execute format('create policy %I on public.%I for delete to authenticated using (org_id = app.current_org_id() and app.can_crm(true))', t || '_del', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    else
      execute format('grant select on public.%I to authenticated', t);
    end if;
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Công việc: người được giao đọc được việc của mình
create policy tasks_sel_assignee on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and not app.has_role('collaborator')
         and exists (select 1 from public.task_assignees a where a.task_id = tasks.id and a.user_id = auth.uid()));
alter table public.task_assignees enable row level security;
create policy task_assignees_sel on public.task_assignees for select to authenticated using (org_id = app.current_org_id() and not app.has_role('collaborator'));
create policy task_assignees_ins on public.task_assignees for insert to authenticated with check (org_id = app.current_org_id() and app.can_crm(true));
create policy task_assignees_del on public.task_assignees for delete to authenticated using (org_id = app.current_org_id() and app.can_crm(true));
revoke all on public.task_assignees from anon, authenticated;
grant select, insert, delete on public.task_assignees to authenticated;
grant all on public.task_assignees to service_role;
-- Người được giao cũng cập nhật được trạng thái việc của mình (qua RPC bên dưới)

-- Nhân sự: chức vụ & quan hệ phòng ban
alter table public.positions enable row level security;
alter table public.user_departments_positions enable row level security;
alter table public.department_managers enable row level security;
create policy positions_sel on public.positions for select to authenticated using (org_id = app.current_org_id() and deleted_at is null);
create policy positions_wr on public.positions for all to authenticated using (org_id = app.current_org_id() and app.has_permission('users.manage')) with check (org_id = app.current_org_id() and app.has_permission('users.manage'));
create policy udp_sel on public.user_departments_positions for select to authenticated using (org_id = app.current_org_id());
create policy udp_wr on public.user_departments_positions for all to authenticated using (org_id = app.current_org_id() and app.has_permission('users.manage')) with check (org_id = app.current_org_id() and app.has_permission('users.manage'));
create policy dm_sel on public.department_managers for select to authenticated using (org_id = app.current_org_id());
create policy dm_wr on public.department_managers for all to authenticated using (org_id = app.current_org_id() and app.has_permission('users.manage')) with check (org_id = app.current_org_id() and app.has_permission('users.manage'));
revoke all on public.positions, public.user_departments_positions, public.department_managers from anon, authenticated;
grant select, insert, update, delete on public.positions, public.user_departments_positions, public.department_managers to authenticated;
grant all on public.positions, public.user_departments_positions, public.department_managers to service_role;
-- Phòng ban: quản trị được thêm/sửa
create policy departments_wr on public.departments for all to authenticated using (org_id = app.current_org_id() and app.has_permission('users.manage')) with check (org_id = app.current_org_id() and app.has_permission('users.manage'));
grant insert, update, delete on public.departments to authenticated;

-- ---------------------------------------------------------------------
-- Danh mục mặc định cho CRM
-- ---------------------------------------------------------------------
create or replace function public.seed_crm_defaults(p_org uuid) returns void language sql security definer set search_path = '' as $$
  insert into public.industries (org_id, name, created_by) select p_org, n, null from unnest(array['Truyền thông / Quảng cáo','Thương mại điện tử','Giáo dục','Du lịch','Bất động sản','Tài chính / Ngân hàng','Sản xuất','Y tế','Công nghệ','Khác']) n
    where not exists (select 1 from public.industries where org_id = p_org);
  insert into public.lead_sources (org_id, name, created_by) select p_org, n, null from unnest(array['Website','Facebook','YouTube','Giới thiệu','Sự kiện','Gọi điện','Email','Khác']) n
    where not exists (select 1 from public.lead_sources where org_id = p_org);
  insert into public.product_categories (org_id, name, created_by) select p_org, n, null from unnest(array['Sản xuất video','Hậu kỳ','Quản lý kênh','Kịch bản / nội dung','Quảng cáo / hợp tác thương hiệu']) n
    where not exists (select 1 from public.product_categories where org_id = p_org);
  insert into public.product_units (org_id, name, created_by) select p_org, n, null from unnest(array['Video','Phút','Gói','Tháng','Giờ','Ngày','Kênh']) n
    where not exists (select 1 from public.product_units where org_id = p_org);
  insert into public.positions (org_id, name) select p_org, n from unnest(array['Giám đốc','Trưởng phòng','Trưởng nhóm','Content','Editor','Thiết kế','Kế toán','Nhân sự']) n
    where not exists (select 1 from public.positions where org_id = p_org);
$$;
revoke execute on function public.seed_crm_defaults(uuid) from public, anon, authenticated;
select public.seed_crm_defaults(id) from public.organizations;
