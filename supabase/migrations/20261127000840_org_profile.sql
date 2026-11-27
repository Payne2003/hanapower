-- =====================================================================
-- 0840 · Thông tin công ty (in trên báo giá PDF)
-- =====================================================================
alter table public.organizations
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists tax_code text,
  add column if not exists bank_info text;

create or replace function public.save_org_profile(
  p_address text, p_phone text, p_email text, p_website text, p_tax_code text, p_bank_info text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id();
begin
  if v_org is null or not app.has_permission('users.manage') then raise exception 'Chỉ quản trị được sửa thông tin công ty' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null and trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email công ty không hợp lệ' using errcode = '22023'; end if;
  update public.organizations set
    address = nullif(trim(coalesce(p_address, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''), email = nullif(trim(coalesce(p_email, '')), ''),
    website = nullif(trim(coalesce(p_website, '')), ''), tax_code = nullif(trim(coalesce(p_tax_code, '')), ''), bank_info = nullif(trim(coalesce(p_bank_info, '')), '')
  where id = v_org;
  perform app.write_audit(v_org, 'org.profile', 'organization', v_org, '{}'::jsonb);
end $$;

grant execute on function public.save_org_profile(text, text, text, text, text, text) to authenticated;
