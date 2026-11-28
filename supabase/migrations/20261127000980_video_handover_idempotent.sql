-- =====================================================================
-- 0980 · Xác nhận bàn giao lặp (bấm hai lần / mở ở hai máy) luôn trả về kết quả nhất quán.
-- Trước đây chỉ lặp "đã nhận đủ" khi video còn ở bước Đang dựng; sang bước sau (chờ duyệt, chờ đăng…) hoặc đang tạm dừng thì báo lỗi.
-- Nay: video đã được xác nhận "nhận đủ" thì xác nhận lại ở BẤT KỲ bước nào sau đó đều không đổi gì và không báo lỗi.
-- =====================================================================
create or replace function public.confirm_handover(p_video_id uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  v := app.lock_video(p_video_id);
  if not (v.editor_id = auth.uid() or app.is_manager()) then
    raise exception 'Chỉ Editor tiếp nhận được xác nhận bàn giao' using errcode = '42501';
  end if;
  if p_decision = 'received' and v.handover_status = 'received' and v.stage <> 'handover' then return; end if; -- xác nhận lặp
  if v.stage <> 'handover' then
    raise exception 'Video không ở bước chờ xác nhận bàn giao' using errcode = '22023';
  end if;
  if p_decision = 'received' then
    update public.videos set stage = 'editing', handover_status = 'received', handover_confirmed_at = now(),
      editor_note = coalesce(v_note, editor_note) where id = v.id;
    perform app.log_video(v, 'handover_received', 'editing', v_note);
    perform app.notify(v.org_id, v.content_owner_id, v.id, 'handover_received', 'Editor đã nhận đủ tài nguyên video ' || v.code);
  elsif p_decision = 'needs_more' then
    if v_note is null then raise exception 'Cần ghi rõ nội dung yêu cầu bổ sung' using errcode = '22023'; end if;
    update public.videos set stage = 'preparing', handover_status = 'needs_more', handover_confirmed_at = now(),
      editor_note = v_note, supplement_count = supplement_count + 1 where id = v.id;
    perform app.log_video(v, 'handover_needs_more', 'preparing', v_note);
    perform app.notify(v.org_id, v.content_owner_id, v.id, 'needs_more', 'Editor yêu cầu bổ sung video ' || v.code || ': ' || v_note);
  else
    raise exception 'Quyết định không hợp lệ' using errcode = '22023';
  end if;
end $$;
