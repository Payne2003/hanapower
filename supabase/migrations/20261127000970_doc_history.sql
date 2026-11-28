-- =====================================================================
-- 0970 · Lịch sử xử lý yêu cầu nộp tài liệu: ai giao / nộp / duyệt / yêu cầu nộp lại, khi nào, lý do, tên tệp (kể cả bản đã bị thay thế).
-- Trước đây bản nộp cũ bị xóa khi nhân viên thay tệp và chỉ còn nhật ký chung; nay mỗi lần đổi trạng thái / thay tệp có một dòng lịch sử riêng.
-- =====================================================================
create table public.document_request_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  request_id uuid not null references public.document_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null check (action in ('assigned', 'submitted', 'approved', 'rejected')),
  note text,
  file_name text,
  file_size integer,
  created_at timestamptz not null default now()
);
create index document_request_events_req_idx on public.document_request_events(request_id, id);
alter table public.document_request_events enable row level security;
-- Thấy lịch sử của yêu cầu nào thì thấy theo chính chính sách của document_requests (chính chủ hoặc nhân sự / quản trị)
create policy document_request_events_select on public.document_request_events for select to authenticated using (exists (select 1 from public.document_requests r where r.id = request_id));
create policy document_request_events_no_collab on public.document_request_events as restrictive for select to authenticated using (not app.has_role('collaborator'));
revoke all on public.document_request_events from anon, authenticated;
grant select on public.document_request_events to authenticated;
grant all on public.document_request_events to service_role;

create or replace function app.trg_doc_request_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_name text; v_size int; v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.document_request_events (org_id, request_id, actor_id, action) values (new.org_id, new.id, coalesce(v_actor, new.created_by), 'assigned');
    return null;
  end if;
  -- ghi khi đổi trạng thái, hoặc khi thay tệp ở trạng thái 'chờ duyệt' (bỏ qua việc ON DELETE SET NULL khi dọn bản cũ)
  if new.status is distinct from old.status or (new.status::text = 'submitted' and new.document_id is not null and new.document_id is distinct from old.document_id) then
    v_action := case new.status::text when 'submitted' then 'submitted' when 'approved' then 'approved' when 'rejected' then 'rejected' end;
    if v_action is not null then
      select name, size_bytes into v_name, v_size from public.user_documents where id = new.document_id;
      insert into public.document_request_events (org_id, request_id, actor_id, action, note, file_name, file_size)
      values (new.org_id, new.id, v_actor, v_action, case when v_action = 'rejected' then new.reject_reason end, v_name, v_size);
    end if;
  end if;
  return null;
end $$;
create trigger document_requests_events after insert or update on public.document_requests for each row execute function app.trg_doc_request_event();

-- Dữ liệu cũ: dựng lịch sử tối thiểu từ trạng thái hiện tại (giao + trạng thái gần nhất)
insert into public.document_request_events (org_id, request_id, actor_id, action, created_at)
select org_id, id, created_by, 'assigned', created_at from public.document_requests;
insert into public.document_request_events (org_id, request_id, actor_id, action, note, file_name, file_size, created_at)
select r.org_id, r.id, case when r.status::text = 'submitted' then r.user_id else r.reviewed_by end, r.status::text, case when r.status::text = 'rejected' then r.reject_reason end, d.name, d.size_bytes,
  coalesce(case when r.status::text = 'submitted' then r.submitted_at else r.reviewed_at end, r.created_at)
from public.document_requests r left join public.user_documents d on d.id = r.document_id where r.status::text in ('submitted', 'approved', 'rejected');

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
revoke execute on function app.write_audit(uuid, text, text, uuid, jsonb), app.notify(uuid, uuid, uuid, text, text),
  app.notify_managers(uuid, uuid, text, text), app.lock_video(uuid), app.log_video(public.videos, text, public.video_stage, text, jsonb),
  app.notify_link(uuid, uuid, text, text, text), app.notify_permission(uuid, text, text, text, text), app.next_no(uuid, text),
  app.check_members(uuid, uuid[]), app.opp_line_total(), app.opp_sync_revenue(), app.require_crm_write(), app.sync_assignment_fee(uuid),
  app.check_expense_scope(uuid), app.require_payroll(text), app.recalc_line(uuid), app.period_locked(uuid, date), app.org_defaults(),
  app.require_hr(), app.note_target_ok(uuid, text, uuid), app.sync_video_tasks(uuid), app.trg_videos_sync_tasks(), app.trg_items_sync_tasks(), app.trg_tasks_guard(),
  app.trg_profile_code(), app.check_dept_staff(uuid, uuid, uuid, boolean), app.sync_dept_manager(uuid) , app.trg_project_manager_sync(), app.trg_finance_period_lock(), app.period_closed(date), app.period_totals(int, int),
  app.notify_direct(uuid, uuid, text, text, text), app.check_price_lines(uuid, jsonb), app.price_event(uuid, text, text), app.price_request_stale(uuid),
  app.apply_price_request(uuid), app.price_current(uuid, uuid, date), app.trg_price_line_guard(), app.trg_price_line_block(), app.trg_catalog_deactivate(), app.opp_line_total(), app.trg_doc_request_event() from authenticated;
