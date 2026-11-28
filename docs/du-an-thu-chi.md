# Dự án và Thu chi & công nợ

Màn hình: `/du-an` (Bảng · Kanban · Dòng thời gian, xem nhanh bên phải), `/du-an/<id>` (Tổng quan · Con người · Công việc & sản xuất · Thanh toán · Tài chính dự án · Tài liệu · Cộng tác viên · Thưởng),
`/thu-chi` (Tổng quan · Khoản thu · Khoản chi · Phải thu theo mốc · Kỳ tài chính · Chứng từ · Báo cáo · Tạm ứng).
Tệp: `GET /du-an/tai-lieu/<id>`, `GET /thu-chi/chung-tu/<id>` (thêm `?xem=1` để mở PDF / ảnh trong trình duyệt). CSV: `GET /thu-chi/xuat?type=incomes|expenses|receivables|report|pnl` (cùng bộ lọc với màn hình).
Migration: `20261127000950_projects_finance.sql` (chỉ thêm; không sửa migration cũ).

## Ý nghĩa dữ liệu đã xác minh trong mã (không đoán)

| Điểm | Kết luận |
|---|---|
| `project_budgets.budget_cost` | **Ngân sách CHI PHÍ**, so với chi đã duyệt. Vì vậy hồ sơ dự án hiển thị “Ngân sách chi còn lại / Vượt ngân sách chi”. `contract_value` là giá trị hợp đồng — căn cứ quy đổi % của mốc. |
| Khi nào tiền được ghi nhận | **Thu**: khoản thu `status = confirmed`, tính theo `occurred_on` = **ngày thực thu**. **Chi**: khoản chi `approval = approved`, tính theo `occurred_on` = ngày phát sinh. Mốc chưa thu là **dự kiến**, không phải thực thu. |
| Tiền tệ / làm tròn | `numeric(16,2)`, một đơn vị VND, không đa tiền tệ, không làm tròn ngầm. Hệ thống không có cột tiền tệ → chưa có báo cáo theo tiền tệ (cần thêm `currency` ở `incomes`, `expenses`, `project_budgets`, `project_milestones`). |
| Thu theo mốc | Ràng buộc `incomes.milestone_id UNIQUE`: **một mốc ↔ một khoản thu**. Hệ quả: chỉ thu **trọn mốc**; số tiền khác mốc bị từ chối. Thu từng phần cần bảng phân bổ riêng (xem “Việc còn lại”). |
| Ngày của tổ chức | `app.today()` theo múi giờ doanh nghiệp (`organizations.timezone`). Số ngày trễ và “quá hạn” đều tính theo ngày này. |

## Đối chiếu tên tham chiếu với schema thật

| Tên trong yêu cầu | Trong repo | Cách xử lý |
|---|---|---|
| `projects` | `projects` | Thêm `progress` (0–100), `risk_level` (low/medium/high), `risk_note`, `payment_terms`. |
| `project_managers` | **chưa có** (chỉ `projects.manager_id`) | Bảng mới `project_managers`; `manager_id` giữ làm quản lý chính, trigger đồng bộ. `can_view_project` / `can_manage_project` đọc bảng mới. |
| `project_members` | có | Dùng nguyên. Người vừa quản lý vừa tham gia được đếm **một lần** (UNION theo người). |
| `project_payment_milestones` | `project_milestones` | Dùng nguyên (`amount`, `due_date`, `payment`, `paid_at`…). **Không lưu %**: % = `amount / contract_value`, chỉ hiện khi có giá trị hợp đồng. |
| `project_attachments` | **chưa có** | `project_files` + `project_file_blobs` (loại: tài liệu, kế hoạch, báo cáo, báo giá, hợp đồng, khác; ≤ 5 MB, lưu CSDL như tài liệu nhân sự). Báo giá / hợp đồng chỉ người xem được tiền thấy. |
| `finance_months` | **chưa có** | Kỳ = tháng, **suy ra từ `occurred_on`** (không có số liệu nhân đôi). Bảng `finance_periods` chỉ giữ ghi chú, chốt kỳ và snapshot tổng lúc chốt. |
| `incomes`, `expenses` | có | Thêm `incomes.department_id / owner_id / cancelled_milestone_id`, `expenses.department_id`. Phòng ban là của **chính giao dịch**. Người phụ trách chi = `requested_by`. |
| Chứng từ giao dịch | chỉ `expenses.invoice_url` (một link) | `finance_files` + `finance_file_blobs`: **nhiều tệp** cho một khoản thu / chi. Số tiền vẫn tính một lần. |
| `customers` | `accounts` | Khách hàng của dự án lấy qua `projects.customer_id`; tên hiển thị theo **quyền xem dự án** (`app.account_name`), không đòi quyền CRM. |
| Góc nhìn đã lưu | chưa có | `saved_views` (riêng từng người, phạm vi `project` / `finance`). |

