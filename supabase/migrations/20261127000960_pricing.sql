-- =====================================================================
-- 0960 · Sản phẩm & Bảng giá: tệp / ảnh sản phẩm, bảng mặc định, phiên bản giá có ngày hiệu lực,
--        đề nghị thay đổi giá → duyệt → áp dụng, ước tính báo giá, thêm vào cơ hội, điều hành giá.
-- Schema thật (đã xác minh): price_book_products khóa duy nhất (price_book_id, product_id); đơn vị là products.unit_id (một đơn vị / sản phẩm);
-- giá = đơn giá + % phí + % thuế (không lưu tiền phí / thuế); dòng cơ hội và dòng báo giá lưu bản chụp giá tại thời điểm tạo.
-- Quy tắc tính MỘT nơi (app.line_amounts): tạm tính = round(đơn giá × SL, 2); phí = round(tạm tính × %phí / 100, 2);
--   thuế = round((tạm tính + phí) × %thuế / 100, 2); tổng = tạm tính + phí + thuế.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quy tắc tính dòng (dùng chung DB / API / UI / chứng từ)
-- ---------------------------------------------------------------------
create or replace function app.line_amounts(p_price numeric, p_qty numeric, p_fee numeric, p_tax numeric,
  out subtotal numeric, out fee_amount numeric, out tax_amount numeric, out total numeric) returns record
language sql immutable as $$
  select a, b, c, a + b + c from (
    select a, b, round((a + b) * coalesce(p_tax, 0) / 100, 2) c from (
      select a, round(a * coalesce(p_fee, 0) / 100, 2) b from (select round(coalesce(p_price, 0) * coalesce(p_qty, 0), 2) a) s0) s1) s2
$$;

create or replace function app.opp_line_total() returns trigger language plpgsql as $$
begin
  new.total := (app.line_amounts(new.unit_price, new.quantity, new.fee_percent, new.tax_percent)).total;
  return new;
end $$;
update public.opportunity_products set unit_price = unit_price; -- tính lại total theo quy tắc chung (không đổi với số tiền nguyên)

alter table public.quote_items add column product_id uuid;

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
  select coalesce(sum(a.subtotal + a.fee_amount), 0), coalesce(sum(a.total), 0) into v_sub, v_tot
  from public.opportunity_products l cross join lateral app.line_amounts(l.unit_price, l.quantity, l.fee_percent, l.tax_percent) a where l.opportunity_id = o.id;
  insert into public.quotes (org_id, code, opportunity_id, version, expiry_date, subtotal, tax_amount, total, recipient_name, billing_address, shipping_address, note)
  values (v_org, v_code, o.id, v_ver, p_expiry, v_sub, v_tot - v_sub, v_tot,
          nullif(trim(coalesce(ct.salutation, '') || ' ' || coalesce(ct.first_name, '') || ' ' || coalesce(ct.last_name, '')), ''),
          ac.billing_address, ac.shipping_address, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  -- Bản chụp giá: đơn giá, phí, thuế tại thời điểm tạo báo giá (không đổi khi bảng giá đổi sau này)
  insert into public.quote_items (org_id, quote_id, position, description, unit, quantity, unit_price, fee_percent, tax_percent, amount, product_id)
  select v_org, v_id, row_number() over (order by created_at, id), description, unit, quantity, unit_price, fee_percent, tax_percent, total, product_id
  from public.opportunity_products where opportunity_id = o.id;
  perform app.write_audit(v_org, 'quote.create', 'quote', v_id, jsonb_build_object('code', v_code, 'total', v_tot));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Sản phẩm: bảng giá mặc định, ảnh, tệp bán hàng
-- ---------------------------------------------------------------------
alter table public.products add column default_price_book_id uuid, add column image_file_id uuid;
alter table public.products add constraint products_default_pb_fkey foreign key (org_id, default_price_book_id) references public.price_books(org_id, id) on delete set null (default_price_book_id);
create index products_default_pb_idx on public.products(default_price_book_id) where default_price_book_id is not null;

create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  kind text not null default 'document' check (kind in ('image', 'document')),
  name text not null check (length(trim(name)) between 1 and 160),
  mime text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, product_id) references public.products(org_id, id) on delete cascade
);
create index product_files_product_idx on public.product_files(product_id);
create table public.product_file_blobs (file_id uuid primary key references public.product_files(id) on delete cascade, content bytea not null);
alter table public.product_files enable row level security;
alter table public.product_file_blobs enable row level security;
create policy product_files_select on public.product_files for select to authenticated using (org_id = app.current_org_id() and app.can_crm(false));
create policy product_file_blobs_select on public.product_file_blobs for select to authenticated using (exists (select 1 from public.product_files f where f.id = file_id));
alter table public.products add constraint products_image_fk foreign key (image_file_id) references public.product_files(id) on delete set null (image_file_id);

