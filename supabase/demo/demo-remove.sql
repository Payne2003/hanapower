-- Gỡ toàn bộ dữ liệu demo (id dạng dede????-0000-4000-a000-…). Không đụng dữ liệu thật.
do $rm$
declare v_org uuid := current_setting('demo.org')::uuid;
begin
  delete from public.audit_logs where (action = 'demo.seed' and details->>'note' like 'Dữ liệu demo%') or details->>'demo' = 'true';
  delete from public.crm_notes where id::text like 'dede%';
  delete from public.payroll_periods where id::text like 'dede%';          -- kéo theo dòng lương, khoản lương
  delete from public.project_bonuses where id::text like 'dede%';
  delete from public.freelance_assignments where id::text like 'dede%';
  delete from public.expenses where id::text like 'dede%';
  delete from public.advances where id::text like 'dede%';
  delete from public.incomes where id::text like 'dede%';
  delete from public.tasks where id::text like 'dede%';                     -- kéo theo người được giao
  delete from public.task_groups where id::text like 'dede%';               -- việc còn lại tự về "Chưa phân nhóm"
  delete from public.projects where id::text like 'dede%';                  -- kéo theo thành viên, ngân sách, mốc
  delete from public.videos where id::text like 'dede%';                    -- kéo theo hạng mục, lịch sử, trao đổi
  delete from public.orders where id::text like 'dede%';
  delete from public.contracts where id::text like 'dede%';
  delete from public.quotes where id::text like 'dede%';                    -- kéo theo dòng báo giá
  delete from public.opportunities where id::text like 'dede%';             -- kéo theo dòng sản phẩm
  delete from public.leads where id::text like 'dede%';
  delete from public.contacts where id::text like 'dede%';
  delete from public.accounts where id::text like 'dede%';
  delete from public.price_books where id::text like 'dede%';               -- kéo theo giá trong bảng giá
  delete from public.products where id::text like 'dede%';
  delete from public.freelancers where id::text like 'dede%';               -- kéo theo thông tin thanh toán
  delete from public.channels where id::text like 'dede%';
  -- tài khoản demo: kéo theo hồ sơ, vai trò, lương, chấm công, thông báo, chức vụ
  delete from public.department_managers where department_id::text like 'dede%' or user_id::text like 'dede%';
  delete from public.user_departments_positions where user_id::text like 'dede%';
  delete from auth.users where id::text like 'dede%';
  delete from public.departments where id::text like 'dede%';
  raise notice 'Đã gỡ dữ liệu demo';
end
$rm$;
