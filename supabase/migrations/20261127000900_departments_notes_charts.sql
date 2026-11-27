-- =====================================================================
-- 0900 · Phòng ban có nhân viên, ghi chú & lịch sử hoạt động trên bản ghi CRM, tìm kiếm toàn hệ thống,
--        số liệu cho biểu đồ Dashboard và báo cáo bán hàng, đổi trạng thái lead (Kanban).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ghi chú trên bản ghi (lead, tài khoản, liên hệ, cơ hội, dự án)
-- ---------------------------------------------------------------------
create table public.crm_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'account', 'contact', 'opportunity', 'project')),
  entity_id   uuid not null,
  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  pinned      boolean not null default false,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index crm_notes_entity_idx on public.crm_notes(entity_type, entity_id) where deleted_at is null;
alter table public.crm_notes enable row level security;
create policy crm_notes_select on public.crm_notes for select to authenticated
  using (org_id = app.current_org_id() and deleted_at is null and not app.has_role('collaborator')
         and ((entity_type = 'project' and app.can_view_project(entity_id)) or (entity_type <> 'project' and app.can_crm(false))));
revoke all on public.crm_notes from anon, authenticated;
grant select on public.crm_notes to authenticated;
grant all on public.crm_notes to service_role;

create or replace function app.note_target_ok(p_org uuid, p_type text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return case p_type
    when 'lead' then exists (select 1 from public.leads where id = p_id and org_id = p_org and deleted_at is null)
    when 'account' then exists (select 1 from public.accounts where id = p_id and org_id = p_org and deleted_at is null)
    when 'contact' then exists (select 1 from public.contacts where id = p_id and org_id = p_org and deleted_at is null)
    when 'opportunity' then exists (select 1 from public.opportunities where id = p_id and org_id = p_org and deleted_at is null)
    when 'project' then exists (select 1 from public.projects where id = p_id and org_id = p_org and deleted_at is null)
    else false end;
end $$;

create or replace function public.add_note(p_type text, p_id uuid, p_body text, p_pinned boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); v_id uuid;
begin
  if v_org is null or app.has_role('collaborator') then raise exception 'Bạn không có quyền ghi chú' using errcode = '42501'; end if;
  if p_type = 'project' then
    if not app.can_view_project(p_id) then raise exception 'Bạn không thuộc dự án này' using errcode = '42501'; end if;
  elsif not app.can_crm(true) then raise exception 'Bạn không có quyền ghi chú dữ liệu CRM' using errcode = '42501';
  end if;
  if not app.note_target_ok(v_org, p_type, p_id) then raise exception 'Không tìm thấy bản ghi để ghi chú' using errcode = 'P0002'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Nhập nội dung ghi chú' using errcode = '22023'; end if;
  if length(p_body) > 4000 then raise exception 'Ghi chú tối đa 4.000 ký tự' using errcode = '22023'; end if;
  insert into public.crm_notes (org_id, entity_type, entity_id, body, pinned) values (v_org, p_type, p_id, trim(p_body), coalesce(p_pinned, false)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_note(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.crm_notes%rowtype;
begin
  select * into n from public.crm_notes where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy ghi chú' using errcode = 'P0002'; end if;
  if not (n.created_by = auth.uid() or app.has_role('system_admin') or app.has_role('manager')) then raise exception 'Chỉ người viết hoặc quản lý được xóa ghi chú' using errcode = '42501'; end if;
  update public.crm_notes set deleted_at = now() where id = p_id;
end $$;

create or replace function public.pin_note(p_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.crm_notes%rowtype;
begin
  select * into n from public.crm_notes where id = p_id and org_id = app.current_org_id() and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy ghi chú' using errcode = 'P0002'; end if;
  if n.entity_type = 'project' then
    if not app.can_view_project(n.entity_id) then raise exception 'Bạn không có quyền' using errcode = '42501'; end if;
  elsif not app.can_crm(true) then raise exception 'Bạn không có quyền' using errcode = '42501'; end if;
  update public.crm_notes set pinned = coalesce(p_pinned, false) where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Dòng thời gian của một bản ghi: ghi chú + nhật ký thao tác + công việc liên quan
-- ---------------------------------------------------------------------
create or replace function public.record_timeline(p_type text, p_id uuid, p_limit int default 80)
returns table (kind text, at timestamptz, actor text, title text, detail jsonb, id uuid, author_id uuid, pinned boolean)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); ids uuid[];
begin
  if v_org is null or app.has_role('collaborator') then return; end if;
  if p_type = 'project' then
    if not app.can_view_project(p_id) then return; end if;
  elsif p_type not in ('lead', 'account', 'contact', 'opportunity') or not app.can_crm(false) then return;
  end if;
  ids := array[p_id];
  if p_type = 'opportunity' then
    ids := ids || array(select q.id from public.quotes q where q.opportunity_id = p_id) || array(select c.id from public.contracts c where c.opportunity_id = p_id);
  elsif p_type = 'account' then
    ids := ids || array(select o.id from public.opportunities o where o.account_id = p_id)
               || array(select q.id from public.quotes q join public.opportunities o on o.id = q.opportunity_id where o.account_id = p_id)
               || array(select c.id from public.contracts c join public.opportunities o on o.id = c.opportunity_id where o.account_id = p_id);
  elsif p_type = 'project' then
    ids := ids || array(select m.id from public.project_milestones m where m.project_id = p_id);
  end if;
  return query
    select * from (
      select 'note'::text, n.created_at, (select pr.full_name from public.profiles pr where pr.id = n.created_by), n.body, '{}'::jsonb, n.id, n.created_by, n.pinned
        from public.crm_notes n where n.org_id = v_org and n.entity_type = p_type and n.entity_id = p_id and n.deleted_at is null
      union all
      select 'audit'::text, a.created_at, (select pr.full_name from public.profiles pr where pr.id = a.actor_id), a.action, coalesce(a.details, '{}'::jsonb), null::uuid, a.actor_id, false
        from public.audit_logs a where a.org_id = v_org and a.entity_id = any(ids) and a.action not like 'demo.%'
      union all
      select 'task'::text, coalesce(t.scheduled_at, t.created_at), (select pr.full_name from public.profiles pr where pr.id = t.created_by), t.title,
             jsonb_build_object('status', t.status, 'type', t.task_type), t.id, t.created_by, false
        from public.tasks t where t.org_id = v_org and t.related_type = p_type and t.related_id = p_id and t.deleted_at is null
    ) x(kind, at, actor, title, detail, id, author_id, pinned)
    order by x.pinned desc, x.at desc limit greatest(1, least(coalesce(p_limit, 80), 300));
end $$;

-- ---------------------------------------------------------------------
-- Đổi trạng thái lead (thẻ Kanban)
-- ---------------------------------------------------------------------
create or replace function public.set_lead_status(p_id uuid, p_status public.lead_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); l public.leads%rowtype;
begin
  select * into l from public.leads where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy lead' using errcode = 'P0002'; end if;
  if l.is_converted then raise exception 'Lead đã chuyển đổi — không đổi trạng thái được' using errcode = '22023'; end if;
  if p_status = 'converted' then raise exception 'Dùng chức năng "Chuyển đổi lead" để chuyển thành khách hàng' using errcode = '22023'; end if;
  if l.status = p_status then return; end if;
  update public.leads set status = p_status where id = p_id;
  perform app.write_audit(v_org, 'lead.status', 'lead', p_id, jsonb_build_object('from', l.status, 'to', p_status));
end $$;

-- ---------------------------------------------------------------------
-- Phòng ban: thêm / gỡ nhân viên, chọn trưởng phòng
-- ---------------------------------------------------------------------
create or replace function app.require_hr() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if v_org is null or not app.has_permission('users.manage') then raise exception 'Chỉ quản trị được sửa cơ cấu phòng ban' using errcode = '42501'; end if;
  return v_org;
end $$;

create or replace function public.add_department_member(p_dept uuid, p_user uuid, p_position uuid default null, p_primary boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); d public.departments%rowtype; pr public.profiles%rowtype;
begin
  select * into d from public.departments where id = p_dept and org_id = v_org;
  if not found then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  select * into pr from public.profiles where id = p_user and org_id = v_org and is_active;
  if not found then raise exception 'Không tìm thấy nhân viên đang hoạt động' using errcode = 'P0002'; end if;
  if app.has_role_of(p_user, 'collaborator') then raise exception 'Cộng tác viên không thuộc phòng ban' using errcode = '22023'; end if;
  if p_position is not null and not exists (select 1 from public.positions where id = p_position and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy chức vụ' using errcode = 'P0002'; end if;
  insert into public.user_departments_positions (org_id, user_id, department_id, position_id) values (v_org, p_user, p_dept, p_position)
  on conflict (user_id, department_id) do update set position_id = excluded.position_id;
  if coalesce(p_primary, true) or pr.department_id is null then update public.profiles set department_id = p_dept where id = p_user; end if;
  perform app.write_audit(v_org, 'department.member_add', 'department', p_dept, jsonb_build_object('user', p_user));
end $$;

create or replace function public.remove_department_member(p_dept uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr(); v_other uuid;
begin
  if not exists (select 1 from public.departments where id = p_dept and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  delete from public.user_departments_positions where user_id = p_user and department_id = p_dept and org_id = v_org;
  delete from public.department_managers where user_id = p_user and department_id = p_dept and org_id = v_org;
  update public.departments set manager_id = null where id = p_dept and manager_id = p_user;
  select department_id into v_other from public.user_departments_positions where user_id = p_user and org_id = v_org order by sort_order, department_id limit 1;
  update public.profiles set department_id = v_other where id = p_user and org_id = v_org and department_id = p_dept;
  perform app.write_audit(v_org, 'department.member_remove', 'department', p_dept, jsonb_build_object('user', p_user));
end $$;

create or replace function public.set_department_manager(p_dept uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_hr();
begin
  if not exists (select 1 from public.departments where id = p_dept and org_id = v_org) then raise exception 'Không tìm thấy phòng ban' using errcode = 'P0002'; end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and org_id = v_org and is_active) then raise exception 'Không tìm thấy nhân viên đang hoạt động' using errcode = 'P0002'; end if;
  update public.departments set manager_id = p_user where id = p_dept;
  delete from public.department_managers where department_id = p_dept and org_id = v_org;
  if p_user is not null then
    insert into public.department_managers (org_id, department_id, user_id) values (v_org, p_dept, p_user);
    insert into public.user_departments_positions (org_id, user_id, department_id) values (v_org, p_user, p_dept) on conflict do nothing;
  end if;
  perform app.write_audit(v_org, 'department.manager', 'department', p_dept, jsonb_build_object('user', p_user));
end $$;

-- ---------------------------------------------------------------------
-- Số liệu biểu đồ Dashboard (security invoker: RLS của người xem quyết định số liệu)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_charts() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_today date := app.today(); v_fin boolean := app.has_permission('finance.view'); v_crm boolean := app.can_crm(false);
  r jsonb := '{}'::jsonb;
begin
  r := r || jsonb_build_object('videos_by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage', s, 'count', c) order by o), '[]') from (
    select s::text s, e.o, (select count(*) from public.videos v where v.stage = s) c from unnest(enum_range(null::public.video_stage)) with ordinality e(s, o)) x));
  r := r || jsonb_build_object('videos_weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w::date, 'created', (select count(*) from public.videos v where v.report_date >= w::date and v.report_date < w::date + 7),
        'published', (select count(*) from public.videos v where v.published_at >= w and v.published_at < w + interval '7 days')) order by w), '[]')
    from generate_series(date_trunc('week', v_today::timestamp) - interval '7 weeks', date_trunc('week', v_today::timestamp), interval '1 week') w));
  r := r || jsonb_build_object('headcount', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c) order by c desc, n), '[]') from (
    select d.name n, (select count(*) from public.profiles p where p.department_id = d.id and p.is_active and not app.has_role_of(p.id, 'collaborator')) c from public.departments d
    union all select 'Chưa phân bổ', (select count(*) from public.profiles p where p.department_id is null and p.is_active and not app.has_role_of(p.id, 'collaborator'))) x where c > 0));
  r := r || jsonb_build_object('projects_by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage', s, 'count', c) order by o), '[]') from (
    select s::text s, e.o, (select count(*) from public.projects p where p.stage = s and p.deleted_at is null) c from unnest(enum_range(null::public.project_stage)) with ordinality e(s, o)) x));
  if v_crm then
    r := r || jsonb_build_object(
      'opp_by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage', s, 'count', c, 'value', v) order by o), '[]') from (
        select s::text s, e.o, (select count(*) from public.opportunities p where p.stage = s and p.deleted_at is null) c,
               (select coalesce(sum(p.expected_revenue), 0) from public.opportunities p where p.stage = s and p.deleted_at is null) v
        from unnest(enum_range(null::public.opportunity_stage)) with ordinality e(s, o)) x),
      'leads_by_status', (select coalesce(jsonb_agg(jsonb_build_object('status', s, 'count', c) order by o), '[]') from (
        select s::text s, e.o, (select count(*) from public.leads l where l.status = s and l.deleted_at is null) c from unnest(enum_range(null::public.lead_status)) with ordinality e(s, o)) x),
      'leads_by_source', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c) order by c desc), '[]') from (
        select coalesce(ls.name, 'Không rõ') n, count(*) c from public.leads l left join public.lead_sources ls on ls.id = l.source_id where l.deleted_at is null group by 1) x),
      'top_accounts', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'value', v) order by v desc), '[]') from (
        select a.name n, sum(c.current_value) v from public.contracts c join public.opportunities o on o.id = c.opportunity_id join public.accounts a on a.id = o.account_id
        where c.deleted_at is null and c.status in ('active', 'expired') group by a.name order by 2 desc limit 6) x));
  end if;
  if v_fin then
    r := r || jsonb_build_object('revenue_expense', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'income', (select coalesce(sum(i.amount), 0) from public.incomes i where i.status = 'confirmed' and i.occurred_on >= m::date and i.occurred_on < (m + interval '1 month')::date),
        'expense', (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.approval = 'approved' and e.occurred_on >= m::date and e.occurred_on < (m + interval '1 month')::date)) order by m), '[]')
      from generate_series(date_trunc('month', v_today::timestamp) - interval '5 months', date_trunc('month', v_today::timestamp), interval '1 month') m));
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Báo cáo bán hàng
-- ---------------------------------------------------------------------
create or replace function public.sales_report() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_today date := app.today(); r jsonb;
begin
  if not app.can_crm(false) then return null; end if;
  select jsonb_build_object(
    'kpi', (select jsonb_build_object(
        'open_count', count(*) filter (where stage not in ('won', 'lost')), 'open_value', coalesce(sum(expected_revenue) filter (where stage not in ('won', 'lost')), 0),
        'weighted', coalesce(sum(expected_revenue * win_probability / 100) filter (where stage not in ('won', 'lost')), 0),
        'won_count', count(*) filter (where stage = 'won'), 'lost_count', count(*) filter (where stage = 'lost'), 'won_value', coalesce(sum(expected_revenue) filter (where stage = 'won'), 0),
        'avg_deal', coalesce(avg(expected_revenue) filter (where stage = 'won'), 0),
        'cycle_days', coalesce(avg(extract(epoch from (updated_at - created_at)) / 86400) filter (where stage = 'won'), 0))
      from public.opportunities where deleted_at is null),
    'forecast', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'value', (select coalesce(sum(o.expected_revenue), 0) from public.opportunities o where o.deleted_at is null and o.stage not in ('won', 'lost') and o.expected_close_date >= m::date and o.expected_close_date < (m + interval '1 month')::date),
        'weighted', (select coalesce(sum(o.expected_revenue * o.win_probability / 100), 0) from public.opportunities o where o.deleted_at is null and o.stage not in ('won', 'lost') and o.expected_close_date >= m::date and o.expected_close_date < (m + interval '1 month')::date)) order by m), '[]')
      from generate_series(date_trunc('month', v_today::timestamp), date_trunc('month', v_today::timestamp) + interval '5 months', interval '1 month') m),
    'won_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'value', (select coalesce(sum(c.current_value), 0) from public.contracts c where c.deleted_at is null and c.status in ('active', 'expired') and c.effective_date >= m::date and c.effective_date < (m + interval '1 month')::date)) order by m), '[]')
      from generate_series(date_trunc('month', v_today::timestamp) - interval '5 months', date_trunc('month', v_today::timestamp), interval '1 month') m),
    'lead_sources', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'leads', c, 'converted', cv) order by c desc), '[]') from (
        select coalesce(ls.name, 'Không rõ') n, count(*) c, count(*) filter (where l.is_converted) cv from public.leads l left join public.lead_sources ls on ls.id = l.source_id where l.deleted_at is null group by 1) x),
    'quote_funnel', (select coalesce(jsonb_agg(jsonb_build_object('status', s, 'count', c) order by o), '[]') from (
        select s::text s, e.o, (select count(*) from public.quotes q where q.status = s and q.deleted_at is null) c from unnest(enum_range(null::public.quote_status)) with ordinality e(s, o)) x),
    'owners', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'open_value', ov, 'won_value', wv, 'count', c) order by wv desc, ov desc), '[]') from (
        select coalesce(p.full_name, 'Chưa gán') n, coalesce(sum(o.expected_revenue) filter (where o.stage not in ('won', 'lost')), 0) ov, coalesce(sum(o.expected_revenue) filter (where o.stage = 'won'), 0) wv, count(*) c
        from public.opportunities o left join public.profiles p on p.id = o.owner_id where o.deleted_at is null group by 1) x),
    'lost_reasons', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c) order by c desc), '[]') from (
        select coalesce(nullif(trim(lost_reason), ''), 'Không ghi lý do') n, count(*) c from public.opportunities where deleted_at is null and stage = 'lost' group by 1 limit 8) x),
    'attention', jsonb_build_object(
      'quotes_expiring', (select count(*) from public.quotes where deleted_at is null and status in ('sent', 'approved') and expiry_date between v_today and v_today + 7),
      'contracts_expiring', (select count(*) from public.contracts where deleted_at is null and status = 'active' and expiry_date between v_today and v_today + 30),
      'opps_overdue', (select count(*) from public.opportunities where deleted_at is null and stage not in ('won', 'lost') and expected_close_date < v_today),
      'leads_stale', (select count(*) from public.leads where deleted_at is null and not is_converted and status in ('new', 'contacted', 'working') and updated_at < now() - interval '14 days'))
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Tìm kiếm toàn hệ thống (theo quyền xem của người dùng)
-- ---------------------------------------------------------------------
create or replace function public.search_all(p_q text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare q text := '%' || replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'; r jsonb := '{}'::jsonb;
begin
  if length(trim(coalesce(p_q, ''))) < 2 then return r; end if;
  r := r || jsonb_build_object(
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', code || ' · ' || title, 'sub', stage::text)), '[]') from (select * from public.videos where code ilike q or title ilike q order by report_date desc limit 6) x),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', code || ' · ' || name, 'sub', stage::text)), '[]') from (select * from public.projects where deleted_at is null and (code ilike q or name ilike q) limit 6) x),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', full_name, 'sub', coalesce(job_title, email))), '[]') from (select * from public.profiles where is_active and (full_name ilike q or email ilike q) limit 6) x));
  if app.can_crm(false) then
    r := r || jsonb_build_object(
      'leads', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', trim(first_name || ' ' || last_name), 'sub', coalesce(company, status::text))), '[]') from (select * from public.leads where deleted_at is null and (first_name || ' ' || last_name ilike q or company ilike q or array_to_string(phones, ' ') ilike q or array_to_string(emails, ' ') ilike q) limit 6) x),
      'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', name, 'sub', tax_code)), '[]') from (select * from public.accounts where deleted_at is null and (name ilike q or tax_code ilike q or array_to_string(phones, ' ') ilike q) limit 6) x),
      'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', trim(first_name || ' ' || last_name), 'sub', job_title)), '[]') from (select * from public.contacts where deleted_at is null and (first_name || ' ' || last_name ilike q or array_to_string(phones, ' ') ilike q or array_to_string(emails, ' ') ilike q) limit 6) x),
      'opportunities', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', name, 'sub', stage::text)), '[]') from (select * from public.opportunities where deleted_at is null and name ilike q limit 6) x),
      'quotes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', code, 'sub', status::text)), '[]') from (select * from public.quotes where deleted_at is null and code ilike q limit 6) x),
      'contracts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', code, 'sub', status::text)), '[]') from (select * from public.contracts where deleted_at is null and code ilike q limit 6) x),
      'products', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', name, 'sub', code)), '[]') from (select * from public.products where deleted_at is null and (name ilike q or code ilike q) limit 6) x));
  end if;
  return r;
end $$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid) from authenticated;