create or replace function public.add_product_file(p_product uuid, p_kind text, p_name text, p_mime text, p_content_base64 text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); v_bin bytea; v_id uuid; v_name text := left(regexp_replace(trim(coalesce(p_name, '')), E'[/\\\\\r\n]', '_', 'g'), 160);
begin
  if not exists (select 1 from public.products where id = p_product and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  if coalesce(p_kind, 'document') not in ('image', 'document') then raise exception 'Loại tệp không hợp lệ' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Thiếu tên tệp' using errcode = '22023'; end if;
  begin v_bin := decode(coalesce(p_content_base64, ''), 'base64'); exception when others then raise exception 'Nội dung tệp không hợp lệ' using errcode = '22023'; end;
  if length(v_bin) = 0 then raise exception 'Tệp rỗng' using errcode = '22023'; end if;
  if length(v_bin) > 5242880 then raise exception 'Tệp tối đa 5 MB' using errcode = '22023'; end if;
  insert into public.product_files (org_id, product_id, kind, name, mime, size_bytes) values (v_org, p_product, coalesce(p_kind, 'document'), v_name, coalesce(nullif(p_mime, ''), 'application/octet-stream'), length(v_bin)) returning id into v_id;
  insert into public.product_file_blobs (file_id, content) values (v_id, v_bin);
  if coalesce(p_kind, 'document') = 'image' then update public.products set image_file_id = v_id where id = p_product; end if;
  perform app.write_audit(v_org, 'product.file_add', 'product', p_product, jsonb_build_object('name', v_name, 'kind', p_kind));
  return v_id;
end $$;

create or replace function public.get_product_file(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('name', f.name, 'mime', f.mime, 'size', f.size_bytes, 'content', encode(b.content, 'base64'))
  from public.product_files f join public.product_file_blobs b on b.file_id = f.id where f.id = p_id
$$;

create or replace function public.delete_product_file(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); f public.product_files%rowtype;
begin
  select * into f from public.product_files where id = p_id and org_id = v_org;
  if not found then raise exception 'Không tìm thấy tệp' using errcode = 'P0002'; end if;
  delete from public.product_files where id = p_id;
  perform app.write_audit(v_org, 'product.file_delete', 'product', f.product_id, jsonb_build_object('name', f.name));
end $$;

create or replace function public.set_product_image(p_product uuid, p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write();
begin
  if p_file is not null and not exists (select 1 from public.product_files where id = p_file and product_id = p_product and kind = 'image' and org_id = v_org) then raise exception 'Chọn một ảnh của sản phẩm này' using errcode = '22023'; end if;
  update public.products set image_file_id = p_file where id = p_product and org_id = v_org;
end $$;

-- Tạo / sửa sản phẩm (một cửa: kiểm tra danh mục, đơn vị, bảng mặc định cùng doanh nghiệp)
create or replace function public.save_product(p_id uuid, p_name text, p_code text default null, p_category uuid default null, p_unit uuid default null,
  p_description text default null, p_active boolean default true, p_default_book uuid default null, p_list_price numeric default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); v_id uuid := p_id; v_code text := nullif(trim(coalesce(p_code, '')), '');
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên sản phẩm / dịch vụ' using errcode = '22023'; end if;
  if p_category is not null and not exists (select 1 from public.product_categories where id = p_category and org_id = v_org) then raise exception 'Không tìm thấy danh mục' using errcode = 'P0002'; end if;
  if p_unit is not null and not exists (select 1 from public.product_units where id = p_unit and org_id = v_org) then raise exception 'Không tìm thấy đơn vị tính' using errcode = 'P0002'; end if;
  if p_default_book is not null and not exists (select 1 from public.price_books where id = p_default_book and org_id = v_org and deleted_at is null) then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  if v_code is not null and exists (select 1 from public.products where org_id = v_org and lower(code) = lower(v_code) and deleted_at is null and id is distinct from p_id) then raise exception 'Mã % đã được dùng cho sản phẩm khác', v_code using errcode = '23505'; end if;
  if p_id is null then
    insert into public.products (org_id, name, code, category_id, unit_id, description, is_active, default_price_book_id, list_price, created_by)
    values (v_org, trim(p_name), v_code, p_category, p_unit, nullif(trim(coalesce(p_description, '')), ''), coalesce(p_active, true), p_default_book, coalesce(p_list_price, 0), auth.uid()) returning id into v_id;
  else
    update public.products set name = trim(p_name), code = v_code, category_id = p_category, unit_id = p_unit, description = nullif(trim(coalesce(p_description, '')), ''),
      is_active = coalesce(p_active, true), default_price_book_id = p_default_book, list_price = coalesce(p_list_price, list_price) where id = p_id and org_id = v_org and deleted_at is null;
    if not found then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  end if;
  perform app.write_audit(v_org, case when p_id is null then 'product.create' else 'product.update' end, 'product', v_id, jsonb_build_object('name', p_name, 'active', p_active));
  return v_id;
end $$;

create or replace function public.set_product_default_book(p_product uuid, p_book uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write();
begin
  if p_book is not null and not exists (select 1 from public.price_books where id = p_book and org_id = v_org and deleted_at is null and is_active) then raise exception 'Chọn bảng giá đang áp dụng' using errcode = '22023'; end if;
  update public.products set default_price_book_id = p_book where id = p_product and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  perform app.write_audit(v_org, 'product.default_book', 'product', p_product, jsonb_build_object('book', p_book));
end $$;

-- Danh mục / đơn vị: không ngừng dùng khi còn sản phẩm đang bán tham chiếu
create or replace function app.trg_catalog_deactivate() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if old.is_active and not new.is_active then
    select count(*) into v_n from public.products where deleted_at is null and is_active and ((tg_table_name = 'product_categories' and category_id = old.id) or (tg_table_name = 'product_units' and unit_id = old.id));
    if v_n > 0 then raise exception 'Còn % sản phẩm đang bán dùng mục này — chuyển các sản phẩm sang mục khác trước khi ngừng sử dụng', v_n using errcode = '23503'; end if;
  end if;
  return new;
end $$;
create trigger product_categories_deactivate before update on public.product_categories for each row execute function app.trg_catalog_deactivate();
create trigger product_units_deactivate before update on public.product_units for each row execute function app.trg_catalog_deactivate();

-- ---------------------------------------------------------------------
-- Bảng giá: phiên bản, lịch sử giá có ngày hiệu lực, quy trình phê duyệt
-- ---------------------------------------------------------------------
alter table public.price_books add column version integer not null default 1, add column requires_approval boolean not null default false;

create table public.price_book_line_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  price_book_id uuid not null,
  product_id uuid not null,
  unit_price numeric not null check (unit_price >= 0),
  fee_percent numeric not null check (fee_percent between 0 and 100),
  tax_percent numeric not null check (tax_percent between 0 and 100),
  effective_from date not null,
  request_id uuid,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- một dòng giá chỉ có MỘT phiên bản bắt đầu hiệu lực tại một ngày → tại mọi thời điểm chỉ có một phiên bản hiệu lực
  unique (price_book_id, product_id, effective_from),
  foreign key (org_id, price_book_id) references public.price_books(org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products(org_id, id) on delete cascade
);
create index price_history_lookup_idx on public.price_book_line_history(price_book_id, product_id, effective_from desc);
insert into public.price_book_line_history (org_id, price_book_id, product_id, unit_price, fee_percent, tax_percent, effective_from)
select org_id, price_book_id, product_id, unit_price, fee_percent, tax_percent, date '2000-01-01' from public.price_book_products;
alter table public.price_book_line_history enable row level security;
create policy price_history_select on public.price_book_line_history for select to authenticated using (org_id = app.current_org_id() and app.can_crm(false));

-- Mọi ghi vào dòng giá hiện hành: (1) bảng cần duyệt chỉ đổi qua hàm áp dụng; (2) tự ghi lịch sử theo ngày hiệu lực.
create or replace function app.trg_price_line_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_book uuid := coalesce(new.price_book_id, old.price_book_id); v_req boolean;
begin
  select requires_approval into v_req from public.price_books where id = v_book;
  if coalesce(v_req, false) and coalesce(current_setting('app.price_apply', true), '') <> 'on' then
    raise exception 'Bảng giá này áp dụng quy trình phê duyệt — gửi đề nghị thay đổi thay vì sửa trực tiếp' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.price_batch', true), '') <> 'on' then update public.price_books set version = version + 1 where id = old.price_book_id; end if;
    return old;
  end if;
  insert into public.price_book_line_history (org_id, price_book_id, product_id, unit_price, fee_percent, tax_percent, effective_from, request_id)
  values (new.org_id, new.price_book_id, new.product_id, new.unit_price, new.fee_percent, new.tax_percent,
          coalesce(nullif(current_setting('app.price_effective_from', true), '')::date, app.today()), nullif(current_setting('app.price_request', true), '')::uuid)
  on conflict (price_book_id, product_id, effective_from) do update set unit_price = excluded.unit_price, fee_percent = excluded.fee_percent, tax_percent = excluded.tax_percent, request_id = excluded.request_id;
  if coalesce(current_setting('app.price_batch', true), '') <> 'on' then update public.price_books set version = version + 1 where id = new.price_book_id; end if;
  return new;
end $$;
create trigger price_lines_guard before delete on public.price_book_products for each row execute function app.trg_price_line_guard();
create trigger price_lines_guard_w after insert or update on public.price_book_products for each row execute function app.trg_price_line_guard();
-- BEFORE cho insert / update để chặn trước khi ghi; AFTER (ở trên) ghi lịch sử. Chặn trước:
create or replace function app.trg_price_line_block() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_req boolean;
begin
  select requires_approval into v_req from public.price_books where id = new.price_book_id;
  if coalesce(v_req, false) and coalesce(current_setting('app.price_apply', true), '') <> 'on' then
    raise exception 'Bảng giá này áp dụng quy trình phê duyệt — gửi đề nghị thay đổi thay vì sửa trực tiếp' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger price_lines_block before insert or update on public.price_book_products for each row execute function app.trg_price_line_block();

-- Giá có hiệu lực của một dòng tại một ngày: phiên bản mới nhất có effective_from <= ngày; dòng đã xóa → không có giá.
create or replace function public.price_lookup(p_book uuid, p_product uuid, p_on date default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('unit_price', coalesce(h.unit_price, c.unit_price), 'fee_percent', coalesce(h.fee_percent, c.fee_percent), 'tax_percent', coalesce(h.tax_percent, c.tax_percent),
    'effective_from', h.effective_from, 'as_of', coalesce(p_on, app.today()))
  from public.price_book_products c
  left join lateral (select * from public.price_book_line_history x where x.price_book_id = p_book and x.product_id = p_product and x.effective_from <= coalesce(p_on, app.today()) order by x.effective_from desc limit 1) h on true
  where c.price_book_id = p_book and c.product_id = p_product
$$;

-- ---------------------------------------------------------------------
-- Đề nghị thay đổi giá
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, permission) values ('manager', 'pricing.approve'), ('system_admin', 'pricing.approve') on conflict do nothing;

create table public.price_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seq bigint generated always as identity,
  code text not null,
  price_book_id uuid not null,
  reason text check (length(reason) <= 1000),
  effective_date date not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'changes_requested', 'cancelled')),
  requested_by uuid not null default auth.uid() references auth.users(id),
  submitted_at timestamptz, decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text, applied_at timestamptz,
  base_version integer not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, code), unique (org_id, id),
  foreign key (org_id, price_book_id) references public.price_books(org_id, id) on delete cascade
);
create index price_requests_book_idx on public.price_change_requests(price_book_id, status);
create table public.price_change_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  request_id uuid not null,
  product_id uuid not null,
  is_new boolean not null default false,
  old_unit_price numeric, old_fee_percent numeric, old_tax_percent numeric,
  new_unit_price numeric not null check (new_unit_price >= 0),
  new_fee_percent numeric not null check (new_fee_percent between 0 and 100),
  new_tax_percent numeric not null check (new_tax_percent between 0 and 100),
  unique (request_id, product_id),
  foreign key (org_id, request_id) references public.price_change_requests(org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products(org_id, id) on delete cascade
);
create table public.price_change_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  request_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null,
  note text,
  created_at timestamptz not null default now(),
  foreign key (org_id, request_id) references public.price_change_requests(org_id, id) on delete cascade
);
alter table public.price_change_requests enable row level security;
alter table public.price_change_lines enable row level security;
alter table public.price_change_events enable row level security;
create policy price_requests_select on public.price_change_requests for select to authenticated
  using (org_id = app.current_org_id() and app.can_crm(false) and (requested_by = auth.uid() or app.can_crm(true) or app.has_permission('pricing.approve')));
