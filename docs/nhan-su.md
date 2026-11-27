# Phân hệ Nhân sự — Phòng ban · Nhân viên · Chức vụ

Màn hình: `/phong-ban` (danh sách, tìm / lọc / sắp xếp / phân trang), `/phong-ban/<id>` (Tổng quan · Thành viên · Người quản lý · Công việc của thành viên),
`/nhan-su` (chế độ **Danh sách** và **Chi tiết hồ sơ**, giữ bộ lọc khi chuyển), `/chuc-vu`, `/nhan-su/xuat` (CSV theo bộ lọc), `/nhan-su/tai-lieu/<id>` (tải tài liệu).
Migration: `20261127000930_hr_admin.sql`.

## Đối chiếu sơ đồ tham chiếu với schema thật

| Sơ đồ tham chiếu | Trong repo | Cách xử lý |
|---|---|---|
| `users` | `auth.users` (đăng nhập) + `public.profiles` (hồ sơ) + `user_roles` (vai trò hệ thống). Không có mật khẩu / refresh token trong bảng ứng dụng. | Thêm vào `profiles`: `employee_code`, `employment_status`, `work_form`, `employment_type`, `joined_on`, `resigned_on`. Trạng thái tài khoản = `profiles.is_active` (khác trạng thái nhân sự). |
| Thông tin cá nhân, thuế | chưa có | Bảng `staff_personal` (ngày sinh, giới tính, địa chỉ, CCCD, MST) — chỉ chính chủ + quản trị/nhân sự đọc. Không có tính thuế riêng: thuế TNCN nằm ở `payroll_lines.tax` theo kỳ. |
| `departments`, `positions` | có | `departments.is_active` (trạng thái phòng) thêm mới. |
| `user_departments_positions` | khóa chính cũ `(user_id, department_id)` → mỗi người **một** chức vụ / phòng | Đổi sang `id` + chỉ mục duy nhất `(user_id, department_id, coalesce(position_id, nil))`: nhiều chức vụ cùng phòng; `sort_order` = thứ tự hiển thị. |
| `department_managers` | có (`department_id`, `user_id`, `position_id`) | Nhiều quản lý / phòng; `departments.manager_id` giữ làm “quản lý đại diện”, tự đồng bộ. |
| `user_personal_emails`, `user_phones` | chưa có | `user_emails`, `user_phones` (mục chính duy nhất / người, email duy nhất trong công ty). |
| `user_attachments` | chưa có luồng lưu trữ tệp trong repo | `user_documents` + `user_document_files` (≤ 5 MB, lưu trong CSDL, tải qua hàm kiểm quyền). Tệp lớn cần bucket Storage riêng. |
| `tasks`, `task_assignees` | có | Dùng nguyên; thêm chính sách để quản lý phòng xem việc của thành viên phòng mình. |
| `task_attachments`, `refresh_tokens` | chưa có | Không hiển thị. Phiên đăng nhập do GoTrue quản lý; khóa tài khoản (`is_active=false`) chặn truy cập ngay. |
| Lịch sử điều chuyển, sơ đồ phân cấp | chưa có | Cần `employment_history(user, department, position, from, to)` và `departments.parent_id`. Hiện lịch sử lấy từ `audit_logs` (cho người có `audit.view`). |

Phân biệt: **chức vụ trong phòng** (`user_departments_positions.position_id`), **người quản lý phòng** (`department_managers`), **vai trò hệ thống** (`user_roles` → quyền ứng dụng). Quản lý phòng không tự cấp thêm quyền, trừ xem việc của thành viên phòng mình.

## Tính năng | Bảng / cột sử dụng | Quyền truy cập

