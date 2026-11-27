-- =====================================================================
-- 0820 · Danh mục mặc định tự nạp khi tạo doanh nghiệp + view lãi/lỗ theo dự án
-- =====================================================================
create or replace function app.org_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_crm_defaults(new.id);
  perform public.seed_finance_defaults(new.id);
  insert into public.payroll_settings (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger organizations_defaults after insert on public.organizations for each row execute function app.org_defaults();

-- Lãi / lỗ và công nợ theo dự án. security_invoker: RLS của người xem vẫn áp dụng
-- (người không có quyền xem tiền sẽ chỉ thấy số 0 — giao diện ẩn khối này với họ).
create or replace view public.project_financials with (security_invoker = true) as
select p.id as project_id, p.org_id, p.code, p.name, p.stage, p.customer_id,
  coalesce(b.contract_value, 0) as contract_value,
  coalesce(b.budget_cost, 0)    as budget_cost,
  coalesce((select sum(i.amount) from public.incomes i where i.project_id = p.id and i.status = 'confirmed'), 0) as revenue,
  coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved'), 0) as cost,
  coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved' and e.payment = 'paid'), 0) as cost_paid,
  coalesce((select sum(m.amount) from public.project_milestones m where m.project_id = p.id and m.acceptance = 'accepted' and m.payment <> 'paid'), 0) as receivable,
  coalesce((select sum(e.amount) from public.expenses e where e.project_id = p.id and e.deleted_at is null and e.approval = 'approved' and e.payment = 'unpaid'), 0) as payable
from public.projects p left join public.project_budgets b on b.project_id = p.id
where p.deleted_at is null;
revoke all on public.project_financials from anon, authenticated;
grant select on public.project_financials to authenticated;
grant all on public.project_financials to service_role;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults() from authenticated;