## Luồng ghi nhận thu (một cửa)

`record_milestone_receipt(milestone, amount?, received_on?, source?, method?, owner?, department?, note?, invoice_no?)` — dùng bởi **cả** hồ sơ dự án (tab Thanh toán) **và** tab “Phải thu theo mốc”; tên cũ `milestone_pay` chỉ gọi lại hàm này.

Trong **một giao dịch**: khóa dòng mốc (`FOR UPDATE`) → nếu đã có khoản thu hiệu lực: trả về khoản đó (`already = true`) → kiểm tra (quyền `finance.manage`, số tiền = số tiền mốc, ngày không ở tương lai, nguồn / phòng / người tồn tại) → tạo khoản thu liên kết mốc → mốc `paid` + `paid_at` → ghi nhật ký + thông báo quản lý dự án.
- Bấm đúp / gửi lại / hai người xác nhận cùng lúc: hàng đợi ở khóa dòng + `milestone_id` duy nhất → **đúng một** khoản thu (có kiểm thử hai kết nối thật).
- Lỗi giữa chừng (vd. kỳ đã chốt): cả giao dịch hoàn tác → không có mốc “đã thu” thiếu khoản thu, không lệch tổng kỳ.
- **Quản lý dự án không có quyền xác nhận tiền đã thu** — chỉ vai trò có `finance.manage` (kế toán, quản trị).
- Hủy khoản thu (`cancel_income`, cần lý do): khoản thu chuyển `cancelled`, **giữ vết** mốc ở `cancelled_milestone_id`, mốc trở lại `invoiced`, thu lại được.
- Mốc `paid` thiếu khoản thu (dữ liệu cũ): xử lý bằng chính hàm này với ngày thực tế, hoặc `link_income_to_milestone` để gắn khoản thu nhập tay có sẵn. **Không có gì tự tạo tiền khi mở trang.**

## Kỳ tài chính, khóa kỳ, đối chiếu

- Tổng kỳ = tính từ giao dịch chi tiết (`finance_period_detail`, `finance_periods_year`). Mốc đến hạn tháng 11 nhưng thu tháng 12 → **lịch tháng 11** (dự kiến) và **thực thu tháng 12**, kèm số “thu muộn từ kỳ trước”.
- `close_finance_period` (quyền `finance.approve`, tách khỏi người ghi nhận — maker-checker ở mức kỳ): chặn khi còn chi chờ duyệt, lưu snapshot thu / chi. Trigger `incomes_period_lock`, `expenses_period_lock` chặn **mọi đường** thêm / sửa / hủy / duyệt giao dịch trong kỳ đã chốt. `reopen_finance_period` cần lý do, có nhật ký.
- `finance_reconcile` liệt kê: mốc đã thu thiếu khoản thu · khoản thu gắn mốc chưa đóng · số tiền lệch mốc · ngày lệch · tổng kỳ đã chốt lệch · dự án có hợp đồng chưa có lịch thu · tổng mốc khác hợp đồng · thu / chi thiếu chứng từ — kèm liên kết mở bản ghi và gợi ý xử lý.
- Đã có: duyệt chi (`approval`), khóa kỳ lương (`app.period_locked`, của lương). **Chưa có** duyệt hai cấp cho khoản thu: khoản thu do kế toán ghi nhận, chốt kỳ do người duyệt tài chính.

