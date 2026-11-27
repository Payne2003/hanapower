-- =====================================================================
-- 0860 · Nhập sản phẩm từ Excel (mở rộng import_crm) + sửa thông tin hợp đồng (điều khoản bổ sung, ngày, chữ ký)
--   0850 đã áp dụng trên cloud nên không sửa tại chỗ: hàm được tạo lại đầy đủ ở đây.
--   p_create_accounts: "tự tạo bản ghi tham chiếu chưa có" — công ty (liên hệ) hoặc danh mục / đơn vị (sản phẩm).
-- =====================================================================
create or replace function public.import_crm(p_kind text, p_rows jsonb, p_create_accounts boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.require_crm_write();
  r jsonb; v_ins int := 0; v_skip int := 0; v_acc_new int := 0; v_acc uuid; v_name text;
  v_phones text[]; v_emails text[]; v_sites text[]; v_owner uuid; v_ind uuid; v_src uuid;
  v_ln text; v_fn text; v_code text; v_cat uuid; v_unit uuid; v_made int := 0; v_price numeric;
begin
  if p_kind not in ('accounts', 'contacts', 'leads', 'products') then raise exception 'Loại dữ liệu nhập không hợp lệ' using errcode = '22023'; end if;
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

    elsif p_kind = 'products' then
      v_name := trim(coalesce(r->>'name', ''));
      v_code := nullif(trim(coalesce(r->>'code', '')), '');
      if v_name = '' then v_skip := v_skip + 1; continue; end if;
      v_price := coalesce(nullif(r->>'list_price', '')::numeric, 0);
      if v_price < 0 then v_skip := v_skip + 1; continue; end if;
      if exists (select 1 from public.products p where p.org_id = v_org and p.deleted_at is null
                 and (app.norm_text(p.name) = app.norm_text(v_name) or (v_code is not null and lower(p.code) = lower(v_code)))) then
        v_skip := v_skip + 1; continue;
      end if;
      v_cat := nullif(r->>'category_id', '')::uuid;
      if v_cat is not null and not exists (select 1 from public.product_categories where id = v_cat and org_id = v_org) then v_cat := null; end if;
      if v_cat is null and p_create_accounts and nullif(trim(r->>'category_name'), '') is not null then
        select id into v_cat from public.product_categories where org_id = v_org and deleted_at is null and app.norm_text(name) = app.norm_text(r->>'category_name') limit 1;
        if v_cat is null then insert into public.product_categories (org_id, name) values (v_org, trim(r->>'category_name')) returning id into v_cat; v_made := v_made + 1; end if;
      end if;
      v_unit := nullif(r->>'unit_id', '')::uuid;
      if v_unit is not null and not exists (select 1 from public.product_units where id = v_unit and org_id = v_org) then v_unit := null; end if;
      if v_unit is null and p_create_accounts and nullif(trim(r->>'unit_name'), '') is not null then
        select id into v_unit from public.product_units where org_id = v_org and deleted_at is null and app.norm_text(name) = app.norm_text(r->>'unit_name') limit 1;
        if v_unit is null then insert into public.product_units (org_id, name) values (v_org, trim(r->>'unit_name')) returning id into v_unit; v_made := v_made + 1; end if;
      end if;
      insert into public.products (org_id, name, code, category_id, unit_id, list_price, description, is_active)
      values (v_org, v_name, v_code, v_cat, v_unit, v_price, nullif(trim(r->>'description'), ''), coalesce(nullif(r->>'is_active', '')::boolean, true));
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
  perform app.write_audit(v_org, 'crm.import', p_kind, null, jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'accounts_created', v_acc_new, 'lookups_created', v_made));
  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'accounts_created', v_acc_new, 'lookups_created', v_made);
end $$;


grant execute on function public.import_crm(text, jsonb, boolean) to authenticated;

-- Sửa thông tin hợp đồng. Ngày hiệu lực / hết hạn / ghi chú chỉ sửa khi còn nháp hoặc chờ hiệu lực (giá trị không đổi ở đây:
-- thay đổi giá trị cần phụ lục — chưa có). Thông tin chữ ký ghi nhận được cả khi đã hiệu lực.
create or replace function public.update_contract(
  p_id uuid, p_effective date, p_expiry date, p_note text, p_customer_signed_by text, p_customer_signed_date date, p_company_signed_date date
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); c public.contracts%rowtype; v_months int;
begin
  select * into c from public.contracts where id = p_id and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0002'; end if;
  if c.status in ('cancelled', 'terminated') then raise exception 'Hợp đồng đã hủy / chấm dứt — không sửa được' using errcode = '22023'; end if;
  if p_effective is not null and p_expiry is not null and p_expiry < p_effective then raise exception 'Ngày hết hạn phải sau ngày hiệu lực' using errcode = '22023'; end if;
  if p_customer_signed_date is not null and p_customer_signed_date > app.today() + 1 then raise exception 'Ngày khách ký không được ở tương lai' using errcode = '22023'; end if;
  if c.status in ('draft', 'pending') then
    if p_effective is not null and p_expiry is not null then v_months := greatest(1, round((p_expiry - p_effective) / 30.0)::int); end if;
    update public.contracts set effective_date = p_effective, expiry_date = p_expiry, duration_months = v_months, note = nullif(trim(coalesce(p_note, '')), '') where id = c.id;
  elsif (p_effective, p_expiry, nullif(trim(coalesce(p_note, '')), '')) is distinct from (c.effective_date, c.expiry_date, c.note) then
    raise exception 'Hợp đồng đã có hiệu lực — chỉ ghi nhận được thông tin chữ ký' using errcode = '22023';
  end if;
  update public.contracts set customer_signed_by = nullif(trim(coalesce(p_customer_signed_by, '')), ''), customer_signed_date = p_customer_signed_date,
    company_signed_date = p_company_signed_date where id = c.id;
  perform app.write_audit(v_org, 'contract.update', 'contract', c.id, jsonb_build_object('code', c.code));
end $$;
grant execute on function public.update_contract(uuid, date, date, text, text, date, date) to authenticated;