create policy price_lines_select on public.price_change_lines for select to authenticated using (exists (select 1 from public.price_change_requests r where r.id = request_id));
create policy price_events_select on public.price_change_events for select to authenticated using (exists (select 1 from public.price_change_requests r where r.id = request_id));

create or replace function app.price_event(p_req uuid, p_action text, p_note text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.price_change_events (org_id, request_id, action, note) select org_id, id, p_action, nullif(trim(coalesce(p_note, '')), '') from public.price_change_requests where id = p_req
$$;

-- Kiểm tra dòng đầu vào: [{product_id, unit_price, fee_percent, tax_percent}]; trả về mảng đã chuẩn hóa. Dòng trùng / sai miền giá trị bị từ chối.
create or replace function app.check_price_lines(p_org uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l jsonb; v_seen uuid[] := '{}'; v_pid uuid; v_out jsonb := '[]'::jsonb; v_price numeric; v_fee numeric; v_tax numeric; v_i int := 0;
begin
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Chưa có dòng giá nào' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 500 then raise exception 'Tối đa 500 dòng mỗi lần lưu' using errcode = '22023'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    begin v_pid := (l ->> 'product_id')::uuid; v_price := (l ->> 'unit_price')::numeric; v_fee := coalesce((l ->> 'fee_percent')::numeric, 0); v_tax := coalesce((l ->> 'tax_percent')::numeric, 0);
    exception when others then raise exception 'Dòng %: dữ liệu không hợp lệ', v_i using errcode = '22023'; end;
    if v_pid is null or v_price is null then raise exception 'Dòng %: thiếu sản phẩm hoặc đơn giá', v_i using errcode = '22023'; end if;
    if v_pid = any (v_seen) then raise exception 'Dòng %: sản phẩm bị trùng trong cùng bảng giá', v_i using errcode = '23505'; end if;
    if v_price < 0 then raise exception 'Dòng %: đơn giá không được âm (giá 0 là hợp lệ)', v_i using errcode = '22023'; end if;
    if v_fee < 0 or v_fee > 100 or v_tax < 0 or v_tax > 100 then raise exception 'Dòng %: phí / thuế phải từ 0 đến 100%%', v_i using errcode = '22023'; end if;
    if scale(v_price) > 2 then raise exception 'Dòng %: đơn giá tối đa 2 chữ số thập phân', v_i using errcode = '22023'; end if;
    if not exists (select 1 from public.products where id = v_pid and org_id = p_org and deleted_at is null) then raise exception 'Dòng %: không tìm thấy sản phẩm', v_i using errcode = 'P0002'; end if;
    v_seen := v_seen || v_pid;
    v_out := v_out || jsonb_build_object('product_id', v_pid, 'unit_price', v_price, 'fee_percent', v_fee, 'tax_percent', v_tax);
  end loop;
  return v_out;
end $$;

-- Lưu trực tiếp (bảng KHÔNG cần duyệt). Một giao dịch; xung đột phiên bản khi người khác đã sửa trong lúc bạn đang mở.
create or replace function public.save_price_lines(p_book uuid, p_base_version integer, p_lines jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); b public.price_books%rowtype; v_lines jsonb; l jsonb; v_n int := 0; v_d int := 0;
begin
  select * into b from public.price_books where id = p_book and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  if b.requires_approval then raise exception 'Bảng giá này áp dụng quy trình phê duyệt — dùng “Gửi đề nghị thay đổi”' using errcode = '42501'; end if;
  if b.version <> p_base_version then raise exception 'Bảng giá đã được người khác sửa (phiên bản % → %). Tải lại để đối chiếu rồi lưu lại', p_base_version, b.version using errcode = '40001'; end if;
  perform set_config('app.price_batch', 'on', true);
  if cardinality(coalesce(p_delete, '{}')) > 0 then
    delete from public.price_book_products where price_book_id = p_book and product_id = any (p_delete); get diagnostics v_d = row_count;
  end if;
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    v_lines := app.check_price_lines(v_org, p_lines);
    for l in select * from jsonb_array_elements(v_lines) loop
      insert into public.price_book_products (org_id, price_book_id, product_id, unit_price, fee_percent, tax_percent)
      values (v_org, p_book, (l ->> 'product_id')::uuid, (l ->> 'unit_price')::numeric, (l ->> 'fee_percent')::numeric, (l ->> 'tax_percent')::numeric)
      on conflict (price_book_id, product_id) do update set unit_price = excluded.unit_price, fee_percent = excluded.fee_percent, tax_percent = excluded.tax_percent
      where (price_book_products.unit_price, price_book_products.fee_percent, price_book_products.tax_percent) is distinct from (excluded.unit_price, excluded.fee_percent, excluded.tax_percent);
      v_n := v_n + 1;
    end loop;
  end if;
  update public.price_books set version = version + 1 where id = p_book;
  perform set_config('app.price_batch', 'off', true);
  perform app.write_audit(v_org, 'pricebook.save', 'price_book', p_book, jsonb_build_object('lines', v_n, 'deleted', v_d));
  return jsonb_build_object('version', b.version + 1, 'saved', v_n, 'deleted', v_d);
end $$;

create or replace function public.set_price_book_options(p_book uuid, p_requires_approval boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_permission('pricing.approve') then raise exception 'Chỉ người duyệt giá được đổi chế độ phê duyệt của bảng giá' using errcode = '42501'; end if;
  update public.price_books set requires_approval = coalesce(p_requires_approval, false) where id = p_book and org_id = app.current_org_id() and deleted_at is null;
  if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  perform app.write_audit(app.current_org_id(), 'pricebook.options', 'price_book', p_book, jsonb_build_object('requires_approval', p_requires_approval));
end $$;

-- Soạn / sửa đề nghị (người lập giá = người có crm.manage). Giá "trước" lấy từ dòng hiện hành tại thời điểm lưu.
create or replace function public.save_price_change(p_id uuid, p_book uuid, p_reason text, p_effective date, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); b public.price_books%rowtype; r public.price_change_requests%rowtype; v_id uuid := p_id; v_lines jsonb; l jsonb;
  c public.price_book_products%rowtype; v_changed int := 0;
begin
  select * into b from public.price_books where id = p_book and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  if p_effective is null or p_effective < app.today() then raise exception 'Ngày hiệu lực phải từ hôm nay trở đi' using errcode = '22023'; end if;
  v_lines := app.check_price_lines(v_org, p_lines);
  if p_id is null then
    insert into public.price_change_requests (org_id, code, price_book_id, reason, effective_date, base_version)
    values (v_org, gen_random_uuid()::text, p_book, nullif(trim(coalesce(p_reason, '')), ''), p_effective, b.version) returning id into v_id;
    update public.price_change_requests set code = 'DNG' || to_char(app.today(), 'YYMM') || '-' || lpad(seq::text, 4, '0') where id = v_id;
    perform app.price_event(v_id, 'created');
  else
    select * into r from public.price_change_requests where id = p_id and org_id = v_org for update;
    if not found then raise exception 'Không tìm thấy đề nghị' using errcode = 'P0002'; end if;
    if r.requested_by <> auth.uid() then raise exception 'Chỉ người lập đề nghị được sửa' using errcode = '42501'; end if;
    if r.status not in ('draft', 'changes_requested') then raise exception 'Đề nghị đang ở trạng thái không sửa được' using errcode = '22023'; end if;
    if r.price_book_id <> p_book then raise exception 'Không đổi bảng giá của đề nghị đã tạo' using errcode = '22023'; end if;
    update public.price_change_requests set reason = nullif(trim(coalesce(p_reason, '')), ''), effective_date = p_effective, base_version = b.version, updated_at = now() where id = p_id;
    delete from public.price_change_lines where request_id = p_id;
    perform app.price_event(p_id, 'edited');
  end if;
  for l in select * from jsonb_array_elements(v_lines) loop
    select * into c from public.price_book_products where price_book_id = p_book and product_id = (l ->> 'product_id')::uuid;
    if found and c.unit_price = (l ->> 'unit_price')::numeric and c.fee_percent = (l ->> 'fee_percent')::numeric and c.tax_percent = (l ->> 'tax_percent')::numeric then continue; end if;
    insert into public.price_change_lines (org_id, request_id, product_id, is_new, old_unit_price, old_fee_percent, old_tax_percent, new_unit_price, new_fee_percent, new_tax_percent)
    values (v_org, v_id, (l ->> 'product_id')::uuid, not found, c.unit_price, c.fee_percent, c.tax_percent, (l ->> 'unit_price')::numeric, (l ->> 'fee_percent')::numeric, (l ->> 'tax_percent')::numeric);
    v_changed := v_changed + 1;
  end loop;
  if v_changed = 0 then raise exception 'Không có dòng nào khác giá hiện hành — không cần đề nghị' using errcode = '22023'; end if;
  return v_id;
end $$;

create or replace function public.submit_price_change(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); r public.price_change_requests%rowtype; b public.price_books%rowtype;
begin
  select * into r from public.price_change_requests where id = p_id and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy đề nghị' using errcode = 'P0002'; end if;
  if r.requested_by <> auth.uid() then raise exception 'Chỉ người lập đề nghị được gửi' using errcode = '42501'; end if;
  if r.status not in ('draft', 'changes_requested') then raise exception 'Đề nghị đã gửi hoặc đã xử lý' using errcode = '22023'; end if;
  if not exists (select 1 from public.price_change_lines where request_id = p_id) then raise exception 'Đề nghị chưa có dòng thay đổi' using errcode = '22023'; end if;
  if r.effective_date < app.today() then raise exception 'Ngày hiệu lực đã qua — sửa ngày hiệu lực trước khi gửi' using errcode = '22023'; end if;
  select * into b from public.price_books where id = r.price_book_id;
  update public.price_change_requests set status = 'pending', submitted_at = now(), decided_by = null, decided_at = null, decision_note = null, updated_at = now() where id = p_id;
  perform app.price_event(p_id, 'submitted');
  perform app.notify_permission(v_org, 'pricing.approve', 'price_request', 'Đề nghị đổi giá ' || r.code || ' (' || b.name || ') chờ duyệt', '/bang-gia/de-nghi/' || p_id::text);
end $$;

create or replace function public.cancel_price_change(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.price_change_requests%rowtype;
begin
  select * into r from public.price_change_requests where id = p_id and org_id = app.current_org_id() for update;
  if not found or r.requested_by <> auth.uid() then raise exception 'Không tìm thấy đề nghị của bạn' using errcode = 'P0002'; end if;
  if r.status not in ('draft', 'changes_requested', 'pending') then raise exception 'Đề nghị đã được duyệt hoặc đã hủy' using errcode = '22023'; end if;
  update public.price_change_requests set status = 'cancelled', updated_at = now() where id = p_id;
  perform app.price_event(p_id, 'cancelled');
end $$;

-- Đối chiếu lại giá "trước" với bảng giá hiện hành (khi dữ liệu gốc đổi trong lúc chờ) và đưa về nháp để gửi lại.
create or replace function public.rebase_price_change(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.price_change_requests%rowtype; c public.price_book_products%rowtype; ln public.price_change_lines%rowtype; b public.price_books%rowtype;
begin
  select * into r from public.price_change_requests where id = p_id and org_id = app.current_org_id() for update;
  if not found or r.requested_by <> auth.uid() then raise exception 'Không tìm thấy đề nghị của bạn' using errcode = 'P0002'; end if;
  if r.status not in ('draft', 'changes_requested', 'pending') then raise exception 'Đề nghị đã được duyệt hoặc đã hủy' using errcode = '22023'; end if;
  select * into b from public.price_books where id = r.price_book_id;
  for ln in select * from public.price_change_lines where request_id = p_id loop
    select * into c from public.price_book_products where price_book_id = r.price_book_id and product_id = ln.product_id;
    if found and c.unit_price = ln.new_unit_price and c.fee_percent = ln.new_fee_percent and c.tax_percent = ln.new_tax_percent then
      delete from public.price_change_lines where id = ln.id; -- đã trùng giá đề nghị → bỏ dòng
    else
      update public.price_change_lines set is_new = not found, old_unit_price = c.unit_price, old_fee_percent = c.fee_percent, old_tax_percent = c.tax_percent where id = ln.id;
    end if;
  end loop;
  update public.price_change_requests set status = 'draft', base_version = b.version, updated_at = now(), submitted_at = null where id = p_id;
  perform app.price_event(p_id, 'rebased', 'Đối chiếu lại giá hiện hành');
end $$;

-- Trạng thái "dòng gốc đã đổi" của một đề nghị: giá trước ≠ giá hiện hành, hoặc dòng mới nay đã tồn tại
create or replace function app.price_request_stale(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.price_change_lines ln join public.price_change_requests r on r.id = ln.request_id
    left join public.price_book_products c on c.price_book_id = r.price_book_id and c.product_id = ln.product_id
    where ln.request_id = p_id and ((ln.is_new and c.id is not null) or (not ln.is_new and (c.id is null or (c.unit_price, c.fee_percent, c.tax_percent) is distinct from (ln.old_unit_price, ln.old_fee_percent, ln.old_tax_percent)))))
$$;

create or replace function app.apply_price_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.price_change_requests%rowtype; ln public.price_change_lines%rowtype;
begin
  select * into r from public.price_change_requests where id = p_id for update;
  if r.status <> 'approved' or r.applied_at is not null then return; end if;
  perform set_config('app.price_apply', 'on', true);
  perform set_config('app.price_batch', 'on', true);
  perform set_config('app.price_effective_from', r.effective_date::text, true);
  perform set_config('app.price_request', r.id::text, true);
  for ln in select * from public.price_change_lines where request_id = p_id loop
    insert into public.price_book_products (org_id, price_book_id, product_id, unit_price, fee_percent, tax_percent)
    values (r.org_id, r.price_book_id, ln.product_id, ln.new_unit_price, ln.new_fee_percent, ln.new_tax_percent)
    on conflict (price_book_id, product_id) do update set unit_price = excluded.unit_price, fee_percent = excluded.fee_percent, tax_percent = excluded.tax_percent;
  end loop;
  update public.price_books set version = version + 1 where id = r.price_book_id;
  update public.price_change_requests set applied_at = now(), updated_at = now() where id = p_id;
  insert into public.price_change_events (org_id, request_id, actor_id, action, note) values (r.org_id, p_id, null, 'applied', 'Có hiệu lực ' || r.effective_date::text);
  perform set_config('app.price_apply', 'off', true); perform set_config('app.price_batch', 'off', true);
  perform set_config('app.price_effective_from', '', true); perform set_config('app.price_request', '', true);
  perform app.notify_link(r.org_id, r.requested_by, 'price_request', 'Đề nghị đổi giá ' || r.code || ' đã có hiệu lực', '/bang-gia/de-nghi/' || p_id::text);
end $$;

-- Áp dụng các đề nghị đã duyệt tới ngày hiệu lực (theo ngày của doanh nghiệp). Idempotent; gọi trước mọi thao tác đọc giá.
create or replace function public.apply_due_price_changes() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); r record; v_n int := 0;
begin
  if v_org is null then return 0; end if;
  for r in select id from public.price_change_requests where org_id = v_org and status = 'approved' and applied_at is null and effective_date <= app.today() order by effective_date, created_at loop
    perform app.apply_price_request(r.id); v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.decide_price_change(p_id uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); r public.price_change_requests%rowtype; b public.price_books%rowtype; v_conflict text;
begin
  if not app.has_permission('pricing.approve') then raise exception 'Bạn không có quyền duyệt đề nghị giá' using errcode = '42501'; end if;
  select * into r from public.price_change_requests where id = p_id and org_id = v_org for update;
  if not found then raise exception 'Không tìm thấy đề nghị' using errcode = 'P0002'; end if;
  if r.requested_by = auth.uid() then raise exception 'Người lập đề nghị không được tự duyệt' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'Đề nghị không ở trạng thái chờ duyệt' using errcode = '22023'; end if;
  select * into b from public.price_books where id = r.price_book_id;
  if p_decision = 'approve' then
    if r.effective_date < app.today() then raise exception 'Ngày hiệu lực đã qua — người lập cần sửa ngày hiệu lực rồi gửi lại' using errcode = '22023'; end if;
    if app.price_request_stale(p_id) then raise exception 'Dữ liệu gốc của bảng giá đã thay đổi trong lúc chờ duyệt — yêu cầu người lập đối chiếu lại (“Đối chiếu giá hiện hành”) trước khi duyệt' using errcode = '40001'; end if;
    select string_agg(distinct pr.name, ', ') into v_conflict from public.price_change_lines ln join public.products pr on pr.id = ln.product_id
      where ln.request_id = p_id and exists (select 1 from public.price_change_lines l2 join public.price_change_requests r2 on r2.id = l2.request_id
        where l2.product_id = ln.product_id and r2.price_book_id = r.price_book_id and r2.id <> r.id and r2.status = 'approved' and r2.applied_at is null and r2.effective_date = r.effective_date);
    if v_conflict is not null then raise exception 'Đã có đề nghị khác được duyệt cùng ngày hiệu lực cho: % — mỗi dòng giá chỉ có một phiên bản hiệu lực tại một thời điểm', v_conflict using errcode = '23505'; end if;
    update public.price_change_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
    perform app.price_event(p_id, 'approved', p_note);
    if r.effective_date <= app.today() then perform app.apply_price_request(p_id); else
      perform app.notify_link(v_org, r.requested_by, 'price_request', 'Đề nghị đổi giá ' || r.code || ' đã được duyệt, có hiệu lực ' || to_char(r.effective_date, 'DD/MM/YYYY'), '/bang-gia/de-nghi/' || p_id::text);
    end if;
  elsif p_decision = 'request_changes' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Nhập ý kiến để yêu cầu chỉnh sửa' using errcode = '22023'; end if;
    update public.price_change_requests set status = 'changes_requested', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note), updated_at = now() where id = p_id;
    perform app.price_event(p_id, 'changes_requested', p_note);
    perform app.notify_link(v_org, r.requested_by, 'price_request', 'Đề nghị đổi giá ' || r.code || ' cần chỉnh sửa: ' || left(trim(p_note), 80), '/bang-gia/de-nghi/' || p_id::text);
  else raise exception 'Quyết định không hợp lệ' using errcode = '22023'; end if;
  perform app.write_audit(v_org, 'price_request.' || p_decision, 'price_request', p_id, jsonb_build_object('code', r.code, 'book', b.name));
end $$;

-- ---------------------------------------------------------------------
-- Ước tính báo giá, thêm vào cơ hội, đối chiếu giá cơ hội / báo giá nháp
-- ---------------------------------------------------------------------
create or replace function public.price_estimate(p_product uuid, p_book uuid, p_qty numeric, p_on date default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_p jsonb; v_pr public.products%rowtype; v_b public.price_books%rowtype; v_unit text; a record;
begin
  if coalesce(p_qty, 0) <= 0 then raise exception 'Số lượng phải lớn hơn 0' using errcode = '22023'; end if;
  select * into v_pr from public.products where id = p_product; if not found then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  select * into v_b from public.price_books where id = p_book; if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  select name into v_unit from public.product_units where id = v_pr.unit_id;
  v_p := public.price_lookup(p_book, p_product, p_on);
  if v_p is null then raise exception 'Bảng giá “%” chưa có dòng giá cho “%” (đơn vị %). Bổ sung dòng giá trước khi báo giá', v_b.name, v_pr.name, coalesce(v_unit, 'chưa đặt') using errcode = 'P0002'; end if;
  select * into a from app.line_amounts((v_p ->> 'unit_price')::numeric, p_qty, (v_p ->> 'fee_percent')::numeric, (v_p ->> 'tax_percent')::numeric);
  return jsonb_build_object('product_id', p_product, 'product_name', v_pr.name, 'book_id', p_book, 'book_name', v_b.name, 'unit', v_unit, 'quantity', p_qty,
    'unit_price', (v_p ->> 'unit_price')::numeric, 'fee_percent', (v_p ->> 'fee_percent')::numeric, 'tax_percent', (v_p ->> 'tax_percent')::numeric,
    'subtotal', a.subtotal, 'fee_amount', a.fee_amount, 'tax_amount', a.tax_amount, 'total', a.total, 'effective_from', v_p -> 'effective_from', 'as_of', v_p -> 'as_of');
end $$;

-- Thêm dòng có giá vào cơ hội. Khác bảng giá của cơ hội → trả về chênh lệch, chờ người dùng chọn cách xử lý:
--   use_opportunity_book (giữ bảng của cơ hội) · use_selected_book (giá bảng đã chọn cho dòng này) · switch_book (đổi bảng giá của cơ hội, dòng cũ giữ nguyên)
create or replace function public.add_priced_line(p_opp uuid, p_product uuid, p_book uuid, p_qty numeric, p_mismatch text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); o public.opportunities%rowtype; v_use uuid := p_book; v_est jsonb; v_est_opp jsonb; v_id uuid; v_pr public.products%rowtype; v_unit text;
begin
  perform public.apply_due_price_changes();
  select * into o from public.opportunities where id = p_opp and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy cơ hội' using errcode = 'P0002'; end if;
  if o.stage in ('won', 'lost') then raise exception 'Cơ hội đã đóng — không thêm sản phẩm được' using errcode = '22023'; end if;
  select * into v_pr from public.products where id = p_product and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  if not v_pr.is_active then raise exception 'Sản phẩm đã ngừng kinh doanh — không thêm vào cơ hội mới' using errcode = '22023'; end if;
  if o.price_book_id is not null and o.price_book_id <> p_book then
    if p_mismatch is null then
      v_est := public.price_estimate(p_product, p_book, p_qty);
      begin v_est_opp := public.price_estimate(p_product, o.price_book_id, p_qty); exception when others then v_est_opp := null; end;
      return jsonb_build_object('status', 'mismatch', 'opportunity_book_id', o.price_book_id, 'selected', v_est, 'opportunity', v_est_opp,
        'diff', case when v_est_opp is not null then (v_est ->> 'total')::numeric - (v_est_opp ->> 'total')::numeric end);
    end if;
    if p_mismatch = 'use_opportunity_book' then v_use := o.price_book_id;
    elsif p_mismatch in ('use_selected_book', 'switch_book') then v_use := p_book;
    else raise exception 'Cách xử lý không hợp lệ' using errcode = '22023'; end if;
  end if;
  v_est := public.price_estimate(p_product, v_use, p_qty);
  select name into v_unit from public.product_units where id = v_pr.unit_id;
  insert into public.opportunity_products (org_id, opportunity_id, product_id, description, unit, unit_price, quantity, fee_percent, tax_percent)
  values (v_org, p_opp, p_product, v_pr.name, v_unit, (v_est ->> 'unit_price')::numeric, p_qty, (v_est ->> 'fee_percent')::numeric, (v_est ->> 'tax_percent')::numeric) returning id into v_id;
  if o.price_book_id is null or p_mismatch = 'switch_book' then update public.opportunities set price_book_id = v_use where id = p_opp; end if;
  perform app.write_audit(v_org, 'opportunity.add_priced_line', 'opportunity', p_opp, jsonb_build_object('product', v_pr.name, 'book', v_use, 'qty', p_qty, 'unit_price', v_est -> 'unit_price'));
  return jsonb_build_object('status', 'added', 'line_id', v_id, 'estimate', v_est, 'book_id', v_use);
end $$;

-- Giá đang hiệu lực (bản security definer dùng nội bộ cho các hàm đối chiếu)
create or replace function app.price_current(p_book uuid, p_product uuid, p_on date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('unit_price', coalesce(h.unit_price, c.unit_price), 'fee_percent', coalesce(h.fee_percent, c.fee_percent), 'tax_percent', coalesce(h.tax_percent, c.tax_percent))
  from public.price_book_products c
  left join lateral (select * from public.price_book_line_history x where x.price_book_id = p_book and x.product_id = p_product and x.effective_from <= p_on order by x.effective_from desc limit 1) h on true
  where c.price_book_id = p_book and c.product_id = p_product
$$;

-- Đối chiếu giá dòng cơ hội với giá đang hiệu lực của bảng giá của cơ hội (không tự đổi)
create or replace function public.opportunity_price_diff(p_opp uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); o public.opportunities%rowtype; v_today date;
begin
  if not app.can_crm(false) then raise exception 'Bạn không có quyền xem CRM' using errcode = '42501'; end if;
  perform public.apply_due_price_changes();
  v_today := app.today();
  select * into o from public.opportunities where id = p_opp and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy cơ hội' using errcode = 'P0002'; end if;
  return jsonb_build_object('book_id', o.price_book_id, 'lines', coalesce((
    select jsonb_agg(jsonb_build_object('line_id', s.id, 'product_id', s.product_id, 'description', s.description, 'quantity', s.quantity,
      'old_unit_price', s.unit_price, 'old_fee_percent', s.fee_percent, 'old_tax_percent', s.tax_percent, 'old_total', s.total,
      'new_unit_price', s.nu, 'new_fee_percent', s.nf, 'new_tax_percent', s.nt, 'new_total', n.total,
      'diff', case when s.pc is null then null else n.total - s.total end,
      'changed', s.pc is not null and (s.unit_price, s.fee_percent, s.tax_percent) is distinct from (s.nu, s.nf, s.nt),
      'missing', s.pc is null and s.product_id is not null and o.price_book_id is not null) order by s.created_at, s.id)
    from (select l.*, pc, (pc ->> 'unit_price')::numeric nu, (pc ->> 'fee_percent')::numeric nf, (pc ->> 'tax_percent')::numeric nt
          from public.opportunity_products l
          cross join lateral (select case when o.price_book_id is null or l.product_id is null then null else app.price_current(o.price_book_id, l.product_id, v_today) end pc) x
          where l.opportunity_id = p_opp) s
    cross join lateral app.line_amounts(coalesce(s.nu, s.unit_price), s.quantity, coalesce(s.nf, s.fee_percent), coalesce(s.nt, s.tax_percent)) n), '[]'::jsonb));
end $$;

-- Áp dụng giá hiện hành cho các dòng được chọn (người dùng đã xem chênh lệch và xác nhận)
create or replace function public.refresh_opportunity_prices(p_opp uuid, p_lines uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); o public.opportunities%rowtype; v_n int := 0; ln record; v_pc jsonb;
begin
  perform public.apply_due_price_changes();
  select * into o from public.opportunities where id = p_opp and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy cơ hội' using errcode = 'P0002'; end if;
  if o.stage in ('won', 'lost') then raise exception 'Cơ hội đã đóng — không đổi giá được' using errcode = '22023'; end if;
  if o.price_book_id is null then raise exception 'Cơ hội chưa chọn bảng giá' using errcode = '22023'; end if;
  for ln in select * from public.opportunity_products where opportunity_id = p_opp and id = any (coalesce(p_lines, '{}')) and product_id is not null loop
    v_pc := app.price_current(o.price_book_id, ln.product_id, app.today());
    if v_pc is null then continue; end if;
    update public.opportunity_products set unit_price = (v_pc ->> 'unit_price')::numeric, fee_percent = (v_pc ->> 'fee_percent')::numeric, tax_percent = (v_pc ->> 'tax_percent')::numeric where id = ln.id; v_n := v_n + 1;
  end loop;
  perform app.write_audit(v_org, 'opportunity.refresh_prices', 'opportunity', p_opp, jsonb_build_object('lines', v_n));
  return v_n;
end $$;

-- Báo giá NHÁP: xem chênh lệch rồi xác nhận mới cập nhật. Báo giá đã gửi / duyệt giữ nguyên bản chụp giá.
create or replace function public.quote_price_diff(p_quote uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.current_org_id(); q public.quotes%rowtype; o public.opportunities%rowtype;
begin
  if not app.can_crm(false) then raise exception 'Bạn không có quyền xem CRM' using errcode = '42501'; end if;
  perform public.apply_due_price_changes();
  select * into q from public.quotes where id = p_quote and org_id = v_org and deleted_at is null;
  if not found then raise exception 'Không tìm thấy báo giá' using errcode = 'P0002'; end if;
  select * into o from public.opportunities where id = q.opportunity_id;
  return jsonb_build_object('status', q.status, 'editable', q.status = 'draft', 'book_id', o.price_book_id, 'lines', coalesce((
    select jsonb_agg(jsonb_build_object('line_id', s.id, 'description', s.description, 'quantity', s.quantity, 'old_unit_price', s.unit_price, 'old_total', s.amount,
      'new_unit_price', s.nu, 'new_fee_percent', s.nf, 'new_tax_percent', s.nt, 'new_total', n.total, 'diff', case when s.pc is null then null else n.total - s.amount end,
      'changed', s.pc is not null and (s.unit_price, s.fee_percent, s.tax_percent) is distinct from (s.nu, s.nf, s.nt)) order by s.position)
    from (select i.*, pc, (pc ->> 'unit_price')::numeric nu, (pc ->> 'fee_percent')::numeric nf, (pc ->> 'tax_percent')::numeric nt
          from public.quote_items i
          cross join lateral (select case when o.price_book_id is null or i.product_id is null then null else app.price_current(o.price_book_id, i.product_id, app.today()) end pc) x
          where i.quote_id = p_quote) s
    cross join lateral app.line_amounts(coalesce(s.nu, s.unit_price), s.quantity, coalesce(s.nf, s.fee_percent), coalesce(s.nt, s.tax_percent)) n), '[]'::jsonb));
end $$;

create or replace function public.refresh_quote_prices(p_quote uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); q public.quotes%rowtype; o public.opportunities%rowtype; i record; v_pc jsonb; v_n int := 0; v_sub numeric; v_tot numeric;
begin
  perform public.apply_due_price_changes();
  select * into q from public.quotes where id = p_quote and org_id = v_org and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy báo giá' using errcode = 'P0002'; end if;
  if q.status <> 'draft' then raise exception 'Chỉ báo giá nháp được cập nhật giá — báo giá đã gửi giữ nguyên giá đã chào' using errcode = '22023'; end if;
  select * into o from public.opportunities where id = q.opportunity_id;
  if o.price_book_id is null then raise exception 'Cơ hội chưa chọn bảng giá' using errcode = '22023'; end if;
  for i in select * from public.quote_items where quote_id = p_quote and product_id is not null loop
    v_pc := app.price_current(o.price_book_id, i.product_id, app.today());
    if v_pc is null then continue; end if;
    update public.quote_items set unit_price = (v_pc ->> 'unit_price')::numeric, fee_percent = (v_pc ->> 'fee_percent')::numeric, tax_percent = (v_pc ->> 'tax_percent')::numeric,
      amount = (app.line_amounts((v_pc ->> 'unit_price')::numeric, i.quantity, (v_pc ->> 'fee_percent')::numeric, (v_pc ->> 'tax_percent')::numeric)).total where id = i.id; v_n := v_n + 1;
  end loop;
  select coalesce(sum(a.subtotal + a.fee_amount), 0), coalesce(sum(a.total), 0) into v_sub, v_tot
  from public.quote_items it cross join lateral app.line_amounts(it.unit_price, it.quantity, it.fee_percent, it.tax_percent) a where it.quote_id = p_quote;
  update public.quotes set subtotal = v_sub, tax_amount = v_tot - v_sub, total = v_tot where id = p_quote;
  perform app.write_audit(v_org, 'quote.refresh_prices', 'quote', p_quote, jsonb_build_object('lines', v_n, 'total', v_tot));
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Đọc: danh sách sản phẩm, điều hành giá, so sánh giá, bảng giá, đề nghị, danh mục
-- ---------------------------------------------------------------------
-- Vấn đề giá của sản phẩm đang bán: no_default (chưa chọn bảng mặc định) · default_inactive (bảng mặc định đã ngừng / xóa) · no_line (bảng mặc định chưa có dòng giá).
-- Giá 0 là hợp lệ: chỉ thiếu dòng mới là lỗi.
create or replace function public.price_health() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_res jsonb;
begin
  with p as (
    select pr.id, pr.code, pr.name, pr.default_price_book_id, b.name book_name, b.is_active b_active, b.id b_id,
      case when pr.default_price_book_id is null then 'no_default' when b.id is null or not b.is_active then 'default_inactive'
           when not exists (select 1 from public.price_book_products x where x.price_book_id = pr.default_price_book_id and x.product_id = pr.id) then 'no_line' end issue
    from public.products pr left join public.price_books b on b.id = pr.default_price_book_id and b.deleted_at is null
    where pr.deleted_at is null and pr.is_active)
  select jsonb_build_object('active_products', (select count(*) from p), 'missing_products', (select count(*) from p where issue is not null),
    'by_issue', coalesce((select jsonb_object_agg(issue, n) from (select issue, count(*) n from p where issue is not null group by 1) q), '{}'::jsonb),
    'pending_requests', (select count(*) from public.price_change_requests where status = 'pending'),
    'waiting_effective', (select count(*) from public.price_change_requests where status = 'approved' and applied_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', id, 'code', code, 'name', name, 'issue', issue, 'default_book_id', default_price_book_id, 'default_book_name', book_name) order by name) from p where issue is not null), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

create or replace function public.product_list(p_q text default null, p_category uuid default null, p_unit uuid default null, p_book uuid default null, p_status text default null,
  p_sort text default 'name', p_dir text default 'asc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_order text; v_res jsonb; v_like text := case when nullif(trim(coalesce(p_q, '')), '') is null then null else '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_lim int := least(greatest(coalesce(p_limit, 20), 1), 500); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  v_order := (case p_sort when 'code' then 'r.code' when 'category' then 'r.category_name' when 'unit' then 'r.unit_name' when 'price' then 'r.default_price' else 'r.name' end)
    || case when lower(coalesce(p_dir, 'asc')) = 'desc' then ' desc nulls last' else ' asc nulls last' end || ', r.name, r.id';
  execute format($f$
    with r as (
      select pr.id, pr.code, pr.name, pr.is_active, pr.category_id, c.name category_name, pr.unit_id, u.name unit_name, pr.default_price_book_id, b.name default_book_name, pr.image_file_id, pr.description, pr.list_price,
        (select (x.unit_price) from public.price_book_products x where x.price_book_id = pr.default_price_book_id and x.product_id = pr.id) default_price,
        (select count(*) from public.product_files f where f.product_id = pr.id)::int file_count,
        (select count(*) from public.price_book_products x where x.product_id = pr.id)::int line_count,
        case when not pr.is_active then null when pr.default_price_book_id is null then 'no_default' when b.id is null or not b.is_active then 'default_inactive'
             when not exists (select 1 from public.price_book_products x where x.price_book_id = pr.default_price_book_id and x.product_id = pr.id) then 'no_line' end price_issue
      from public.products pr left join public.product_categories c on c.id = pr.category_id left join public.product_units u on u.id = pr.unit_id
      left join public.price_books b on b.id = pr.default_price_book_id and b.deleted_at is null
      where pr.deleted_at is null
        and ($1::text is null or pr.name ilike $1 or coalesce(pr.code, '') ilike $1) and ($2::uuid is null or pr.category_id = $2) and ($3::uuid is null or pr.unit_id = $3)
        and ($4::uuid is null or pr.default_price_book_id = $4 or exists (select 1 from public.price_book_products x where x.price_book_id = $4 and x.product_id = pr.id)))
    select jsonb_build_object('total', (select count(*) from r where $5::text is null or ($5 = 'active' and is_active) or ($5 = 'inactive' and not is_active) or ($5 = 'missing' and price_issue is not null)),
      'counts', jsonb_build_object('all', (select count(*) from r), 'active', (select count(*) from r where is_active), 'inactive', (select count(*) from r where not is_active), 'missing', (select count(*) from r where price_issue is not null)),
      'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from r where $5::text is null or ($5 = 'active' and is_active) or ($5 = 'inactive' and not is_active) or ($5 = 'missing' and price_issue is not null)
         order by %s limit $6 offset $7) t), '[]'::jsonb))$f$, v_order)
    into v_res using v_like, p_category, p_unit, p_book, nullif(p_status, ''), v_lim, v_off;
  return v_res;
end $$;

-- So sánh giá giữa các bảng cho cùng sản phẩm (cùng đơn vị của sản phẩm); giá tham chiếu = giá ở bảng mặc định
create or replace function public.price_compare(p_product uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_pr public.products%rowtype; v_ref numeric; v_reason text; v_unit text;
begin
  perform public.apply_due_price_changes();
  select * into v_pr from public.products where id = p_product; if not found then raise exception 'Không tìm thấy sản phẩm' using errcode = 'P0002'; end if;
  select name into v_unit from public.product_units where id = v_pr.unit_id;
  select (public.price_lookup(v_pr.default_price_book_id, p_product) ->> 'unit_price')::numeric into v_ref;
  v_reason := case when v_pr.default_price_book_id is null then 'Chưa chọn bảng giá mặc định nên chưa có giá tham chiếu'
                   when v_ref is null then 'Bảng mặc định chưa có dòng giá cho sản phẩm này nên chưa có giá tham chiếu'
                   when v_ref = 0 then 'Giá tham chiếu bằng 0 nên không tính được tỷ lệ phần trăm' end;
  return jsonb_build_object('unit', v_unit, 'reference', v_ref, 'reference_book_id', v_pr.default_price_book_id, 'pct_unavailable_reason', v_reason,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('book_id', b.id, 'book_name', b.name, 'is_active', b.is_active, 'is_default', b.id = v_pr.default_price_book_id,
        'unit_price', (pl ->> 'unit_price')::numeric, 'fee_percent', (pl ->> 'fee_percent')::numeric, 'tax_percent', (pl ->> 'tax_percent')::numeric, 'effective_from', pl -> 'effective_from',
        'diff', case when v_ref is not null then (pl ->> 'unit_price')::numeric - v_ref end,
        'diff_pct', case when v_ref is not null and v_ref <> 0 then round(((pl ->> 'unit_price')::numeric - v_ref) / v_ref * 100, 2) end) order by (b.id = v_pr.default_price_book_id) desc, b.name)
      from public.price_books b cross join lateral (select public.price_lookup(b.id, p_product) pl) x where b.deleted_at is null and pl is not null), '[]'::jsonb));
end $$;

create or replace function public.price_book_list(p_q text default null, p_status text default null, p_sort text default 'name', p_dir text default 'asc', p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_res jsonb; v_like text := case when nullif(trim(coalesce(p_q, '')), '') is null then null else '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' end; v_order text;
begin
  v_order := (case p_sort when 'lines' then 'r.line_count' when 'status' then 'r.is_active::text' else 'r.name' end) || case when lower(coalesce(p_dir, 'asc')) = 'desc' then ' desc' else ' asc' end || ', r.name, r.id';
  execute format($f$
    with r as (select b.id, b.name, b.description, b.is_active, b.version, b.requires_approval,
        (select count(*) from public.price_book_products x where x.price_book_id = b.id)::int line_count,
        (select count(*) from public.price_change_requests q where q.price_book_id = b.id and q.status = 'pending')::int pending_requests,
        (select count(*) from public.products pr where pr.default_price_book_id = b.id and pr.deleted_at is null)::int default_for
      from public.price_books b where b.deleted_at is null and ($1::text is null or b.name ilike $1 or coalesce(b.description, '') ilike $1)
        and ($2::text is null or ($2 = 'active' and b.is_active) or ($2 = 'inactive' and not b.is_active) or ($2 = 'approval' and b.requires_approval)))
    select jsonb_build_object('total', (select count(*) from r), 'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select r.* from r order by %s limit $3 offset $4) t), '[]'::jsonb))$f$, v_order)
    into v_res using v_like, nullif(p_status, ''), least(greatest(coalesce(p_limit, 20), 1), 200), greatest(coalesce(p_offset, 0), 0);
  return v_res;
end $$;

create or replace function public.price_book_grid(p_book uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.price_books%rowtype;
begin
  if not app.can_crm(false) then raise exception 'Bạn không có quyền xem bảng giá' using errcode = '42501'; end if;
  perform public.apply_due_price_changes();
  select * into b from public.price_books where id = p_book and org_id = app.current_org_id() and deleted_at is null;
  if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if;
  return jsonb_build_object('book', jsonb_build_object('id', b.id, 'name', b.name, 'description', b.description, 'is_active', b.is_active, 'version', b.version, 'requires_approval', b.requires_approval),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', pr.id, 'code', pr.code, 'name', pr.name, 'unit', u.name, 'is_active', pr.is_active, 'unit_price', x.unit_price, 'fee_percent', x.fee_percent, 'tax_percent', x.tax_percent,
        'fee_amount', a.fee_amount, 'tax_amount', a.tax_amount, 'price_after', a.total) order by pr.name)
      from public.price_book_products x join public.products pr on pr.id = x.product_id left join public.product_units u on u.id = pr.unit_id
      cross join lateral app.line_amounts(x.unit_price, 1, x.fee_percent, x.tax_percent) a where x.price_book_id = p_book and pr.deleted_at is null), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'status', q.status, 'effective_date', q.effective_date) order by q.created_at desc)
      from public.price_change_requests q where q.price_book_id = p_book and q.status in ('pending', 'approved', 'changes_requested', 'draft') and q.applied_at is null), '[]'::jsonb));
end $$;

create or replace function public.price_change_list(p_status text default null, p_mine boolean default false, p_book uuid default null, p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_res jsonb;
begin
  with r as (
    select q.id, q.code, q.status, q.effective_date, q.reason, q.requested_by, p.full_name requester, q.submitted_at, q.decided_at, q.applied_at, b.id book_id, b.name book_name,
      (select count(*) from public.price_change_lines l where l.request_id = q.id)::int line_count,
      case when q.status = 'approved' and q.applied_at is null then 'waiting' when q.status = 'approved' then 'applied' else q.status end display_status,
      q.created_at
    from public.price_change_requests q join public.price_books b on b.id = q.price_book_id left join public.profiles p on p.id = q.requested_by
    where (p_book is null or q.price_book_id = p_book) and (not coalesce(p_mine, false) or q.requested_by = auth.uid()))
  select jsonb_build_object('total', (select count(*) from r where p_status is null or display_status = p_status),
    'counts', (select coalesce(jsonb_object_agg(display_status, n), '{}'::jsonb) from (select display_status, count(*) n from r group by 1) z),
    'rows', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from r where p_status is null or display_status = p_status order by created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) t), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

create or replace function public.price_change_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.price_change_requests%rowtype; b public.price_books%rowtype; v_canapprove boolean := app.has_permission('pricing.approve');
begin
  select * into r from public.price_change_requests where id = p_id and org_id = app.current_org_id();
  if not found or not app.can_crm(false) or not (r.requested_by = auth.uid() or app.can_crm(true) or v_canapprove) then raise exception 'Không tìm thấy đề nghị' using errcode = 'P0002'; end if;
  select * into b from public.price_books where id = r.price_book_id;
  return jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status, 'applied_at', r.applied_at, 'effective_date', r.effective_date, 'reason', r.reason,
    'display_status', case when r.status = 'approved' and r.applied_at is null then 'waiting' when r.status = 'approved' then 'applied' else r.status end,
    'book_id', b.id, 'book_name', b.name, 'book_version', b.version, 'base_version', r.base_version, 'requester_id', r.requested_by, 'requester', (select full_name from public.profiles where id = r.requested_by),
    'decision_note', r.decision_note, 'decided_by', (select full_name from public.profiles where id = r.decided_by), 'decided_at', r.decided_at, 'submitted_at', r.submitted_at,
    'stale', r.status in ('pending', 'draft', 'changes_requested') and app.price_request_stale(r.id),
    'can_decide', v_canapprove and r.status = 'pending' and r.requested_by <> auth.uid(),
    'is_mine', r.requested_by = auth.uid(),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', pr.id, 'code', pr.code, 'name', pr.name, 'unit', u.name, 'is_new', l.is_new,
        'old_unit_price', l.old_unit_price, 'old_fee_percent', l.old_fee_percent, 'old_tax_percent', l.old_tax_percent,
        'new_unit_price', l.new_unit_price, 'new_fee_percent', l.new_fee_percent, 'new_tax_percent', l.new_tax_percent,
        'diff', case when l.is_new then null else l.new_unit_price - l.old_unit_price end,
        'diff_pct', case when l.is_new or coalesce(l.old_unit_price, 0) = 0 then null else round((l.new_unit_price - l.old_unit_price) / l.old_unit_price * 100, 2) end,
        'pct_reason', case when l.is_new then 'Dòng mới — chưa có giá cũ' when coalesce(l.old_unit_price, 0) = 0 then 'Giá cũ bằng 0 nên không tính được tỷ lệ' end,
        'old_after', case when l.is_new then null else (ao).total end, 'new_after', (an).total,
        'current_unit_price', c.unit_price) order by pr.name)
      from public.price_change_lines l join public.products pr on pr.id = l.product_id left join public.product_units u on u.id = pr.unit_id
      left join public.price_book_products c on c.price_book_id = r.price_book_id and c.product_id = l.product_id
      cross join lateral (select app.line_amounts(l.old_unit_price, 1, l.old_fee_percent, l.old_tax_percent) ao) o1
      cross join lateral (select app.line_amounts(l.new_unit_price, 1, l.new_fee_percent, l.new_tax_percent) an) n1
      where l.request_id = r.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'note', e.note, 'at', e.created_at, 'by', (select full_name from public.profiles where id = e.actor_id)) order by e.id) from public.price_change_events e where e.request_id = r.id), '[]'::jsonb));
