-- =====================================================================
-- 0300 · Nhập video từ bảng báo cáo cũ (Google Sheet / Excel)
--   Chỉ Leader (videos.manage_all). Bỏ qua mã đã tồn tại → nhập lại nhiều lần an toàn.
--   p_rows: mảng đối tượng đã được máy chủ ứng dụng chuẩn hóa:
--   { code, title, report_date, stage, content_owner_id, editor_id, resource_url, content_note,
--     handover_status, handover_confirmed_at, editor_note, supplement_count,
--     items: { real_footage, ai_video, script_vo, edit_map }, source }
-- =====================================================================
create or replace function public.import_videos(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.current_org_id();
  r jsonb;
  v_id uuid;
  v_stage public.video_stage;
  v_hs public.handover_status;
  v_inserted int := 0;
  v_skipped text[] := '{}';
  v_max int;
begin
  if v_org is null or not app.has_permission('videos.manage_all') then
    raise exception 'Chỉ Leader / quản lý sản xuất được nhập dữ liệu' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu nhập không hợp lệ' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if exists (select 1 from public.videos where org_id = v_org and code = r->>'code') then
      v_skipped := v_skipped || (r->>'code');
      continue;
    end if;
    if (r->>'content_owner_id') is not null and not app.has_role_of((r->>'content_owner_id')::uuid, 'content') then
      raise exception 'Người phụ trách của % không có vai trò Content', r->>'code' using errcode = '22023';
    end if;
    if (r->>'editor_id') is not null and not app.has_role_of((r->>'editor_id')::uuid, 'editor') then
      raise exception 'Editor của % không có vai trò Editor', r->>'code' using errcode = '22023';
    end if;
    v_stage := (r->>'stage')::public.video_stage;
    v_hs := nullif(r->>'handover_status', '')::public.handover_status;
    if v_stage not in ('idea', 'preparing', 'handover', 'editing') then
      raise exception 'Giai đoạn nhập không hợp lệ cho %', r->>'code' using errcode = '22023';
    end if;

    insert into public.videos (org_id, code, title, report_date, stage, content_owner_id, editor_id, resource_url, content_note,
                               handover_status, handover_submitted_at, handover_confirmed_at, editor_note, supplement_count, created_by)
    values (v_org, r->>'code', r->>'title', (r->>'report_date')::date, v_stage,
            nullif(r->>'content_owner_id', '')::uuid, nullif(r->>'editor_id', '')::uuid,
            nullif(r->>'resource_url', ''), nullif(r->>'content_note', ''),
            v_hs,
            case when v_hs is not null then coalesce((r->>'handover_confirmed_at')::date, (r->>'report_date')::date)::timestamptz end,
            case when v_hs in ('received', 'needs_more') then coalesce((r->>'handover_confirmed_at')::date, (r->>'report_date')::date)::timestamptz end,
            nullif(r->>'editor_note', ''), coalesce((r->>'supplement_count')::int, 0), auth.uid())
    returning id into v_id;

    insert into public.video_items (org_id, video_id, kind, status, updated_by)
    select v_org, v_id, k, coalesce(nullif(r->'items'->>k, ''), 'todo')::public.item_status, auth.uid()
    from unnest(array['real_footage', 'ai_video', 'script_vo', 'edit_map']) k;

    insert into public.video_events (org_id, video_id, actor_id, event_type, to_stage, note)
    values (v_org, v_id, auth.uid(), 'imported', v_stage, nullif(r->>'source', ''));
    v_inserted := v_inserted + 1;
  end loop;

  -- Mã tạo mới tiếp theo phải lớn hơn mã lớn nhất đã có (D0001 → 1)
  select max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int) into v_max from public.videos where org_id = v_org and code ~ '^D\d+$';
  insert into public.org_counters (org_id, last_video_no) values (v_org, coalesce(v_max, 0))
  on conflict (org_id) do update set last_video_no = greatest(public.org_counters.last_video_no, excluded.last_video_no);

  perform app.write_audit(v_org, 'video.import', 'organization', v_org, jsonb_build_object('inserted', v_inserted, 'skipped', to_jsonb(v_skipped)));
  return jsonb_build_object('inserted', v_inserted, 'skipped', to_jsonb(v_skipped));
end $$;

revoke execute on function public.import_videos(jsonb) from public, anon;
grant execute on function public.import_videos(jsonb) to authenticated;
