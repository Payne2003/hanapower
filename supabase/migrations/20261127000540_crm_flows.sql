-- =====================================================================
-- 0540 · Quy trình CRM: Lead → (Tài khoản + Liên hệ + Cơ hội) → Báo giá → Hợp đồng → Đơn hàng → Dự án
--   Mọi bước chuyển trạng thái đi qua RPC để kiểm tra quyền và quy tắc.
-- =====================================================================
alter table public.org_counters add column if not exists last_order_no int not null default 0;

create or replace function app.next_no(p_org uuid, p_kind text) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.org_counters (org_id) values (p_org) on conflict do nothing;
  if p_kind = 'project' then
    update public.org_counters set last_project_no = last_project_no + 1 where org_id = p_org returning last_project_no into v;
  elsif p_kind = 'quote' then
    update public.org_counters set last_quote_no = last_quote_no + 1 where org_id = p_org returning last_quote_no into v;
  elsif p_kind = 'contract' then
    update public.org_counters set last_contract_no = last_contract_no + 1 where org_id = p_org returning last_contract_no into v;
  elsif p_kind = 'order' then
    update public.org_counters set last_order_no = last_order_no + 1 where org_id = p_org returning last_order_no into v;
  else
    raise exception 'Loại mã không hợp lệ';
  end if;
  return v;
end $$;

create or replace function app.require_crm_write() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if v_org is null or not app.can_crm(true) then raise exception 'Bạn không có quyền thao tác dữ liệu CRM' using errcode = '42501'; end if;
  return v_org;
end $$;

-- ---------------------------------------------------------------------
-- Lead → khách hàng
-- ---------------------------------------------------------------------
create or replace function public.convert_lead(
  p_lead uuid, p_account_id uuid default null, p_opportunity_name text default null, p_create_opportunity boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); l public.leads%rowtype; v_acc uuid := p_account_id; v_con uuid; v_opp uuid;
        v_company text;
begin
  select * into l from public.leads where id = p_lead and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy lead' using errcode = 'P0002'; end if;
  if l.is_converted then raise exception 'Lead này đã được chuyển đổi' using errcode = '22023'; end if;
  v_company := coalesce(nullif(trim(coalesce(l.company, '')), ''), trim(l.first_name || ' ' || l.last_name));
  if v_acc is null then
    insert into public.accounts (org_id, name, industry_id, employee_count, annual_revenue, phones, emails, websites, billing_address, owner_id, source_lead_id)
    values (v_org, v_company, l.industry_id, l.employee_count, l.annual_revenue, l.phones, l.emails, l.websites, l.address, coalesce(l.owner_id, auth.uid()), l.id)
    returning id into v_acc;
  elsif not exists (select 1 from public.accounts where id = v_acc and org_id = v_org and deleted_at is null) then
    raise exception 'Không tìm thấy tài khoản' using errcode = 'P0002';
  end if;
  insert into public.contacts (org_id, salutation, first_name, last_name, account_id, job_title, phones, emails, owner_id, source_lead_id)
  values (v_org, l.title, l.first_name, l.last_name, v_acc, l.job_title, l.phones, l.emails, coalesce(l.owner_id, auth.uid()), l.id)
  returning id into v_con;
  if coalesce(p_create_opportunity, true) then
    insert into public.opportunities (org_id, name, account_id, contact_id, owner_id, source_lead_id)
    values (v_org, coalesce(nullif(trim(coalesce(p_opportunity_name, '')), ''), 'Cơ hội – ' || v_company), v_acc, v_con, coalesce(l.owner_id, auth.uid()), l.id)
    returning id into v_opp;
  end if;
  update public.leads set is_converted = true, status = 'converted', converted_account_id = v_acc, converted_contact_id = v_con,
    converted_opportunity_id = v_opp, converted_at = now() where id = l.id;
  perform app.write_audit(v_org, 'lead.convert', 'lead', l.id, jsonb_build_object('account', v_acc, 'contact', v_con, 'opportunity', v_opp));
  return jsonb_build_object('account_id', v_acc, 'contact_id', v_con, 'opportunity_id', v_opp);
end $$;

