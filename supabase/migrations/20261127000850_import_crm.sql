-- =====================================================================
-- 0850 · Nhập khách hàng từ Excel: tài khoản / liên hệ / lead (một giao dịch, bỏ qua bản ghi trùng)
--   Ứng dụng đã kiểm tra và loại trùng ở bước xem trước; hàm này kiểm tra lại phía CSDL
--   (quyền, tham chiếu cùng doanh nghiệp, trùng do hai người nhập cùng lúc).
-- =====================================================================
create or replace function app.norm_text(p text) returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.import_crm(p_kind text, p_rows jsonb, p_create_accounts boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.require_crm_write();
  r jsonb; v_ins int := 0; v_skip int := 0; v_acc_new int := 0; v_acc uuid; v_name text;
  v_phones text[]; v_emails text[]; v_sites text[]; v_owner uuid; v_ind uuid; v_src uuid;
  v_ln text; v_fn text;
begin
  if p_kind not in ('accounts', 'contacts', 'leads') then raise exception 'Loại dữ liệu nhập không hợp lệ' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Dữ liệu nhập không hợp lệ' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Tối đa 5.000 dòng mỗi lần nhập' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_phones := coalesce(array(select jsonb_array_elements_text(coalesce(r->'phones', '[]'::jsonb))), '{}');
    v_emails := coalesce(array(select lower(jsonb_array_elements_text(coalesce(r->'emails', '[]'::jsonb)))), '{}');
    v_sites  := coalesce(array(select jsonb_array_elements_text(coalesce(r->'websites', '[]'::jsonb))), '{}');
    v_owner := nullif(r->>'owner_id', '')::uuid;
    v_ind := nullif(r->>'industry_id', '')::uuid;
    if v_owner is not null and not exists (select 1 from public.profiles where id = v_owner and org_id = v_org) then v_owner := null; end if;
    if v_ind is not null and not exists (select 1 from public.industries where id = v_ind and org_id = v_org) then v_ind := null; end if;
    v_owner := coalesce(v_owner, auth.uid());

    if p_kind = 'accounts' then
      v_name := trim(coalesce(r->>'name', ''));
      if v_name = '' then v_skip := v_skip + 1; continue; end if;
      if exists (select 1 from public.accounts a where a.org_id = v_org and a.deleted_at is null
                 and (app.norm_text(a.name) = app.norm_text(v_name)
                      or (nullif(trim(r->>'tax_code'), '') is not null and a.tax_code = trim(r->>'tax_code')))) then
        v_skip := v_skip + 1; continue;
      end if;
      insert into public.accounts (org_id, name, type, industry_id, employee_count, annual_revenue, phones, emails, websites, billing_address, tax_code, note, owner_id)
      values (v_org, v_name, coalesce(nullif(r->>'type', ''), 'customer')::public.account_type, v_ind, nullif(r->>'employee_count', '')::int,
              nullif(r->>'annual_revenue', '')::numeric, v_phones, v_emails, v_sites, nullif(trim(r->>'billing_address'), ''), nullif(trim(r->>'tax_code'), ''),
              nullif(trim(r->>'note'), ''), v_owner);
      v_ins := v_ins + 1;

    elsif p_kind = 'contacts' then
      v_ln := trim(coalesce(r->>'last_name', '')); v_fn := trim(coalesce(r->>'first_name', ''));
      if v_ln = '' then v_skip := v_skip + 1; continue; end if;
      v_acc := nullif(r->>'account_id', '')::uuid;
      if v_acc is not null and not exists (select 1 from public.accounts where id = v_acc and org_id = v_org and deleted_at is null) then v_acc := null; end if;
      if v_acc is null and p_create_accounts and nullif(trim(r->>'account_name'), '') is not null then
        select id into v_acc from public.accounts where org_id = v_org and deleted_at is null and app.norm_text(name) = app.norm_text(r->>'account_name') limit 1;
        if v_acc is null then
          insert into public.accounts (org_id, name, owner_id) values (v_org, trim(r->>'account_name'), v_owner) returning id into v_acc;
          v_acc_new := v_acc_new + 1;
        end if;
      end if;
      if exists (select 1 from public.contacts c where c.org_id = v_org and c.deleted_at is null
                 and ((cardinality(v_emails) > 0 and c.emails && v_emails)
                      or (app.norm_text(c.first_name || ' ' || c.last_name) = app.norm_text(v_fn || ' ' || v_ln) and c.account_id is not distinct from v_acc))) then
        v_skip := v_skip + 1; continue;
      end if;
      insert into public.contacts (org_id, salutation, first_name, last_name, account_id, job_title, phones, emails, date_of_birth, note, owner_id)
      values (v_org, nullif(trim(r->>'salutation'), ''), v_fn, v_ln, v_acc, nullif(trim(r->>'job_title'), ''), v_phones, v_emails,
              nullif(r->>'date_of_birth', '')::date, nullif(trim(r->>'note'), ''), v_owner);
      v_ins := v_ins + 1;

    else
      v_ln := trim(coalesce(r->>'last_name', '')); v_fn := trim(coalesce(r->>'first_name', ''));
      if v_ln = '' then v_skip := v_skip + 1; continue; end if;
      v_src := nullif(r->>'source_id', '')::uuid;
      if v_src is not null and not exists (select 1 from public.lead_sources where id = v_src and org_id = v_org) then v_src := null; end if;
      if exists (select 1 from public.leads l where l.org_id = v_org and l.deleted_at is null
                 and ((cardinality(v_emails) > 0 and l.emails && v_emails) or (cardinality(v_phones) > 0 and l.phones && v_phones)
                      or (app.norm_text(l.first_name || ' ' || l.last_name) = app.norm_text(v_fn || ' ' || v_ln)
                          and app.norm_text(l.company) = app.norm_text(r->>'company')))) then
        v_skip := v_skip + 1; continue;
      end if;
      insert into public.leads (org_id, title, first_name, last_name, job_title, company, industry_id, annual_revenue, employee_count, status, rating, source_id,
                                phones, emails, websites, address, note, owner_id)
      values (v_org, nullif(trim(r->>'title'), ''), v_fn, v_ln, nullif(trim(r->>'job_title'), ''), nullif(trim(r->>'company'), ''), v_ind,
              nullif(r->>'annual_revenue', '')::numeric, nullif(r->>'employee_count', '')::int,
              coalesce(nullif(r->>'status', ''), 'new')::public.lead_status, coalesce(nullif(r->>'rating', ''), 'warm')::public.lead_rating, v_src,
              v_phones, v_emails, v_sites, nullif(trim(r->>'address'), ''), nullif(trim(r->>'note'), ''), v_owner);
      v_ins := v_ins + 1;
    end if;
  end loop;
  perform app.write_audit(v_org, 'crm.import', p_kind, null, jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'accounts_created', v_acc_new));
  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'accounts_created', v_acc_new);
end $$;

grant execute on function public.import_crm(text, jsonb, boolean) to authenticated;
grant execute on function app.norm_text(text) to authenticated, service_role;