end $$;

-- Danh mục / đơn vị: số sản phẩm đang dùng
create or replace function public.catalog_usage(p_kind text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_kind = 'category' then
    return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'is_active', c.is_active, 'product_count', (select count(*) from public.products p where p.category_id = c.id and p.deleted_at is null),
      'active_count', (select count(*) from public.products p where p.category_id = c.id and p.deleted_at is null and p.is_active)) order by c.name) from public.product_categories c where c.deleted_at is null), '[]'::jsonb);
  elsif p_kind = 'unit' then
    return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'is_active', c.is_active, 'product_count', (select count(*) from public.products p where p.unit_id = c.id and p.deleted_at is null),
      'active_count', (select count(*) from public.products p where p.unit_id = c.id and p.deleted_at is null and p.is_active)) order by c.name) from public.product_units c where c.deleted_at is null), '[]'::jsonb);
  end if;
  raise exception 'Loại danh mục không hợp lệ' using errcode = '22023';
end $$;

create or replace function public.save_catalog_item(p_kind text, p_id uuid, p_name text, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); v_id uuid := p_id;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên' using errcode = '22023'; end if;
  if p_kind = 'category' then
    if p_id is null then insert into public.product_categories (org_id, name, created_by) values (v_org, trim(p_name), auth.uid()) returning id into v_id;
    else update public.product_categories set name = trim(p_name), is_active = coalesce(p_active, true) where id = p_id and org_id = v_org; end if;
  elsif p_kind = 'unit' then
    if p_id is null then insert into public.product_units (org_id, name, created_by) values (v_org, trim(p_name), auth.uid()) returning id into v_id;
    else update public.product_units set name = trim(p_name), is_active = coalesce(p_active, true) where id = p_id and org_id = v_org; end if;
  else raise exception 'Loại danh mục không hợp lệ' using errcode = '22023'; end if;
  return v_id;
