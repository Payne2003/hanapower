-- =====================================================================
-- DỮ LIỆU ẢO ĐỂ XEM DEMO — phủ mọi bảng của ứng dụng.
--   Chạy:  node scripts/seed-demo.mjs [--org "Tên doanh nghiệp"] [--password "..."]
--   Gỡ:    node scripts/seed-demo.mjs --remove
-- Mọi bản ghi demo có id dạng dede????-0000-4000-a000-???????????? nên gỡ được chính xác, không đụng dữ liệu thật.
-- Chạy lại nhiều lần an toàn (không nhân đôi). Ngày tháng tính theo hôm nay nên luôn "mới".
-- Tài khoản demo: demo.<tên>@hanamedia.demo  (mật khẩu do bạn đặt khi chạy) — nhớ gỡ sau khi demo xong.
-- =====================================================================
create or replace function pg_temp.did(k int, n int) returns uuid language sql immutable as $$
  select ('dede' || lpad(to_hex(k), 4, '0') || '-0000-4000-a000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create or replace function pg_temp.h(seed text, n int) returns int language sql immutable as $$ select abs(hashtext(seed)) % n $$;
create or replace function pg_temp.pick(arr text[], seed text) returns text language sql immutable as $$ select arr[1 + abs(hashtext(seed)) % array_length(arr, 1)] $$;
create or replace function pg_temp.lk(tbl text, p_org uuid, p_name text) returns uuid language plpgsql as $$
declare r uuid;
begin
  execute format('select id from public.%I where org_id = $1 and name = $2 limit 1', tbl) into r using p_org, p_name;
  return r;
end $$;

do $demo$
declare
  v_org uuid := current_setting('demo.org')::uuid;
  v_pw text := current_setting('demo.password');
  v_tz text; v_today date;
  i int; j int; k int; n int;
  -- người dùng demo: key | họ tên | chức danh | vai trò | bộ phận (1 kinh doanh, 2 kế toán-nhân sự, 3 content, 4 edit) | chức vụ
  u_key text[] := array['quanly','truongnhom1','truongnhom2','content1','content2','content3','editor1','editor2','editor3','ketoan','nhansu','ctv1','ctv2'];
  u_name text[] := array['Nguyễn Hoàng Long','Trần Minh Khoa','Lê Thu Hằng','Phạm Quốc Bảo','Đỗ Ngọc Anh','Vũ Thị Lan','Hoàng Văn Tùng','Bùi Thanh Hải','Ngô Phương Thảo','Đặng Thị Mai','Lý Thu Trang','Trịnh Công Sơn','Mai Thị Hoa'];
  u_job text[] := array['Giám đốc điều hành','Trưởng nhóm Content','Trưởng nhóm Edit','Content','Content','Content','Editor','Editor','Editor','Kế toán','Nhân sự','Cộng tác viên thiết kế','Cộng tác viên lồng tiếng'];
  u_role text[] := array['manager','team_lead','team_lead','content','content','content','editor','editor','editor','accountant','hr','collaborator','collaborator'];
  u_dept int[] := array[1,3,4,3,3,3,4,4,4,2,2,4,4];
  u_pos text[] := array['Giám đốc','Trưởng nhóm','Trưởng nhóm','Content','Content','Content','Editor','Editor','Editor','Kế toán','Nhân sự','Editor','Editor'];
  d_name text[] := array['Kinh doanh','Kế toán – Nhân sự','Sản xuất Content','Hậu kỳ – Edit'];
  d_id uuid[] := array[]::uuid[];
  u uuid; usr uuid[] := array[]::uuid[];
  ch uuid[] := array[]::uuid[];
  v_stage text[] := array['idea','preparing','handover','editing','review','ready','published','published','editing','published','on_hold','cancelled','preparing','editing','handover','review','published','published','idea','editing'];
  v_title text[] := array['Cá sấu và đàn sư tử giành mồi','Báo tuyết săn dê núi','Gấu xám bắt cá hồi','Chim ưng vượt đỉnh Himalaya','Cáo Fennec giữa sa mạc','Linh cẩu và sư tử đối đầu','Cuộc di cư của linh dương đầu bò','Hổ Bengal vượt sông','Sói xám săn tuần lộc','Đại bàng đầu trắng bắt cá','Kangaroo và dingo','Rắn hổ mang đấu chồn mangut','Voi con lạc đàn','Cá voi sát thủ săn hải cẩu','Mèo Pallas trên thảo nguyên','Chó rừng châu Phi săn mồi','Tê giác và đàn chim sáo','Rùa biển trở về bờ cát','Gấu trúc con tập leo cây','Trăn khổng lồ siết mồi'];
  v_id uuid; v_code text; v_no int; v_st text; v_rep date; v_own uuid; v_ed uuid; v_hand text; v_prog int; v_cat text;
  acc_name text[] := array['Công ty CP Nông sản Sạch Việt','Du lịch Sóng Xanh','Cà phê Tây Nguyên Origin','Mỹ phẩm Hoa Sen','Trường Quốc tế Á Châu','Bất động sản Phúc An','Ngân hàng Số Tân Việt','Thời trang Lụa Việt','Công nghệ Sao Mai','Nhà hàng Hương Quê','Khu nghỉ dưỡng Biển Xanh','Siêu thị Mini Gia Đình','Viện Thẩm mỹ Ngọc Trai','Vận tải Đại Phát','Nhà sách Tri Thức'];
  acc_ind text[] := array['Thương mại điện tử','Du lịch','Thương mại điện tử','Thương mại điện tử','Giáo dục','Bất động sản','Tài chính / Ngân hàng','Thương mại điện tử','Công nghệ','Du lịch','Du lịch','Thương mại điện tử','Y tế','Sản xuất','Giáo dục'];
  con_last text[] := array['Nguyễn Thu','Trần Văn','Lê Minh','Phạm Thị','Hoàng Quốc','Vũ Ngọc','Đặng Thanh','Bùi Gia','Ngô Hữu','Dương Mỹ','Lý Anh','Đỗ Khánh'];
  con_first text[] := array['Hà','Bình','Tuấn','Lan','Hưng','Mai','Sơn','Linh','Phúc','Trang','Dũng','Châu'];
  prod_name text[] := array['Video quảng cáo 60 giây','Video giới thiệu doanh nghiệp 3–5 phút','Dựng hậu kỳ video','Quay phóng sự sự kiện','Kịch bản và lồng tiếng','Quản lý kênh YouTube theo tháng','Thiết kế thumbnail','Video AI theo yêu cầu'];
  prod_cat text[] := array['Sản xuất video','Sản xuất video','Hậu kỳ','Sản xuất video','Kịch bản / nội dung','Quản lý kênh','Hậu kỳ','Sản xuất video'];
  prod_unit text[] := array['Video','Video','Video','Gói','Gói','Tháng','Video','Video'];
  prod_price numeric[] := array[18000000,32000000,4500000,12000000,3500000,15000000,600000,9000000];
  pb uuid[]; pr uuid[] := array[]::uuid[];
  acc uuid[] := array[]::uuid[]; con uuid[] := array[]::uuid[];
  o_id uuid; o_stage text; o_acc int; q_id uuid; c_id uuid; p_id uuid; v_amt numeric; v_sub numeric; v_tot numeric;
  o_stages text[] := array['needs_analysis','presentation','negotiation','won','needs_analysis','negotiation','won','presentation','won','lost','negotiation','won','presentation','needs_analysis'];
  q_status text[] := array['draft','pending_approval','approved','sent','accepted','rejected','expired','accepted','accepted','accepted'];
  v_status text; v_cs text; v_ps text;
  proj uuid[] := array[]::uuid[]; v_m uuid; v_mgr uuid;
  fl uuid[] := array[]::uuid[]; fl_name text[] := array['Trịnh Công Sơn','Mai Thị Hoa','Lương Văn Hậu','Tô Bảo Ngọc','Kiều Minh Tâm','Phan Đức Thịnh'];
  fl_skill text[] := array['Thiết kế thumbnail,Đồ họa','Lồng tiếng,Thu âm','Dựng phim,Màu sắc','Viết kịch bản','Motion graphics','Quay phim ngoại cảnh'];
  v_exp uuid; v_inc numeric;
  v_period uuid; v_line uuid; v_y int; v_mo int; v_from date; v_to date; v_worked numeric; v_base numeric; v_status_p text;
  v_sal numeric; v_ins numeric; d date; v_att text;
  adv uuid;
begin
  select coalesce(timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.organizations where id = v_org;
  if not found then raise exception 'Không tìm thấy doanh nghiệp %', v_org; end if;
  v_today := (now() at time zone v_tz)::date;
  insert into public.org_counters (org_id) values (v_org) on conflict do nothing;
  insert into public.payroll_settings (org_id) values (v_org) on conflict do nothing;
  perform public.seed_crm_defaults(v_org);
  perform public.seed_finance_defaults(v_org);

  update public.organizations set address = coalesce(address, '25 Nguyễn Văn Linh, Quận 7, TP.HCM'), phone = coalesce(phone, '028 3999 8888'), email = coalesce(email, 'lienhe@hanamedia.vn'),
    website = coalesce(website, 'hanamedia.vn'), tax_code = coalesce(tax_code, '0312345678'), bank_info = coalesce(bank_info, 'Vietcombank – 0011223344 – CÔNG TY TNHH HANA MEDIA') where id = v_org;

  -- ---------------- Phòng ban, chức vụ -----------------
  for i in 1..4 loop
    insert into public.departments (id, org_id, name) values (pg_temp.did(30, i), v_org, d_name[i]) on conflict (id) do nothing;
    d_id := d_id || pg_temp.did(30, i);
  end loop;

  -- ---------------- Tài khoản demo -----------------
  for i in 1..13 loop
    u := pg_temp.did(1, i); usr := usr || u;
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'demo.' || u_key[i] || '@hanamedia.demo', extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u_name[i]), now(), now(), '', '', '', '', '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u::text, u, jsonb_build_object('sub', u::text, 'email', 'demo.' || u_key[i] || '@hanamedia.demo', 'email_verified', true), 'email', now(), now(), now()) on conflict do nothing;
    insert into public.profiles (id, org_id, department_id, full_name, email, job_title, phone) values
      (u, v_org, d_id[u_dept[i]], u_name[i], 'demo.' || u_key[i] || '@hanamedia.demo', u_job[i], '09' || lpad((10000000 + pg_temp.h('ph' || i, 89999999))::text, 8, '0')) on conflict (id) do nothing;
    insert into public.user_roles (org_id, user_id, role) values (v_org, u, u_role[i]::public.app_role) on conflict do nothing;
    if i = 1 then insert into public.user_roles (org_id, user_id, role) values (v_org, u, 'system_admin') on conflict do nothing; end if;
    insert into public.user_departments_positions (org_id, user_id, department_id, position_id)
      values (v_org, u, d_id[u_dept[i]], pg_temp.lk('positions', v_org, u_pos[i])) on conflict do nothing;
  end loop;
  insert into public.department_managers (org_id, department_id, user_id, position_id) values
    (v_org, d_id[1], usr[1], pg_temp.lk('positions', v_org, 'Giám đốc')), (v_org, d_id[3], usr[2], pg_temp.lk('positions', v_org, 'Trưởng nhóm')),
    (v_org, d_id[4], usr[3], pg_temp.lk('positions', v_org, 'Trưởng nhóm')), (v_org, d_id[2], usr[10], pg_temp.lk('positions', v_org, 'Kế toán')) on conflict do nothing;
  update public.departments set manager_id = usr[1] where id = d_id[1] and manager_id is null;

  -- ---------------- Kênh -----------------
  for i in 1..3 loop
    insert into public.channels (id, org_id, name, platform, url) values (pg_temp.did(2, i), v_org, (array['Thế giới hoang dã HANA','Khám phá thiên nhiên','HANA Shorts'])[i], 'YouTube', 'https://www.youtube.com/@hana-demo-' || i) on conflict (id) do nothing;
    ch := ch || pg_temp.did(2, i);
  end loop;

  -- ---------------- Khách hàng, liên hệ, lead -----------------
  for i in 1..15 loop
    insert into public.accounts (id, org_id, name, type, industry_id, employee_count, annual_revenue, phones, emails, websites, billing_address, tax_code, owner_id, note)
    values (pg_temp.did(4, i), v_org, acc_name[i], (case when i = 14 then 'competitor' when i = 15 then 'partner' else 'customer' end)::public.account_type,
      pg_temp.lk('industries', v_org, acc_ind[i]), 20 + pg_temp.h('emp' || i, 400), (1 + pg_temp.h('rev' || i, 80)) * 1000000000::numeric,
      array['09' || lpad((10000000 + pg_temp.h('ap' || i, 89999999))::text, 8, '0')], array['lienhe@khach' || i || '.demo.vn'], array['https://khach' || i || '.demo.vn'],
      (10 + i) || ' Lê Lợi, Quận ' || (1 + i % 11) || ', TP.HCM', '03' || lpad((10000000 + pg_temp.h('tx' || i, 89999999))::text, 8, '0'), usr[1 + pg_temp.h('ao' || i, 3)],
      case when i % 4 = 0 then 'Khách hàng thân thiết, thường đặt video theo mùa vụ' end) on conflict (id) do nothing;
    acc := acc || pg_temp.did(4, i);
  end loop;
  for i in 1..24 loop
    insert into public.contacts (id, org_id, salutation, first_name, last_name, account_id, job_title, phones, emails, date_of_birth, owner_id)
    values (pg_temp.did(5, i), v_org, case when i % 2 = 0 then 'Chị' else 'Anh' end, con_first[1 + (i - 1) % 12], con_last[1 + (i * 5) % 12], acc[1 + (i - 1) % 12],
      (array['Giám đốc marketing','Trưởng phòng truyền thông','Chủ thương hiệu','Giám đốc điều hành','Chuyên viên truyền thông'])[1 + i % 5],
      array['09' || lpad((10000000 + pg_temp.h('cp' || i, 89999999))::text, 8, '0')], array['lienhe' || i || '@khach' || (1 + (i - 1) % 12) || '.demo.vn'],
      date '1985-01-01' + pg_temp.h('dob' || i, 5000), usr[1 + pg_temp.h('co' || i, 3)]) on conflict (id) do nothing;
    con := con || pg_temp.did(5, i);
  end loop;
  for i in 1..24 loop
    insert into public.leads (id, org_id, title, first_name, last_name, job_title, company, industry_id, status, rating, source_id, phones, emails, address, note, owner_id,
        is_converted, converted_account_id, converted_contact_id, converted_at)
    values (pg_temp.did(6, i), v_org, case when i % 2 = 0 then 'Chị' else 'Anh' end, con_first[1 + (i * 7) % 12], con_last[1 + (i * 3) % 12],
      (array['Giám đốc','Chủ thương hiệu','Trưởng phòng marketing','Founder'])[1 + i % 4], (array['Studio','Công ty','Thương hiệu','Cửa hàng'])[1 + i % 4] || ' Lead ' || i,
      pg_temp.lk('industries', v_org, acc_ind[1 + i % 15]),
      (array['new','new','contacted','working','qualified','nurturing','unqualified','working'])[1 + i % 8]::public.lead_status, (array['hot','warm','cold'])[1 + i % 3]::public.lead_rating,
      pg_temp.lk('lead_sources', v_org, (array['Website','Facebook','YouTube','Giới thiệu','Sự kiện','Gọi điện','Email'])[1 + i % 7]),
      array['09' || lpad((10000000 + pg_temp.h('lp' || i, 89999999))::text, 8, '0')], array['lead' || i || '@demo-lead.vn'], 'Hà Nội',
      case when i % 5 = 0 then 'Quan tâm gói quản lý kênh, hẹn gọi lại tuần sau' end, usr[1 + pg_temp.h('lo' || i, 3)],
      i > 21, case when i > 21 then acc[i - 20] end, case when i > 21 then con[i - 20] end, case when i > 21 then now() - (i - 20) * interval '9 days' end)
    on conflict (id) do nothing;
  end loop;
  update public.leads set status = 'converted' where id in (pg_temp.did(6, 22), pg_temp.did(6, 23), pg_temp.did(6, 24));

  -- ---------------- Sản phẩm, bảng giá -----------------
  for i in 1..8 loop
    insert into public.products (id, org_id, name, code, category_id, unit_id, list_price, description)
    values (pg_temp.did(8, i), v_org, prod_name[i], 'DM-' || lpad(i::text, 2, '0'), pg_temp.lk('product_categories', v_org, prod_cat[i]), pg_temp.lk('product_units', v_org, prod_unit[i]), prod_price[i],
      'Dịch vụ mẫu cho bản demo') on conflict (id) do nothing;
    pr := pr || pg_temp.did(8, i);
  end loop;
  insert into public.price_books (id, org_id, name, description) values (pg_temp.did(7, 1), v_org, 'Bảng giá chuẩn 2026', 'Giá niêm yết dịch vụ sản xuất nội dung'),
    (pg_temp.did(7, 2), v_org, 'Bảng giá khách doanh nghiệp lớn', 'Chiết khấu 10% cho hợp đồng từ 100 triệu') on conflict (id) do nothing;
  pb := array[pg_temp.did(7, 1), pg_temp.did(7, 2)];
  for i in 1..8 loop
    insert into public.price_book_products (id, org_id, price_book_id, product_id, unit_price, tax_percent) values
      (pg_temp.did(31, i), v_org, pb[1], pr[i], prod_price[i], 8), (pg_temp.did(31, 10 + i), v_org, pb[2], pr[i], round(prod_price[i] * 0.9, -3), 8) on conflict (id) do nothing;
  end loop;

  -- ---------------- Cơ hội, báo giá, hợp đồng, đơn hàng -----------------
  for i in 1..14 loop
    o_id := pg_temp.did(9, i); o_stage := o_stages[i]; o_acc := 1 + (i - 1) % 12;
    insert into public.opportunities (id, org_id, name, account_id, contact_id, price_book_id, stage, win_probability, forecast, expected_close_date, lost_reason, needs, owner_id)
    values (o_id, v_org, 'Chiến dịch video ' || acc_name[o_acc], acc[o_acc], con[o_acc], pb[1 + i % 2], o_stage::public.opportunity_stage,
      case o_stage when 'needs_analysis' then 20 when 'presentation' then 40 when 'negotiation' then 70 when 'won' then 100 else 0 end,
      (case o_stage when 'won' then 'closed' when 'lost' then 'omitted' when 'negotiation' then 'best_case' else 'pipeline' end)::public.opportunity_forecast,
      v_today + (i * 6) - 30, case when o_stage = 'lost' then 'Khách chọn đơn vị khác có giá thấp hơn' end,
      'Cần bộ video phục vụ chiến dịch quý này', usr[1 + pg_temp.h('oo' || i, 3)]) on conflict (id) do nothing;
    for j in 1..(1 + i % 3) loop
      k := case when o_stages[i] = 'won' and j = 1 then 2 else 1 + (i + j * 2) % 8 end;
      insert into public.opportunity_products (id, org_id, opportunity_id, product_id, description, unit, unit_price, quantity, tax_percent)
      values (pg_temp.did(32, i * 10 + j), v_org, o_id, pr[k], prod_name[k], prod_unit[k], prod_price[k], 1 + (i + j) % 4, 8) on conflict (id) do nothing;
    end loop;
  end loop;
  -- Báo giá (chụp từ dòng sản phẩm) cho cơ hội 2..13
  for i in 2..13 loop
    o_id := pg_temp.did(9, i); q_id := pg_temp.did(10, i);
    v_status := case when o_stages[i] = 'won' then 'accepted' else q_status[1 + (i - 2) % 7] end;
    if not exists (select 1 from public.quotes where id = q_id) then
      v_no := app.next_no(v_org, 'quote');
      select coalesce(sum(round(unit_price * quantity * (1 + fee_percent / 100), 2)), 0), coalesce(sum(total), 0) into v_sub, v_tot from public.opportunity_products where opportunity_id = o_id;
      insert into public.quotes (id, org_id, code, opportunity_id, owner_id, version, status, expiry_date, subtotal, tax_amount, total, recipient_name, billing_address, accepted_at)
      values (q_id, v_org, 'BG' || lpad(v_no::text, 4, '0'), o_id, usr[1], 1, v_status::public.quote_status, v_today + 10 - i * 3, v_sub, v_tot - v_sub, v_tot,
        (select first_name || ' ' || last_name from public.contacts where id = con[1 + (i - 1) % 12]), 'TP.HCM', case when v_status = 'accepted' then now() - i * interval '2 days' end);
      insert into public.quote_items (id, org_id, quote_id, position, description, unit, quantity, unit_price, fee_percent, tax_percent, amount)
      select pg_temp.did(33, i * 10 + row_number() over (order by created_at, id)::int), v_org, q_id, row_number() over (order by created_at, id)::int, description, unit, quantity, unit_price, fee_percent, tax_percent, total
      from public.opportunity_products where opportunity_id = o_id;
    end if;
  end loop;
  -- Hợp đồng cho các cơ hội đã thắng (4, 7, 9, 12) + một hợp đồng chờ hiệu lực cho cơ hội 6
  for k in 1..5 loop
    i := (array[4, 7, 9, 12, 6])[k]; o_id := pg_temp.did(9, i); c_id := pg_temp.did(11, k);
    if not exists (select 1 from public.contracts where id = c_id) and exists (select 1 from public.quotes where id = pg_temp.did(10, i)) then
      select total into v_tot from public.quotes where id = pg_temp.did(10, i);
      v_no := app.next_no(v_org, 'contract');
      v_cs := (array['active','active','expired','active','pending'])[k];
      insert into public.contracts (id, org_id, code, opportunity_id, quote_id, status, effective_date, expiry_date, duration_months, initial_value, current_value,
        customer_signed_by, customer_signed_date, company_signed_by_id, company_signed_date, note)
      values (c_id, v_org, 'HD' || lpad(v_no::text, 4, '0'), o_id, case when i <> 6 then pg_temp.did(10, i) end, v_cs::public.contract_status,
        v_today - 70 + k * 12, v_today + (case when k = 3 then -5 else 60 + k * 20 end), 3, greatest(v_tot, 1), greatest(v_tot, 1),
        'Đại diện ' || acc_name[1 + (i - 1) % 12], v_today - 72 + k * 12, usr[1], v_today - 72 + k * 12, 'Thanh toán theo tiến độ nghiệm thu') ;
      update public.quotes set status = 'accepted' where id = pg_temp.did(10, i) and k < 5;
    end if;
  end loop;
  for k in 1..3 loop
    c_id := pg_temp.did(11, k);
    if exists (select 1 from public.contracts where id = c_id) and not exists (select 1 from public.orders where id = pg_temp.did(12, k)) then
      v_no := app.next_no(v_org, 'order');
      insert into public.orders (id, org_id, code, contract_id, owner_id, status, activated_at, total, billing_address)
      select pg_temp.did(12, k), v_org, 'DH' || lpad(v_no::text, 4, '0'), c_id, usr[1], 'active', now() - k * interval '20 days', current_value, 'TP.HCM' from public.contracts where id = c_id
      on conflict (id) do nothing;
    end if;
  end loop;

  -- ---------------- Dự án, thành viên, ngân sách, mốc -----------------
  for k in 1..5 loop
    p_id := pg_temp.did(13, k); proj := proj || p_id;
    if not exists (select 1 from public.projects where id = p_id) then
      v_no := app.next_no(v_org, 'project');
      c_id := pg_temp.did(11, k);
      v_ps := (array['in_progress','in_progress','completed','acceptance','planning'])[k];
      v_mgr := usr[(array[2, 3, 2, 3, 1])[k]];
      if k <= 4 and exists (select 1 from public.contracts where id = c_id) then
        select current_value into v_tot from public.contracts where id = c_id;
        insert into public.projects (id, org_id, code, name, kind, customer_id, opportunity_id, contract_id, stage, manager_id, start_date, end_date, description)
        select p_id, v_org, 'DA' || lpad(v_no::text, 4, '0'), o.name, 'client', o.account_id, o.id, c.id, v_ps::public.project_stage, v_mgr, v_today - 75 + k * 12, v_today + 20 + k * 15,
          'Dự án khách hàng thực hiện theo hợp đồng ' || c.code from public.contracts c join public.opportunities o on o.id = c.opportunity_id where c.id = c_id;
      else
        v_tot := 25000000;
        insert into public.projects (id, org_id, code, name, kind, stage, manager_id, start_date, end_date, description)
        values (p_id, v_org, 'DA' || lpad(v_no::text, 4, '0'), 'Series nội bộ: Hành trình hoang dã mùa 2', 'internal', 'planning', v_mgr, v_today - 5, v_today + 90, 'Dự án nội dung của kênh HANA, không thu phí khách hàng');
      end if;
      insert into public.project_budgets (project_id, org_id, contract_value, budget_cost) values (p_id, v_org, v_tot, round(v_tot * 0.55, -3));
      insert into public.project_members (org_id, project_id, user_id, role_label) values
        (v_org, p_id, v_mgr, 'Quản lý dự án'), (v_org, p_id, usr[3 + k % 3], 'Content'), (v_org, p_id, usr[7 + k % 3], 'Editor') on conflict do nothing;
      insert into public.project_members (org_id, project_id, user_id, role_label) values (v_org, p_id, usr[1 + k % 3], 'Giám sát') on conflict do nothing;
      -- mốc thanh toán: 50% tạm ứng đã thu, 50% còn lại theo tiến độ dự án
      insert into public.project_milestones (id, org_id, project_id, name, amount, due_date, acceptance, accepted_at, payment, invoice_no, paid_at, sort_order) values
        (pg_temp.did(14, k * 10 + 1), v_org, p_id, 'Tạm ứng 50% khi ký hợp đồng', round(v_tot * 0.5, 0), v_today - 70 + k * 12, 'accepted', now() - (70 - k * 12) * interval '1 day', 'paid', 'HDDT-D' || k || '1', now() - (65 - k * 12) * interval '1 day', 0),
        (pg_temp.did(14, k * 10 + 2), v_org, p_id, 'Thanh toán 50% khi nghiệm thu', v_tot - round(v_tot * 0.5, 0), v_today + 20 + k * 15,
          case when v_ps in ('completed', 'acceptance') then 'accepted' else 'pending' end, case when v_ps in ('completed', 'acceptance') then now() - interval '6 days' end,
          case v_ps when 'completed' then 'paid' when 'acceptance' then 'invoiced' else 'unpaid' end, case when v_ps in ('completed', 'acceptance') then 'HDDT-D' || k || '2' end,
          case when v_ps = 'completed' then now() - interval '2 days' end, 1) on conflict (id) do nothing;
    end if;
  end loop;

  -- ---------------- Video (36) + hạng mục + lịch sử + trao đổi -----------------
  for i in 1..36 loop
    v_id := pg_temp.did(3, i);
    if exists (select 1 from public.videos where id = v_id) then continue; end if;
    -- số thứ tự mã video: lớn hơn cả bộ đếm lẫn mã lớn nhất đang có (an toàn khi dữ liệu cũ nhập tay mã)
    select greatest((select last_video_no from public.org_counters where org_id = v_org), coalesce((select max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int) from public.videos where org_id = v_org), 0)) + 1 into v_no;
    update public.org_counters set last_video_no = v_no where org_id = v_org;
    v_st := v_stage[1 + (i - 1) % 20];
    v_rep := v_today - case when v_st in ('published', 'cancelled') then (i * 3) % 55 else (i * 3) % 12 end;
    v_own := usr[4 + i % 3]; v_ed := usr[7 + i % 3];
    v_hand := case when v_st in ('handover') then 'pending' when v_st in ('editing', 'review', 'ready', 'published', 'on_hold') then 'received' end;
    v_prog := case v_st when 'editing' then 20 + pg_temp.h('pg' || i, 60) when 'review' then 100 when 'ready' then 100 when 'published' then 100 when 'on_hold' then 35 else 0 end;
    insert into public.videos (id, org_id, code, title, brief, channel_id, priority, stage, stage_before_hold, report_date, due_date, content_owner_id, resource_url, content_note,
        editor_id, handover_status, handover_submitted_at, handover_confirmed_at, editor_note, supplement_count, edit_progress, draft_url, review_note, revision_count,
        approved_by, approved_at, published_url, published_at, hold_reason, created_by)
    values (v_id, v_org, 'D' || lpad(v_no::text, 4, '0'), v_title[1 + (i - 1) % 20] || case when i > 20 then ' (phần 2)' else '' end,
      'Video thuộc loạt phim động vật hoang dã, tập ' || i, ch[1 + i % 3], (array['low','medium','medium','high','urgent'])[1 + i % 5]::public.video_priority, v_st::public.video_stage,
      case when v_st = 'on_hold' then 'editing'::public.video_stage end, v_rep, v_rep + 14, v_own,
      case when v_st <> 'idea' then 'https://drive.google.com/drive/folders/DEMO-' || i end, case when i % 4 = 0 then 'Ưu tiên cảnh săn mồi cận cảnh' end,
      case when v_st not in ('idea', 'preparing') then v_ed end, v_hand::public.handover_status,
      case when v_hand is not null then (v_rep + 1)::timestamptz end, case when v_hand = 'received' then (v_rep + 2)::timestamptz end,
      case when i % 6 = 0 and v_hand = 'received' then 'Bổ sung thêm cảnh chạy rượt đuổi' end, case when i % 6 = 0 and v_hand = 'received' then 1 else 0 end, v_prog,
      case when v_st in ('review', 'ready', 'published') then 'https://drive.google.com/file/d/DEMO-DRAFT-' || i end,
      case when v_st = 'review' and i % 2 = 0 then 'Chỉnh nhạc nền nhỏ hơn ở đoạn đầu' end, case when v_st in ('ready', 'published') and i % 3 = 0 then 1 else 0 end,
      case when v_st in ('ready', 'published') then usr[1] end, case when v_st in ('ready', 'published') then (v_rep + 5)::timestamptz end,
      case when v_st = 'published' then 'https://www.youtube.com/watch?v=DEMO' || i end, case when v_st = 'published' then least(v_rep + 7, v_today)::timestamptz end,
      case when v_st = 'on_hold' then 'Chờ khách xác nhận kịch bản' end, usr[1]);
    insert into public.video_items (org_id, video_id, kind, status, updated_by)
    select v_org, v_id, kd, (case when v_st in ('handover', 'editing', 'review', 'ready', 'published', 'on_hold') then 'done'
      else (array['todo', 'doing', 'done'])[1 + pg_temp.h(kd || i, 3)] end)::public.item_status, v_own
    from unnest(array['real_footage', 'ai_video', 'script_vo', 'edit_map']) kd;
    insert into public.video_events (org_id, video_id, actor_id, event_type, from_stage, to_stage, note, created_at)
    values (v_org, v_id, usr[1], 'created', null, 'idea', null, v_rep::timestamptz);
    if v_hand is not null then
      insert into public.video_events (org_id, video_id, actor_id, event_type, from_stage, to_stage, created_at) values (v_org, v_id, v_own, 'handover_submit', 'preparing', 'handover', (v_rep + 1)::timestamptz);
    end if;
    if v_hand = 'received' then
      insert into public.video_events (org_id, video_id, actor_id, event_type, from_stage, to_stage, created_at) values (v_org, v_id, v_ed, 'handover_received', 'handover', 'editing', (v_rep + 2)::timestamptz);
    end if;
    if v_st = 'published' then
      insert into public.video_events (org_id, video_id, actor_id, event_type, from_stage, to_stage, created_at) values (v_org, v_id, usr[1], 'published', 'ready', 'published', least(v_rep + 7, v_today)::timestamptz);
    end if;
    if i % 3 = 0 then
      insert into public.video_comments (org_id, video_id, author_id, body, created_at) values
        (v_org, v_id, v_own, 'Em đã gửi đủ tài nguyên, anh chị kiểm tra giúp em nhé.', (v_rep + 1)::timestamptz + interval '3 hours'),
        (v_org, v_id, usr[2], 'Đã nhận. Phần mở đầu cần thêm cảnh toàn cảnh để tạo không khí.', (v_rep + 1)::timestamptz + interval '5 hours');
    end if;
  end loop;
  for i in 1..36 loop
    if i % 4 = 0 then update public.videos set project_id = proj[1 + (i / 4) % 4] where id = pg_temp.did(3, i) and project_id is null; end if;
  end loop;

  -- ---------------- Thu / chi / tạm ứng -----------------
  for k in 1..4 loop
    for j in 1..2 loop
      if exists (select 1 from public.project_milestones where id = pg_temp.did(14, k * 10 + j) and payment = 'paid') then
        insert into public.incomes (id, org_id, occurred_on, project_id, source_id, milestone_id, amount, description, invoice_no, payment_method, created_by)
        select pg_temp.did(15, k * 10 + j), v_org, (paid_at)::date, project_id, pg_temp.lk('income_sources', v_org, 'Sản xuất video theo đơn hàng'), id, amount, 'Thu ' || lower(name), invoice_no, 'Chuyển khoản', usr[10]
        from public.project_milestones where id = pg_temp.did(14, k * 10 + j) on conflict (id) do nothing;
      end if;
    end loop;
  end loop;
  for i in 0..5 loop
    for j in 1..2 loop
      insert into public.incomes (id, org_id, occurred_on, channel_id, source_id, amount, description, payment_method, created_by) values
        (pg_temp.did(15, 100 + i * 2 + j), v_org, (date_trunc('month', v_today) - i * interval '1 month' + interval '14 days')::date, ch[j], pg_temp.lk('income_sources', v_org, 'YouTube AdSense'),
         8000000 + pg_temp.h('ad' || i || j, 22000000), 'Doanh thu AdSense tháng ' || to_char(date_trunc('month', v_today) - i * interval '1 month', 'MM/YYYY') || ' – kênh ' || j, 'Chuyển khoản', usr[10])
      on conflict (id) do nothing;
    end loop;
  end loop;
  for i in 1..4 loop
    insert into public.incomes (id, org_id, occurred_on, source_id, amount, description, invoice_no, payment_method, created_by) values
      (pg_temp.did(15, 200 + i), v_org, v_today - i * 17, pg_temp.lk('income_sources', v_org, 'Tài trợ / hợp tác thương hiệu'), 15000000 + i * 5000000,
       'Tài trợ video ' || acc_name[1 + i], 'TT-' || lpad(i::text, 3, '0'), 'Chuyển khoản', usr[10]) on conflict (id) do nothing;
  end loop;
  for i in 1..46 loop
    v_status := (array['draft','submitted','paid','approved','paid','rejected'])[1 + i % 6];
    insert into public.expenses (id, org_id, occurred_on, project_id, category_id, payee_type, payee_name, amount, due_date, description, approval, requested_by, approved_by, approved_at,
        reject_reason, payment, paid_on, paid_by, payment_method)
    values (pg_temp.did(16, i), v_org, v_today - ((i * 2) % 80), case when i % 3 <> 0 then proj[1 + i % 4] end,
      pg_temp.lk('expense_categories', v_org, (array['Thù lao cộng tác viên','Công cụ AI / phần mềm','Thiết bị / thuê thiết bị','Di chuyển / ăn ở','Giọng đọc / thu âm','Bản quyền nhạc / footage','Marketing / quảng cáo','Văn phòng / hành chính','Khác'])[1 + i % 9]),
      (array['vendor','vendor','freelancer','employee','other'])[1 + i % 5]::public.payee_type, (array['Phòng thu Âm Sắc','Dịch vụ AI Vision','Thuê máy quay Hải Long','Taxi Mai Linh','Nhạc bản quyền SoundHub','Văn phòng phẩm Hồng Hà'])[1 + i % 6],
      300000 + pg_temp.h('ex' || i, 3500000), v_today - ((i * 2) % 80) + 15, (array['Thu giọng đọc','Gói tạo cảnh AI tháng này','Thuê thiết bị quay ngoại cảnh','Di chuyển quay phim','Mua bản quyền nhạc nền','Văn phòng phẩm'])[1 + i % 6],
      (case v_status when 'draft' then 'draft' when 'submitted' then 'submitted' when 'rejected' then 'rejected' else 'approved' end)::public.approval_status, usr[4 + i % 6],
      case when v_status in ('paid', 'approved') then usr[10] end, case when v_status in ('paid', 'approved') then now() - (i % 20) * interval '1 day' end,
      case when v_status = 'rejected' then 'Thiếu chứng từ, vui lòng bổ sung hóa đơn' end,
      (case when v_status = 'paid' then 'paid' else 'unpaid' end)::public.expense_payment, case when v_status = 'paid' then v_today - ((i * 2) % 80) + 3 end, case when v_status = 'paid' then usr[10] end,
      case when v_status = 'paid' then 'Chuyển khoản' end) on conflict (id) do nothing;
  end loop;
  for i in 1..6 loop
    v_status := (array['requested','approved','disbursed','settled','rejected','disbursed'])[i];
    insert into public.advances (id, org_id, user_id, project_id, amount, purpose, status, approved_by, approved_at, reject_reason, disbursed_on, disbursed_by, settled_on, settled_amount, refund_amount)
    values (pg_temp.did(17, i), v_org, usr[4 + i], proj[1 + i % 4], 2000000 + i * 1000000, (array['Đi quay ngoại cảnh Đà Lạt','Thuê địa điểm quay','Mua đạo cụ','Di chuyển và ăn ở đoàn quay','Thuê flycam','Thu âm tại phòng thu'])[i],
      v_status::public.advance_status, case when v_status <> 'requested' then usr[10] end, case when v_status <> 'requested' then now() - i * interval '3 days' end,
      case when v_status = 'rejected' then 'Dự án chưa duyệt ngân sách ngoại cảnh' end, case when v_status in ('disbursed', 'settled') then v_today - i * 5 end,
      case when v_status in ('disbursed', 'settled') then usr[10] end, case when v_status = 'settled' then v_today - 2 end,
      case when v_status = 'settled' then 3500000 else 0 end, case when v_status = 'settled' then 500000 else 0 end) on conflict (id) do nothing;
  end loop;

  -- ---------------- Cộng tác viên -----------------
  for i in 1..6 loop
    insert into public.freelancers (id, org_id, user_id, full_name, phones, emails, skills, rate_note, note) values
      (pg_temp.did(18, i), v_org, case when i <= 2 then usr[11 + i] end, fl_name[i], array['09' || lpad((10000000 + pg_temp.h('fp' || i, 89999999))::text, 8, '0')], array['ctv' || i || '@demo.vn'],
       string_to_array(fl_skill[i], ','), (array['300k / thumbnail','150k / phút lồng tiếng','2 triệu / video dựng','500k / kịch bản','1,5 triệu / motion','Theo ngày: 1,2 triệu'])[i], 'Hợp tác ổn định từ đầu năm') on conflict (id) do nothing;
    insert into public.freelancer_payment_info (freelancer_id, org_id, bank_name, account_no, account_name, tax_code) values
      (pg_temp.did(18, i), v_org, (array['Vietcombank','Techcombank','MB Bank','ACB','BIDV','VPBank'])[i], '00' || lpad((1000000 + pg_temp.h('fb' || i, 8999999))::text, 8, '0'), upper(fl_name[i]), null) on conflict do nothing;
    fl := fl || pg_temp.did(18, i);
  end loop;
  for i in 1..14 loop
    v_status := (array['assigned','accepted','delivered','approved','approved','declined','cancelled','approved','accepted','delivered','approved','assigned','approved','accepted'])[i];
    v_exp := null;
    if v_status = 'approved' then
      v_exp := pg_temp.did(16, 100 + i);
      insert into public.expenses (id, org_id, occurred_on, project_id, category_id, payee_type, payee_name, amount, description, approval, requested_by, approved_by, approved_at, payment, paid_on, paid_by, payment_method)
      values (v_exp, v_org, v_today - i * 4, proj[1 + i % 4], pg_temp.lk('expense_categories', v_org, 'Thù lao cộng tác viên'), 'freelancer', fl_name[1 + i % 6], 600000 + i * 150000,
        'Thù lao đầu việc cộng tác viên #' || i, 'approved', usr[2], usr[10], now() - i * interval '2 days', (case when i % 2 = 0 then 'paid' else 'unpaid' end)::public.expense_payment,
        case when i % 2 = 0 then v_today - i * 3 end, case when i % 2 = 0 then usr[10] end, case when i % 2 = 0 then 'Chuyển khoản' end) on conflict (id) do nothing;
    end if;
    insert into public.freelance_assignments (id, org_id, freelancer_id, project_id, context, title, description, due_date, fee, status, delivered_url, delivered_at, review_note, reviewed_by, approved_at,
        expense_id, payment, paid_on, created_by)
    values (pg_temp.did(19, i), v_org, fl[1 + i % 6], proj[1 + i % 4], 'Dự án demo ' || (1 + i % 4),
      (array['Thiết kế 4 thumbnail','Lồng tiếng tập 12','Dựng teaser 30 giây','Viết kịch bản tập mới','Motion graphics mở đầu','Quay cảnh ngoại cảnh'])[1 + i % 6] || ' #' || i,
      'Theo brief đính kèm trong dự án', v_today + 10 - i * 2, 600000 + i * 150000, v_status::public.assignment_status,
      case when v_status in ('delivered', 'approved') then 'https://drive.google.com/file/d/DEMO-CTV-' || i end, case when v_status in ('delivered', 'approved') then now() - i * interval '2 days' end,
      case when v_status = 'declined' then 'Em đang kẹt lịch tuần này' end, case when v_status = 'approved' then usr[2] end, case when v_status = 'approved' then now() - i * interval '2 days' end,
      v_exp, case when v_status = 'approved' and i % 2 = 0 then 'paid' else 'unpaid' end, case when v_status = 'approved' and i % 2 = 0 then v_today - i * 3 end, usr[2]) on conflict (id) do nothing;
  end loop;

  -- ---------------- Công việc -----------------
  for i in 1..20 loop
    insert into public.tasks (id, org_id, title, task_type, status, priority, scheduled_at, remind_before_minutes, reminder_at, content, related_type, related_id, created_by)
    values (pg_temp.did(20, i), v_org, (array['Gọi tư vấn gói quản lý kênh','Gửi báo giá cho khách','Họp duyệt kịch bản tuần','Kiểm tra bản dựng video','Hẹn gặp khách tại văn phòng','Gửi hợp đồng bản cứng','Nhắc thanh toán đợt 2','Chốt lịch quay ngoại cảnh','Xem lại thumbnail','Cập nhật báo cáo tháng'])[1 + i % 10],
      (array['to_do','call','email','meeting','appointment','visit','other'])[1 + i % 7]::public.task_type, (array['not_started','in_progress','completed','deferred','not_started','completed'])[1 + i % 6]::public.task_status,
      (array['low','normal','normal','high','urgent'])[1 + i % 5]::public.task_priority, now() + (i - 8) * interval '1 day', 30, now() + (i - 8) * interval '1 day' - interval '30 minutes',
      'Công việc mẫu cho bản demo', (array['lead','account','opportunity','project','video'])[1 + i % 5],
      case i % 5 when 0 then pg_temp.did(6, 1 + i % 20) when 1 then acc[1 + i % 15] when 2 then pg_temp.did(9, 1 + i % 14) when 3 then proj[1 + i % 5] else pg_temp.did(3, 1 + i % 36) end, usr[1 + i % 3]) on conflict (id) do nothing;
    insert into public.task_assignees (org_id, task_id, user_id) values (v_org, pg_temp.did(20, i), usr[1 + i % 11]) on conflict do nothing;
    if i % 3 = 0 then insert into public.task_assignees (org_id, task_id, user_id) values (v_org, pg_temp.did(20, i), usr[1 + (i + 4) % 11]) on conflict do nothing; end if;
  end loop;

  -- ---------------- Lương: hồ sơ, phụ cấp, chấm công, thưởng, kỳ lương -----------------
  for i in 1..11 loop
    v_sal := (array[30000000, 18000000, 18000000, 12000000, 12000000, 12500000, 11000000, 11000000, 11500000, 13000000, 12000000])[i];
    insert into public.salary_profiles (user_id, org_id, base_salary, bank_name, account_no, account_name) values
      (usr[i], v_org, v_sal, (array['Vietcombank','Techcombank','MB Bank','ACB'])[1 + i % 4], '19' || lpad((10000000 + pg_temp.h('sa' || i, 89999999))::text, 8, '0'), upper(u_name[i])) on conflict do nothing;
    if i <= 3 or i = 10 then insert into public.salary_allowances (id, org_id, user_id, name, amount) values (pg_temp.did(34, i), v_org, usr[i], 'Phụ cấp trách nhiệm', 2000000 + i * 500000) on conflict (id) do nothing; end if;
    insert into public.salary_allowances (id, org_id, user_id, name, amount) values (pg_temp.did(34, 20 + i), v_org, usr[i], 'Phụ cấp ăn trưa', 730000) on conflict (id) do nothing;
  end loop;
  insert into public.attendance_records (org_id, user_id, work_date, status, check_in, check_out, note)
  select v_org, usr[uu], dd::date,
    (case when (extract(day from dd)::int * 7 + uu * 3) % 29 = 0 then 'absent' when (extract(day from dd)::int * 5 + uu) % 17 = 0 then 'leave_paid' when (extract(day from dd)::int + uu * 2) % 13 = 0 then 'half' else 'present' end)::public.attendance_status,
    ((dd::date::timestamp + interval '8 hours' + ((uu * 7 + extract(day from dd)::int * 3) % 50) * interval '1 minute') at time zone v_tz),
    ((dd::date::timestamp + interval '17 hours 30 minutes' + ((uu * 11 + extract(day from dd)::int) % 40) * interval '1 minute') at time zone v_tz),
    null
  from generate_series(1, 11) uu, generate_series(date_trunc('month', v_today - interval '2 months')::date, v_today, interval '1 day') dd
  where extract(isodow from dd) <= 5 on conflict (user_id, work_date) do nothing;
  update public.attendance_records set check_in = null, check_out = null where user_id = any(usr) and status in ('absent', 'leave_paid');
  update public.attendance_records set check_out = null where user_id = any(usr) and work_date = v_today;

  -- Thưởng theo dự án
  for i in 1..5 loop
    insert into public.project_bonuses (id, org_id, project_id, user_id, month_date, amount, reason, status, requested_by, decided_by, decided_at, reject_reason) values
      (pg_temp.did(23, i), v_org, proj[1 + i % 4], usr[3 + i], (date_trunc('month', v_today) - interval '1 month')::date, 1000000 + i * 500000, 'Hoàn thành dự án trước hạn',
       (case when i = 5 then 'requested' else 'approved' end)::public.bonus_status, usr[2], case when i < 5 then usr[10] end, case when i < 5 then now() - interval '9 days' end, null) on conflict (id) do nothing;
  end loop;

  -- Hai kỳ lương gần nhất
  for n in 1..2 loop
    d := (date_trunc('month', v_today) - (3 - n) * interval '1 month')::date; v_y := extract(year from d); v_mo := extract(month from d);
    v_from := d; v_to := (d + interval '1 month - 1 day')::date; v_status_p := case n when 1 then 'paid' else 'approved' end;
    insert into public.payroll_periods (id, org_id, year, month, status, standard_days, insurance_rate, created_by, checked_by, checked_at, approved_by, approved_at, paid_by, paid_on)
    values (pg_temp.did(21, n), v_org, v_y, v_mo, v_status_p::public.payroll_status, 26, 10.5, usr[11], usr[11], v_to::timestamptz, usr[10], (v_to + 2)::timestamptz,
      case n when 1 then usr[10] end, case n when 1 then v_to + 5 end) on conflict do nothing;
    if exists (select 1 from public.payroll_periods where id = pg_temp.did(21, n)) then
      for i in 1..11 loop
        v_line := pg_temp.did(22, n * 100 + i);
        select coalesce(sum(case status when 'present' then 1 when 'half' then 0.5 when 'leave_paid' then 1 when 'holiday' then 1 else 0 end), 0) into v_worked
          from public.attendance_records where user_id = usr[i] and work_date between v_from and v_to;
        select base_salary into v_sal from public.salary_profiles where user_id = usr[i];
        v_worked := least(v_worked, 26);
        insert into public.payroll_lines (id, org_id, period_id, user_id, base_salary, worked_days, base_pay) values (v_line, v_org, pg_temp.did(21, n), usr[i], v_sal, v_worked, round(v_sal * v_worked / 26, 2)) on conflict (id) do nothing;
        if exists (select 1 from public.payroll_items where line_id = v_line) then continue; end if;
        insert into public.payroll_items (org_id, line_id, kind, name, amount, is_manual, bonus_id)
          select v_org, v_line, 'allowance', name, amount, false, null from public.salary_allowances where user_id = usr[i] and is_active;
        insert into public.payroll_items (org_id, line_id, kind, name, amount) values (v_org, v_line, 'insurance', 'Bảo hiểm (10.5%)', round(v_sal * 0.105, 2));
        if n = 2 then
          insert into public.payroll_items (org_id, line_id, kind, name, amount, bonus_id)
            select v_org, v_line, 'bonus', 'Thưởng dự án ' || p.code, b.amount, b.id from public.project_bonuses b join public.projects p on p.id = b.project_id
            where b.user_id = usr[i] and b.status = 'approved' and b.month_date = (date_trunc('month', v_today) - interval '1 month')::date;
        end if;
        if v_sal >= 18000000 then insert into public.payroll_items (org_id, line_id, kind, name, amount, is_manual) values (v_org, v_line, 'tax', 'Thuế TNCN (nhập tay)', round(v_sal * 0.03, 0), true); end if;
        if i % 5 = 0 then insert into public.payroll_items (org_id, line_id, kind, name, amount, is_manual) values (v_org, v_line, 'deduction', 'Tạm ứng trừ lương', 500000, true); end if;
        perform app.recalc_line(v_line);
      end loop;
    end if;
  end loop;

  -- ---------------- Ghi chú trên bản ghi + lịch sử hoạt động -----------------
  for i in 1..36 loop
    n := (array[6, 4, 5, 9, 13])[1 + i % 5];
    insert into public.crm_notes (id, org_id, entity_type, entity_id, body, pinned, created_by, created_at) values
      (pg_temp.did(35, i), v_org, (array['lead', 'account', 'contact', 'opportunity', 'project'])[1 + i % 5],
       case i % 5 when 0 then pg_temp.did(6, 1 + i % 24) when 1 then acc[1 + i % 15] when 2 then con[1 + i % 24] when 3 then pg_temp.did(9, 1 + i % 14) else proj[1 + i % 5] end,
       (array['Khách hẹn gặp trực tiếp tuần sau, chuẩn bị bản demo video mẫu.','Đã gửi báo giá qua email, chờ phản hồi.','Khách quan tâm gói quản lý kênh theo tháng, cần thêm case study.','Liên hệ lần 2: khách yêu cầu giảm 5% nếu ký trọn gói 6 tháng.','Đã thống nhất kịch bản, bắt đầu quay từ thứ Hai.','Cần xuất hóa đơn trước ngày 25 hằng tháng.'])[1 + i % 6],
       i % 9 = 0, usr[1 + i % 3], now() - (i % 20) * interval '1 day' - (i % 7) * interval '3 hours') on conflict (id) do nothing;
  end loop;
  if not exists (select 1 from public.audit_logs where action = 'opportunity.stage' and details->>'demo' = 'true') then
    for i in 1..14 loop
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details, created_at) values
        (v_org, usr[1 + i % 3], 'opportunity.stage', 'opportunity', pg_temp.did(9, i), jsonb_build_object('from', 'needs_analysis', 'to', case when o_stages[i] = 'lost' then 'lost' else 'presentation' end, 'demo', true), now() - (20 + i) * interval '1 day'),
        (v_org, usr[1 + i % 3], 'opportunity.stage', 'opportunity', pg_temp.did(9, i), jsonb_build_object('from', 'presentation', 'to', case when o_stages[i] in ('negotiation', 'won') then 'negotiation' else 'presentation' end, 'demo', true), now() - (10 + i) * interval '1 day');
    end loop;
    for i in 2..13 loop
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details, created_at) values
        (v_org, usr[2], 'quote.create', 'quote', pg_temp.did(10, i), jsonb_build_object('code', (select code from public.quotes where id = pg_temp.did(10, i)), 'demo', true), now() - (8 + i) * interval '1 day');
    end loop;
    for k in 1..5 loop
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details, created_at) values
        (v_org, usr[1], 'contract.status', 'contract', pg_temp.did(11, k), jsonb_build_object('from', 'pending', 'to', 'active', 'demo', true), now() - (60 - k * 10) * interval '1 day');
    end loop;
  end if;

  -- ---------------- Thông báo, nhật ký -----------------
  if not exists (select 1 from public.audit_logs where action = 'demo.seed' and org_id = v_org) then
  for i in 1..13 loop
    insert into public.notifications (org_id, user_id, video_id, kind, message, link, read_at) values
      (v_org, usr[i], case when i <= 9 then pg_temp.did(3, i) end, 'demo', case when i <= 9 then 'Video của bạn đang chờ xử lý' else 'Bạn được giao một đầu việc mới' end,
       case when i > 9 then '/cong-tac-vien/viec/' || pg_temp.did(19, i - 5)::text end, case when i % 3 = 0 then now() - interval '1 day' end),
      (v_org, usr[i], null, 'demo', 'Chào mừng bạn đến với bản demo HANA Studio', '/', now());
  end loop;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, details)
  select v_org, usr[1 + g % 3], 'demo.seed', 'organization', v_org, jsonb_build_object('note', 'Dữ liệu demo #' || g) from generate_series(1, 6) g;
  end if;

  raise notice 'Đã nạp dữ liệu demo cho doanh nghiệp %', v_org;
end
$demo$;