-- ---------------------------------------------------------------------
-- Cơ hội
-- ---------------------------------------------------------------------
create or replace function public.set_opportunity_stage(p_id uuid, p_stage public.opportunity_stage, p_lost_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); o public.opportunities%rowtype;
begin
  select * into o from public.opportunities where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy cơ hội' using errcode = 'P0002'; end if;
  if o.stage = 'won' then raise exception 'Cơ hội đã thắng (hợp đồng đang hiệu lực) — không đổi giai đoạn được' using errcode = '22023'; end if;
  if p_stage = 'won' then raise exception 'Cơ hội chuyển sang "Thắng" tự động khi hợp đồng có hiệu lực' using errcode = '22023'; end if;
  if p_stage = 'lost' and nullif(trim(coalesce(p_lost_reason, '')), '') is null then raise exception 'Cần nhập lý do thua' using errcode = '22023'; end if;
  if p_stage = 'lost' and exists (select 1 from public.contracts where opportunity_id = p_id and status in ('pending', 'active') and deleted_at is null) then
    raise exception 'Cơ hội đang có hợp đồng — hủy hợp đồng trước' using errcode = '22023';
  end if;
  update public.opportunities set stage = p_stage,
    win_probability = case p_stage when 'needs_analysis' then 20 when 'presentation' then 40 when 'negotiation' then 70 when 'lost' then 0 else win_probability end,
    forecast = case p_stage when 'negotiation' then 'best_case'::public.opportunity_forecast when 'lost' then 'omitted'::public.opportunity_forecast else 'pipeline'::public.opportunity_forecast end,
    lost_reason = case when p_stage = 'lost' then trim(p_lost_reason) else null end
  where id = p_id;
  perform app.write_audit(v_org, 'opportunity.stage', 'opportunity', p_id, jsonb_build_object('from', o.stage, 'to', p_stage));
end $$;

-- ---------------------------------------------------------------------
-- Báo giá (chụp lại sản phẩm của cơ hội)
-- ---------------------------------------------------------------------
create or replace function public.create_quote(p_opportunity uuid, p_expiry date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); o public.opportunities%rowtype; v_id uuid; v_code text; v_ver int; v_sub numeric; v_tot numeric;
        ac public.accounts%rowtype; ct public.contacts%rowtype;