end $$;

create or replace function public.save_price_book(p_id uuid, p_name text, p_description text default null, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.require_crm_write(); v_id uuid := p_id;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nhập tên bảng giá' using errcode = '22023'; end if;
  if exists (select 1 from public.price_books where org_id = v_org and deleted_at is null and lower(name) = lower(trim(p_name)) and id is distinct from p_id) then raise exception 'Đã có bảng giá tên “%”', trim(p_name) using errcode = '23505'; end if;
  if p_id is null then insert into public.price_books (org_id, name, description, created_by) values (v_org, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), auth.uid()) returning id into v_id;
  else update public.price_books set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''), is_active = coalesce(p_active, true) where id = p_id and org_id = v_org and deleted_at is null;
    if not found then raise exception 'Không tìm thấy bảng giá' using errcode = 'P0002'; end if; end if;
  perform app.write_audit(v_org, 'pricebook.save_info', 'price_book', v_id, jsonb_build_object('name', p_name, 'active', p_active));
  return v_id;
end $$;

-- Quyền: hàm mới chỉ cho người đăng nhập; mẫu chặn tài khoản cộng tác viên cho bảng mới
do $$ declare t text; begin
  foreach t in array array['product_files', 'product_file_blobs', 'price_book_line_history', 'price_change_requests', 'price_change_lines', 'price_change_events'] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (not app.has_role(%L))', t || '_no_collab', t, 'collaborator');
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
    'add_product_file', 'get_product_file', 'delete_product_file', 'set_product_image', 'save_product', 'set_product_default_book', 'create_quote',
    'price_lookup', 'save_price_lines', 'set_price_book_options', 'save_price_change', 'submit_price_change', 'cancel_price_change', 'rebase_price_change', 'apply_due_price_changes',
    'decide_price_change', 'price_estimate', 'add_priced_line', 'opportunity_price_diff', 'refresh_opportunity_prices', 'quote_price_diff', 'refresh_quote_prices',
    'save_price_book', 'price_health', 'product_list', 'price_compare', 'price_book_list', 'price_book_grid', 'price_change_list', 'price_change_detail', 'catalog_usage', 'save_catalog_item']) loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

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
  app.apply_price_request(uuid), app.price_current(uuid, uuid, date), app.trg_price_line_guard(), app.trg_price_line_block(), app.trg_catalog_deactivate(), app.opp_line_total() from authenticated;