## Báo cáo, quyền, thông báo

- Tổng / số đếm / phân trang chạy **ở CSDL trên toàn bộ tập lọc** (`income_list`, `expense_list`, `project_list`, `receivables`, `finance_report`) và là `security invoker` → RLS của người xem quyết định cả dòng lẫn tổng. CSV dùng đúng các hàm này nên không vượt quyền xem. Không join bảng quản lý / thành viên / mốc / tệp vào tổng (mỗi nguồn là CTE hoặc truy vấn con riêng) → không nhân đôi.
- “Chênh lệch thu–chi” = thực thu − thực chi, **không** phải lợi nhuận kế toán. Dự kiến thu (mốc chưa thu theo hạn) tách riêng ở biểu đồ và cột báo cáo.
- Rủi ro dự án = mức quản lý chọn, tự nâng khi: mốc quá hạn thu > 30 ngày, chi vượt ngân sách chi, hoặc (trung bình) có mốc quá hạn / trễ hạn kết thúc. Luôn hiển thị bằng chữ kèm lý do.
- Chế độ xem nhanh: *Đến hạn trong 7 ngày* = **hạn kết thúc dự án**; *Mốc thu trong 7 ngày* và *Có mốc thu quá hạn* = **hạn thu của mốc**.
- Nhắc việc (`run_finance_reminders`, gọi khi mở Dự án / Thu chi, mỗi sự kiện đúng một lần nhờ khóa duy nhất `finance_reminders`): mốc đến hạn ≤ 3 ngày, mốc quá hạn, quá hạn > 30 ngày, dự án rủi ro cao, khoản chi đã duyệt thiếu chứng từ > 3 ngày. Thông báo mở thẳng dự án / danh sách.

## Kiểm thử

- `tests/db/projects-finance.test.ts` (22 bài): kịch bản 30 / 40 / 30 triệu, thu 30tr + chi 12tr → thu 30tr, chi 12tr, chênh lệch 18tr, còn 70tr theo lịch; bấm đúp; hai kết nối đồng thời; lỗi giữa chừng; mốc tháng trước thu tháng này; hủy + thu lại; không nhân đôi (hai quản lý, ba thành viên, ba chứng từ); chi chung; phòng ban của giao dịch; phân quyền; chốt / mở kỳ; dữ liệu cũ lệch; phải thu theo tuổi nợ; nhắc việc một lần; tiến độ / rủi ro; chế độ xem nhanh; tài liệu; góc nhìn đã lưu.
- `tests/e2e/projects-finance.spec.ts` (7 bài): Dự án → Mốc → Ghi nhận thu → Kỳ tài chính → Chứng từ → quay lại dự án; quyền; quick view + giữ bộ lọc; ba kiểu hiển thị; điện thoại.

## Việc còn lại (phụ thuộc dữ liệu / thiết kế mới)

1. **Thu từng phần**: cần bảng `income_allocations(income_id, milestone_id, amount)` bỏ ràng buộc một-một, mốc `paid` khi tổng phân bổ = số tiền mốc; hiện tách mốc thành các đợt nhỏ hơn.
2. **Đa tiền tệ**: thêm cột tiền tệ và tỷ giá; báo cáo theo từng tiền tệ.
3. **Phòng ban của giao dịch cũ**: giao dịch trước nâng cấp chưa có `department_id` (hiện ở nhóm “Chưa phân loại”); kế toán gán dần bằng “Gán phòng ban”.
4. **Duyệt hai cấp cho khoản thu** (người ghi nhận ≠ người duyệt) nếu doanh nghiệp yêu cầu.
5. **Đẩy thời gian thực** cho thông báo (hiện cập nhật khi mở trang).