begin
  select * into o from public.opportunities where id = p_opportunity and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy cơ hội' using errcode = 'P0002'; end if;
  if o.stage in ('won', 'lost') then raise exception 'Cơ hội đã đóng — không tạo báo giá được' using errcode = '22023'; end if;
  if not exists (select 1 from public.opportunity_products where opportunity_id = o.id) then
    raise exception 'Cơ hội chưa có sản phẩm / dịch vụ — thêm trước khi báo giá' using errcode = '22023';
  end if;
  if p_expiry is not null and p_expiry < app.today() then raise exception 'Ngày hết hạn báo giá phải từ hôm nay trở đi' using errcode = '22023'; end if;
  select * into ac from public.accounts where id = o.account_id;
  select * into ct from public.contacts where id = o.contact_id;
  select coalesce(max(version), 0) + 1 into v_ver from public.quotes where opportunity_id = o.id;
  v_code := 'BG' || lpad(app.next_no(v_org, 'quote')::text, 4, '0');
  select coalesce(sum(round(unit_price * quantity * (1 + fee_percent / 100), 2)), 0), coalesce(sum(total), 0)
    into v_sub, v_tot from public.opportunity_products where opportunity_id = o.id;
  insert into public.quotes (org_id, code, opportunity_id, version, expiry_date, subtotal, tax_amount, total, recipient_name, billing_address, shipping_address, note)
  values (v_org, v_code, o.id, v_ver, p_expiry, v_sub, v_tot - v_sub, v_tot,
          nullif(trim(coalesce(ct.salutation, '') || ' ' || coalesce(ct.first_name, '') || ' ' || coalesce(ct.last_name, '')), ''),
          ac.billing_address, ac.shipping_address, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  insert into public.quote_items (org_id, quote_id, position, description, unit, quantity, unit_price, fee_percent, tax_percent, amount)
  select v_org, v_id, row_number() over (order by created_at, id), description, unit, quantity, unit_price, fee_percent, tax_percent, total
  from public.opportunity_products where opportunity_id = o.id;
  perform app.write_audit(v_org, 'quote.create', 'quote', v_id, jsonb_build_object('code', v_code, 'total', v_tot));
  return v_id;
end $$;

create or replace function public.set_quote_status(p_id uuid, p_status public.quote_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); q public.quotes%rowtype; v_ok boolean;
begin
  select * into q from public.quotes where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy báo giá' using errcode = 'P0002'; end if;
  if q.status = p_status then return; end if;
  v_ok := (q.status, p_status) in (('draft','pending_approval'), ('pending_approval','approved'), ('pending_approval','draft'), ('approved','sent'),
          ('sent','accepted'), ('sent','rejected'), ('sent','expired'), ('approved','draft'), ('rejected','draft'), ('expired','draft'));
  if not v_ok then raise exception 'Không chuyển báo giá từ "%" sang "%" được', q.status, p_status using errcode = '22023'; end if;
  if q.status = 'pending_approval' and p_status = 'approved' and not (app.has_permission('projects.manage_all') or app.has_permission('finance.approve')) then
    raise exception 'Chỉ quản lý được duyệt báo giá' using errcode = '42501';
  end if;
  if p_status = 'sent' and q.expiry_date is not null and q.expiry_date < app.today() then raise exception 'Báo giá đã quá hạn' using errcode = '22023'; end if;
  update public.quotes set status = p_status, accepted_at = case when p_status = 'accepted' then now() else null end where id = q.id;
  if p_status = 'pending_approval' then
    perform app.notify_permission(v_org, 'projects.manage_all', 'quote_pending', 'Báo giá ' || q.code || ' chờ duyệt', '/bao-gia/' || q.id::text);
  end if;
  perform app.write_audit(v_org, 'quote.status', 'quote', q.id, jsonb_build_object('from', q.status, 'to', p_status));
end $$;

-- ---------------------------------------------------------------------
-- Hợp đồng
-- ---------------------------------------------------------------------
create or replace function public.create_contract(p_quote uuid, p_effective date default null, p_expiry date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); q public.quotes%rowtype; v_id uuid; v_code text; v_months int;
begin
  select * into q from public.quotes where id = p_quote and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy báo giá' using errcode = 'P0002'; end if;
  if q.status <> 'accepted' then raise exception 'Chỉ lập hợp đồng từ báo giá khách đã chấp nhận' using errcode = '22023'; end if;
  if exists (select 1 from public.contracts where opportunity_id = q.opportunity_id and status in ('draft', 'pending', 'active') and deleted_at is null) then
    raise exception 'Cơ hội này đã có hợp đồng đang mở' using errcode = '22023';
  end if;
  if p_effective is not null and p_expiry is not null and p_expiry < p_effective then raise exception 'Ngày hết hạn phải sau ngày hiệu lực' using errcode = '22023'; end if;
  if p_effective is not null and p_expiry is not null then v_months := greatest(1, round((p_expiry - p_effective) / 30.0)::int); end if;
  v_code := 'HD' || lpad(app.next_no(v_org, 'contract')::text, 4, '0');
  insert into public.contracts (org_id, code, opportunity_id, quote_id, effective_date, expiry_date, duration_months, initial_value, current_value, note)
  values (v_org, v_code, q.opportunity_id, q.id, p_effective, p_expiry, v_months, q.total, q.total, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  perform app.write_audit(v_org, 'contract.create', 'contract', v_id, jsonb_build_object('code', v_code, 'value', q.total));
  return v_id;
end $$;

create or replace function public.set_contract_status(p_id uuid, p_status public.contract_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); c public.contracts%rowtype; v_ok boolean;
begin
  select * into c from public.contracts where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0002'; end if;
  if c.status = p_status then return; end if;
  v_ok := (c.status, p_status) in (('draft','pending'), ('pending','draft'), ('pending','active'), ('draft','cancelled'), ('pending','cancelled'),
          ('active','expired'), ('active','terminated'));
  if not v_ok then raise exception 'Không chuyển hợp đồng từ "%" sang "%" được', c.status, p_status using errcode = '22023'; end if;
  if p_status = 'active' then
    if not (app.has_permission('projects.manage_all') or app.has_permission('finance.approve')) then raise exception 'Chỉ quản lý được kích hoạt hợp đồng' using errcode = '42501'; end if;
    update public.contracts set status = 'active', effective_date = coalesce(effective_date, app.today()),
      company_signed_by_id = coalesce(company_signed_by_id, auth.uid()), company_signed_date = coalesce(company_signed_date, app.today()) where id = c.id;
    update public.opportunities set stage = 'won', win_probability = 100, forecast = 'closed' where id = c.opportunity_id;
    perform app.notify_permission(v_org, 'projects.create', 'contract_active', 'Hợp đồng ' || c.code || ' có hiệu lực — có thể tạo dự án', '/hop-dong/' || c.id::text);
  else
    update public.contracts set status = p_status where id = c.id;
  end if;
  perform app.write_audit(v_org, 'contract.status', 'contract', c.id, jsonb_build_object('from', c.status, 'to', p_status));
end $$;

-- ---------------------------------------------------------------------
-- Đơn hàng
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_contract uuid, p_total numeric default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); c public.contracts%rowtype; v_id uuid; v_code text; v_total numeric;
begin
  select * into c from public.contracts where id = p_contract and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0002'; end if;
  if c.status <> 'active' then raise exception 'Chỉ tạo đơn hàng từ hợp đồng đang hiệu lực' using errcode = '22023'; end if;
  v_total := coalesce(p_total, c.current_value);
  if v_total <= 0 or v_total > c.current_value then raise exception 'Giá trị đơn hàng phải lớn hơn 0 và không vượt giá trị hợp đồng' using errcode = '22023'; end if;
  v_code := 'DH' || lpad(app.next_no(v_org, 'order')::text, 4, '0');
  insert into public.orders (org_id, code, contract_id, total, note) values (v_org, v_code, c.id, v_total, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_order_status(p_id uuid, p_status public.order_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy đơn hàng' using errcode = 'P0002'; end if;
  if o.status = p_status then return; end if;
  if o.status = 'cancelled' then raise exception 'Đơn hàng đã hủy' using errcode = '22023'; end if;
  if p_status = 'draft' then raise exception 'Không đưa đơn hàng về nháp được' using errcode = '22023'; end if;
  update public.orders set status = p_status, activated_at = case when p_status = 'active' then now() else activated_at end where id = o.id;
  perform app.write_audit(v_org, 'order.status', 'order', o.id, jsonb_build_object('from', o.status, 'to', p_status));
end $$;

-- ---------------------------------------------------------------------
-- Hợp đồng → Dự án (mốc thanh toán mặc định 100%, sửa sau)
-- ---------------------------------------------------------------------
create or replace function public.create_project_from_contract(p_contract uuid, p_manager_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); c public.contracts%rowtype; o public.opportunities%rowtype; v_id uuid;
begin
  if v_org is null or not app.has_permission('projects.create') or not app.can_crm(false) then raise exception 'Bạn không có quyền tạo dự án từ hợp đồng' using errcode = '42501'; end if;
  select * into c from public.contracts where id = p_contract and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0002'; end if;
  if c.status <> 'active' then raise exception 'Hợp đồng chưa có hiệu lực' using errcode = '22023'; end if;
  if exists (select 1 from public.projects where contract_id = c.id and deleted_at is null) then raise exception 'Hợp đồng này đã có dự án' using errcode = '22023'; end if;
  select * into o from public.opportunities where id = c.opportunity_id;
  v_id := public.create_project(o.name, 'client', o.account_id, p_manager_id, c.effective_date, c.expiry_date, null, c.current_value, 0, '{}');
  update public.projects set contract_id = c.id, opportunity_id = o.id where id = v_id;
  insert into public.project_milestones (org_id, project_id, name, amount, due_date) values (v_org, v_id, 'Nghiệm thu & thanh toán', c.current_value, c.expiry_date);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Công việc: mọi nhân viên (trừ cộng tác viên) tạo / cập nhật việc của mình
-- ---------------------------------------------------------------------
create policy tasks_sel_creator on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and created_by = auth.uid() and not app.has_role('collaborator'));

create or replace function public.save_task(
  p_id uuid, p_title text, p_type public.task_type default 'to_do', p_priority public.task_priority default 'normal',
  p_scheduled_at timestamptz default null, p_remind_before int default null, p_content text default null,
  p_related_type text default null, p_related_id uuid default null, p_assignees uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid; t public.tasks%rowtype;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền tạo công việc' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Nhập tiêu đề công việc' using errcode = '22023'; end if;
  if p_related_type is not null and p_related_type not in ('lead', 'account', 'contact', 'opportunity', 'project', 'video') then raise exception 'Loại liên quan không hợp lệ' using errcode = '22023'; end if;
  perform app.check_members(v_org, coalesce(p_assignees, '{}'));
  if p_id is null then
    insert into public.tasks (org_id, title, task_type, priority, scheduled_at, remind_before_minutes, reminder_at, content, related_type, related_id)
    values (v_org, trim(p_title), p_type, p_priority, p_scheduled_at, p_remind_before,
            case when p_scheduled_at is not null and p_remind_before is not null then p_scheduled_at - make_interval(mins => p_remind_before) end,
            nullif(trim(coalesce(p_content, '')), ''), p_related_type, p_related_id)
    returning id into v_id;
  else
    select * into t from public.tasks where id = p_id and org_id = v_org and deleted_at is null for update;
    if not found then raise exception 'Không tìm thấy công việc' using errcode = 'P0002'; end if;
    if t.created_by is distinct from auth.uid() and not app.can_crm(true) then raise exception 'Chỉ người tạo hoặc quản lý CRM được sửa công việc' using errcode = '42501'; end if;
    update public.tasks set title = trim(p_title), task_type = p_type, priority = p_priority, scheduled_at = p_scheduled_at, remind_before_minutes = p_remind_before,
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
  if not (t.created_by = auth.uid() or app.can_crm(true)) then raise exception 'Bạn không có quyền xóa công việc này' using errcode = '42501'; end if;
  update public.tasks set deleted_at = now() where id = p_id;
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write() from authenticated;