| Tính năng | Bảng / cột | Xem | Sửa |
|---|---|---|---|
| Danh sách phòng ban (tên, quản lý, số thành viên, số chức vụ, trạng thái) | `departments`, `department_managers`, `user_departments_positions` (hàm `department_list`) | mọi nhân viên (trừ cộng tác viên) | quản trị (`users.manage`) tạo / đổi tên / ngừng; thêm thành viên, chức vụ, quản lý: quản trị hoặc nhân sự (`staff.manage`) |
| Thành viên phòng (mỗi người một dòng, mọi chức vụ) | `profiles`, `user_departments_positions` (`department_overview`) | như trên | `set_member_positions` (một giao dịch), `add/remove_department_member` |
| Người quản lý phòng | `department_managers` (+ `departments.manager_id`) | như trên | `add/remove_department_manager`; gỡ thành viên đồng thời kết thúc quản lý |
| Công việc của thành viên (mỗi task một lần) | `tasks`, `task_assignees` (`department_tasks`) | RLS của Công việc + quản lý phòng xem việc thành viên | giao / đổi ở module Công việc |
| Danh sách nhân viên: tìm tên/mã, lọc phòng + chức vụ **trên cùng một phân công**, trạng thái, hình thức, sắp xếp, phân trang, tổng hợp theo toàn bộ kết quả | `profiles`, `user_departments_positions`, `positions`, `departments` (`staff_list`, `staff_summary`) | mọi nhân viên (trừ cộng tác viên) | — |
| Hồ sơ: Tổng quan / Công tác | `profiles`, `staff_personal`, `user_departments_positions`, `department_managers` | công tác: mọi nhân viên; thông tin cá nhân: chính chủ + `staff.manage`/`users.manage` | `save_staff_profile`, `save_staff_personal`: quản trị / nhân sự |
| Liên hệ (email, điện thoại, mục chính) | `user_emails`, `user_phones` | chính chủ + quản trị / nhân sự | chính chủ + quản trị / nhân sự (`save_/delete_/set_primary_user_*`) |
| Tài liệu | `user_documents`, `user_document_files` (`get_user_document`) | chính chủ + quản trị / nhân sự (URL trực tiếp: 404 nếu ngoài phạm vi) | tải lên / xóa: quản trị / nhân sự |
| Công việc trong hồ sơ | `tasks`, `task_assignees` | theo RLS của Công việc | module Công việc |
| Lương, bảo hiểm, chấm công, bảng lương theo kỳ | `salary_profiles`, `payroll_lines`/`payroll_periods`, `attendance_records` | chính chủ (kỳ đã duyệt) hoặc `payroll.view` | module Lương / Chấm công |
| Tài khoản (vai trò, khóa / mở, đặt lại mật khẩu) | `user_roles`, `profiles.is_active`, GoTrue (server action dùng service role) | quản trị (`users.manage`) | quản trị |
| Chức vụ (số nhân viên, số phòng) | `positions`, `user_departments_positions` (`position_list`) | mọi nhân viên (trừ cộng tác viên) | quản trị |
| Xuất CSV | cùng hàm `staff_list` / `department_list` | cùng quyền xem; chỉ cột có trên danh sách (không lương, liên hệ riêng, tài liệu) | — |
| Nhật ký | `audit_logs` (`department.*`, `staff.*`) | `audit.view` | tự ghi trong các hàm; không lưu nội dung nhạy cảm |

Quyền mới `staff.manage`: gán cho `system_admin` và `hr`.

## Hồ sơ tự phục vụ (migration `20261127000940_self_service.sql`)

Điểm vào: **Cài đặt → Hồ sơ của tôi** (`/cai-dat/ho-so`); thẻ tài khoản cuối sidebar cũng dẫn tới đây. Đổi mật khẩu vẫn ở Cài đặt.

| Tính năng | Bảng / cột | Hàm / endpoint | Quyền |
|---|---|---|---|
| Ảnh đại diện (JPEG/PNG/WebP ≤ 2 MB, kiểm tra cả chữ ký tệp) | `user_avatars`, `profiles.avatar_updated_at` | `set_my_avatar`, `remove_my_avatar`, `get_avatar`; `GET /anh-dai-dien/<id>` | chỉ đổi / gỡ ảnh của chính mình (`auth.uid()`); xem: đồng nghiệp trong công ty (trừ cộng tác viên xem ảnh người khác) |
| Tự sửa thông tin | `staff_personal.address`, `user_emails`, `user_phones` | `save_my_profile`, server action `myContactAction` (kiểm tra dòng thuộc về chính người đăng nhập) | chính chủ; ngày sinh, giới tính, CCCD, MST, mã NV, hồ sơ làm việc, vai trò, hợp đồng, lương chỉ HR/quản trị sửa |
| Mẫu tài liệu | `document_types` (tên, hướng dẫn, bắt buộc, định dạng, dung lượng ≤ 5 MB) | `save_document_type`; `seed_document_types` cho doanh nghiệp mới | xem: nhân viên; sửa: `staff.manage` / `users.manage` |
| Yêu cầu giao từng nhân viên | `document_requests` (trạng thái `pending/submitted/approved/rejected`, hạn, ghi chú, lý do, người duyệt + thời điểm, `document_id` → `user_documents`) | `assign_document_request` (theo phòng và/hoặc từng người, cập nhật không nhân đôi, bỏ qua yêu cầu đã duyệt) | giao / duyệt / xóa: HR, quản trị; xem: chính chủ + HR, quản trị |
| Nộp / thay tệp | `user_documents.request_id`, `user_document_files` | `submit_my_document` (định dạng, dung lượng theo loại; chuyển về “Chờ duyệt”; thay bản cũ); server action kiểm tra chữ ký tệp | chỉ yêu cầu của chính mình; đã duyệt thì không thay |
| Duyệt / yêu cầu nộp lại | như trên | `review_document_request` (lý do bắt buộc khi trả lại) | HR, quản trị |
| Tình trạng hồ sơ | view tính trong hàm | `doc_status_list` (hoàn thành = mọi tài liệu **bắt buộc** đã duyệt; lọc phòng + tình trạng; phân trang) | HR, quản trị |
| Thông báo | `notifications` (`doc_request`, `doc_submitted`, `doc_approved`, `doc_rejected`) | `app.notify_link`, `app.notify_permission` | người nhận theo vai trò |
| Tải tệp | — | `GET /nhan-su/tai-lieu/<id>` → `get_user_document` | chính chủ + HR, quản trị; ngoài phạm vi: 404 |

Tệp hồ sơ cũ (không gắn yêu cầu) giữ nguyên và truy cập theo quyền hiện tại. Lưu trữ tệp dùng chung cơ chế riêng tư trong CSDL của phân hệ Nhân sự (≤ 5 MB / tệp, 2 MB / ảnh); tệp lớn hơn cần bucket Storage riêng.
