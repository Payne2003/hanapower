# Tiến độ theo giai đoạn

Quy ước: **Đã chạy & kiểm thử** = mã đã triển khai và có kiểm thử tự động đạt trong môi trường hiện tại. **Một phần** = có mã nhưng chưa đủ phạm vi yêu cầu. **Chưa làm** = chưa bắt đầu.

| # | Giai đoạn | Trạng thái |
|---|---|---|
| 1 | Nền tảng: Next.js, Supabase, migration, dữ liệu mẫu, script PowerShell | **Đã chạy & kiểm thử** (script `.ps1` chưa chạy trên Windows thật) |
| 2 | Nhân sự và quyền: vai trò Leader / Content / Editor / Quản trị, RLS | **Đã chạy & kiểm thử**. Chưa có giao diện tạo tài khoản (dùng `bootstrap-org.mjs` + seed) |
| 3 | Quy trình sản xuất video (thay Google Sheet): Content → bàn giao → Editor → dựng → duyệt → đăng | **Đã chạy & kiểm thử** |
| 4 | Báo cáo tháng, thông báo trong ứng dụng, bảng & Kanban | **Đã chạy & kiểm thử** (thông báo hiện khi tải trang; đẩy thời gian thực chưa làm) |
| 8 | CRM + dự án + tài chính + cộng tác viên + lương (mô hình CRM Apollo) | **Đã chạy & kiểm thử ở mức cơ bản** — xem mục 2026-11-27 bên dưới |
| 5 | Chat thời gian thực | **Chưa làm** (đã có trao đổi theo từng video; Realtime tự lưu trữ đã xác minh hoạt động) |
| 6 | Hoàn thiện PWA | **Một phần**: manifest, icon, cửa sổ độc lập. Chưa có service worker, trang ngoại tuyến |
| 7 | Kiểm thử hai máy, chạy thử một phòng ban; cloud / tại văn phòng | **Một phần**: tại văn phòng đã chạy trong Docker (cả không Internet); cloud mới có tài liệu |

---

## Mở rộng theo mô hình CRM Apollo: CRM + dự án + tài chính + cộng tác viên + lương (2026-11-27)

Mục tiêu của đợt này: **có đủ khung menu / trang giống CRM Apollo để xem tổng quan**, mỗi mục chạy được ở mức cơ bản; chiều sâu bổ sung sau.

### Đã chạy & kiểm thử

- **CRM**: Lead (chuyển đổi → tài khoản + liên hệ + cơ hội), Tài khoản, Liên hệ, Cơ hội (dòng sản phẩm, đổi giai đoạn, thua cần lý do), Báo giá (chụp lại số liệu khi tạo; nháp → gửi duyệt → duyệt → gửi khách → chấp nhận), Hợp đồng (nháp → chờ → kích hoạt ⇒ cơ hội "Thắng"), Đơn hàng, Sản phẩm, Danh mục, Đơn vị, Bảng giá (đơn giá / phí / thuế theo sản phẩm), Nguồn lead, Ngành nghề, Phòng ban, Chức vụ, Công việc.
- **Dự án** (nhiều bộ phận, theo vai trò / thành viên): tạo từ hợp đồng hoặc nhập tay; thành viên chỉ thấy dự án mình tham gia; **tiền (giá trị HĐ, ngân sách, mốc, thu chi) chỉ quản lý dự án + kế toán thấy**; mốc nghiệm thu → xuất hóa đơn → thu tiền; video gắn dự án; đóng dự án cần nghiệm thu hết mốc.
- **Tài chính**: chi phí (đề nghị → duyệt → thanh toán, không tự duyệt), tạm ứng (đề nghị → duyệt → giải ngân → quyết toán), khoản thu, công nợ phải thu / phải trả, lãi / lỗ theo dự án, xuất CSV cho kế toán (chi phí, thu, lãi lỗ).
- **Cộng tác viên**: hồ sơ + thông tin thanh toán (chỉ kế toán / người quản lý thấy), giao việc theo dự án, nhận việc → bàn giao (link) → nghiệm thu → **tự tạo đề nghị chi thù lao** → trạng thái thanh toán đồng bộ từ kế toán. Tài khoản cộng tác viên chỉ thấy việc của mình (policy RESTRICTIVE chặn mọi bảng nội bộ).
- **Lương**: hồ sơ lương + phụ cấp, chấm công vào / ra (và điều chỉnh), thưởng theo dự án (quản lý đề xuất → kế toán duyệt → tự vào bảng lương), kỳ lương nháp → nhân sự kiểm tra → kế toán duyệt → chi trả, khóa chấm công khi kỳ đã khóa, nhân viên xem phiếu lương của mình sau khi duyệt, xuất CSV bảng lương.
- **Giao diện**: thanh bên chia nhóm giống CRM (Sản xuất video, Bán hàng, Sản phẩm, Tài chính, Nhân sự, Hệ thống), tổng quan hoạt động theo quyền, trang chủ riêng cho cộng tác viên.

### Kết quả kiểm thử

| Bộ | Kết quả |
|---|---|
| `tsc` strict, ESLint, `next build` | Đạt |
| Unit | 7/7 |
| CSDL (Postgres thật, migration `0400`–`0900`) | **56/56** (18 quy trình video + 21 CRM / dự án / tài chính / cộng tác viên / lương) |
| E2E Playwright | **14/14** (7 mới: mở mọi trang, tài khoản + chuyển đổi lead, cơ hội → báo giá → hợp đồng → dự án, quyền xem tiền của dự án, chi phí duyệt → thanh toán, cộng tác viên, lương) |

### Bổ sung: báo giá PDF và nhập khách hàng từ Excel (2026-11-27, migration `0840`–`0850`)

- **Báo giá PDF** (`/bao-gia/<id>/pdf`, nút "Xem PDF" / "Tải PDF"): A4, font Be Vietnam Pro nhúng trong ứng dụng (`assets/fonts`), đầu trang công ty (Cài đặt → Thông tin công ty), khối khách hàng, bảng hạng mục tự sang trang và lặp tiêu đề, tạm tính / thuế / tổng, **số tiền bằng chữ**, điều khoản, thông tin thanh toán, ô chữ ký, số trang. Quyền xem theo RLS (không có quyền CRM → 404). Đã cấu hình để font và dữ liệu của `pdfkit` được đóng gói cùng hàm serverless / bản Docker.
- **Nhập Excel / CSV** cho **Tài khoản, Liên hệ, Lead** (`/nhap-khach-hang/<loại>`, nút "Nhập từ Excel" ở mỗi danh sách; có **tệp mẫu** để tải): nhận cột theo tên (có / không dấu, thứ tự tùy ý, bỏ qua dòng tiêu đề phụ phía trên), chuẩn hóa số điện thoại (+84, mất số 0 đầu do Excel), email, ngày sinh, số tiền, tách họ tên; khớp Ngành / Nguồn / Người phụ trách / Công ty theo tên; **xem trước** từng dòng (mới / trùng / lỗi + cảnh báo) rồi mới ghi; loại trùng với dữ liệu có sẵn **và** trong tệp (tài khoản: MST hoặc tên; liên hệ: email hoặc họ tên + công ty; lead: email, điện thoại hoặc họ tên + công ty); CSDL kiểm tra lại quyền và trùng trong một giao dịch; liên hệ có thể tự tạo công ty chưa có. Nhập lại cùng một tệp không tạo trùng.
- Kiểm thử thêm: unit 28 (số tiền bằng chữ, PDF nhiều trang đọc lại bằng `pdftotext`, chuẩn hóa / kế hoạch nhập, đọc xlsx và csv), CSDL 43 (nhập tài khoản / liên hệ / lead, quyền, thông tin công ty), E2E 16 (tải PDF hợp lệ; nhập Excel có xem trước, trùng, lỗi, nhập lại).

### Bổ sung: hợp đồng PDF và nhập sản phẩm từ Excel (migration `0860`)

- **Hợp đồng PDF** (`/hop-dong/<id>/pdf`, nút "Xem PDF" / "Tải PDF"): đầu trang công ty, Bên A (khách: tên, MST, địa chỉ, người đại diện + chức danh) và Bên B (công ty + tài khoản ngân hàng), Điều 1 hạng mục (lấy từ báo giá đã chấp nhận), Điều 2 giá trị + bằng chữ + **tiến độ thanh toán từ các mốc của dự án** (nếu đã có dự án), Điều 3–11 điều khoản chung, "Điều khoản bổ sung" từ ghi chú hợp đồng, ô chữ ký kèm ngày ký; hợp đồng chưa hiệu lực có dòng đỏ "BẢN NHÁP — CHƯA CÓ HIỆU LỰC". **Điều khoản chung là mẫu thông dụng, chưa qua pháp chế / luật sư — cần rà soát trước khi dùng để ký** (trang hợp đồng có ghi chú nhắc).
- **Sửa hợp đồng** (`update_contract`): nháp / chờ hiệu lực sửa được ngày hiệu lực, hết hạn, điều khoản bổ sung; đã hiệu lực chỉ ghi nhận người đại diện khách ký, ngày khách ký, ngày công ty ký (giá trị không đổi ở đây — cần phụ lục, chưa có).
- **Nhập sản phẩm từ Excel / CSV** (`/nhap-khach-hang/san-pham`, nút "Nhập từ Excel" ở trang Sản phẩm, có tệp mẫu): nhận cột Tên / Mã / Danh mục / Đơn vị / Giá / Mô tả / Trạng thái (tiêu đề tiếng Việt thường gặp), giá kiểu `4.000.000` hoặc `4,000,000`, khớp danh mục & đơn vị theo tên và **tùy chọn tự tạo danh mục / đơn vị chưa có**, loại trùng theo tên hoặc mã (với dữ liệu có sẵn và trong tệp), giá hỏng → báo lỗi dòng, thiếu giá → đặt 0 kèm cảnh báo. Dòng trùng bị **bỏ qua** (chưa có chế độ cập nhật giá hàng loạt).
- Tái cấu trúc: phần dùng chung của PDF (font, đầu trang, bảng, tổng tiền, chữ ký, số trang) nằm ở `src/lib/pdf-common.ts`; báo giá và hợp đồng dùng chung.
- `requireContext` thử lại tối đa 3 lần khi tầng API trả lỗi thoáng qua (đã gặp hai lần trong E2E: một lỗi 500 khi lấy thông tin người dùng, không tái hiện được lúc chạy riêng) và nêu rõ mã lỗi khi thông báo rỗng.
- Kiểm thử: unit 34, CSDL 45, E2E 18; PDF hợp đồng đọc lại bằng `pdftotext` và xem ảnh trang.

### Bổ sung: dữ liệu ảo để xem demo (`docs/demo-data.md`)

- `node scripts/seed-demo.mjs --password … [--org …]` nạp bộ dữ liệu phủ **cả 54 bảng** (video, CRM, báo giá → hợp đồng → dự án, thu chi, tạm ứng, cộng tác viên, chấm công 3 tháng, 2 kỳ lương, thông báo, nhật ký…) cùng 13 tài khoản demo theo vai trò; `--remove` gỡ sạch (id đánh dấu `dede…`, không đụng dữ liệu thật). Chạy lại không nhân đôi. Có workflow tay "Dữ liệu demo (nạp / gỡ)" cho cloud.
- Kiểm thử (`tests/db/zz-demo.test.ts`): mọi bảng có dữ liệu, nạp lại không đổi số dòng, gỡ về đúng trạng thái trước, báo giá / bảng lương cộng khớp, ràng buộc video thỏa; đã mở mọi trang bằng 6 tài khoản demo không lỗi.
- Kiểm thử tổng: unit 34, CSDL 47, E2E 18.

### Bổ sung: phòng ban có nhân viên, biểu đồ Dashboard và nâng cấp CRM (migration `0900`)

- **Phòng ban chứa nhân viên** (`/phong-ban`, `/phong-ban/<id>`): thẻ từng phòng (số người, trưởng phòng, ảnh đại diện, cơ cấu vai trò), trang chi tiết có danh sách nhân viên + chức vụ trong phòng + vai trò, **thêm nhân viên / gỡ / đặt trưởng phòng** (chỉ quản trị — kiểm tra ở CSDL), một người thuộc nhiều phòng (phòng chính + kiêm nhiệm), danh sách "chưa thuộc phòng nào". Mọi nhân viên (trừ cộng tác viên) xem được cơ cấu.
- **Dashboard biểu đồ** (không dùng thư viện ngoài, chữ đọc được trên điện thoại, có mô tả cho trình đọc màn hình): thu – chi 6 tháng, phễu cơ hội theo giai đoạn, video tạo / đăng theo tuần, video theo giai đoạn, nhân sự theo phòng ban, dự án theo trạng thái, lead theo nguồn / trạng thái, khách hàng có giá trị hợp đồng cao nhất; mỗi người chỉ thấy biểu đồ thuộc quyền của mình (tính ở CSDL theo RLS). Có khối "Cần chú ý trong bán hàng" (báo giá / hợp đồng sắp hết hạn, cơ hội quá ngày chốt, lead lâu chưa chăm).
- **Báo cáo bán hàng** (`/bao-cao-ban-hang`): giá trị đang theo đuổi, dự báo theo xác suất, tỷ lệ thắng, giá trị trung bình, chu kỳ chốt; dự báo doanh thu theo tháng dự kiến chốt; hợp đồng ký theo tháng; báo giá theo trạng thái; lý do thua; hiệu quả theo nguồn lead; kết quả theo người phụ trách.
- **Tính năng giống CRM**: **ghi chú & lịch sử hoạt động** trên lead / tài khoản / liên hệ / cơ hội / dự án (ghi chú có ghim, nhật ký thao tác dịch ra tiếng Việt, công việc liên quan, thêm công việc ngay trên bản ghi); **Kanban kéo thả** cho Cơ hội và Lead (có ô chọn cột cho điện thoại / bàn phím; cột Thắng tự động theo hợp đồng, thua phải nhập lý do); **tìm kiếm nhanh** ở thanh bên + trang kết quả gom theo loại; **xuất CSV** theo bộ lọc đang xem ở mọi danh sách CRM.
- Dữ liệu demo bổ sung ghi chú và lịch sử hoạt động; kiểm thử "mọi bảng có dữ liệu" tự bao gồm bảng mới.
- Kiểm thử: unit 34, CSDL 56, E2E 22.

### Bổ sung: Bảng công việc theo quy trình video (migration `0910`)

Mục **Công việc** (`/cong-viec`) có 4 tab dùng chung một nguồn dữ liệu (`tasks` + `task_assignees`):

- **Danh sách chờ** – bảng tra cứu mọi việc kể cả Hoãn / Hủy, giữ các nút cũ (Bắt đầu / Hoàn thành / Mở lại / Xóa) cho việc độc lập.
- **Bảng công việc** (mặc định) – 3 cột *Việc cần làm / Đang tiến hành / Xong*, đếm số thẻ, nút “+” thêm nhanh, kéo thả và ô “Chuyển đến” (điện thoại / bàn phím). Có thêm chế độ **Theo nhóm công việc**: tự thêm / đổi tên / xóa nhóm (cột), xếp thẻ vào nhóm.
- **Lịch sản xuất** – tuần / tháng; việc có ngày bắt đầu + hạn là thanh trải dài, chỉ có hạn là cột mốc ◆, chưa có ngày nằm ở “Chưa xếp lịch”.
- **Việc của tôi** – “Cần tôi xử lý” (Content cần chuẩn bị / bổ sung, Editor cần xác nhận bàn giao / dựng / sửa, Leader cần duyệt, người có quyền đăng) và “Được giao cho tôi”.

Mỗi video tự có 2 đầu việc (**Chuẩn bị nội dung**, **Dựng bản nháp**) do trigger CSDL đồng bộ từ video (khóa `video_id` + `kind`, nên không trùng). Trạng thái / người phụ trách / ưu tiên của đầu việc video luôn theo video: chờ duyệt vẫn là *Đang tiến hành* (nhãn “Chờ Leader duyệt”), duyệt xong → *Xong* và video “Chờ đăng”; “Đã đăng” chỉ qua xác nhận đăng. Kéo thẻ video **không** đổi trạng thái: hệ thống mở đúng bước (bàn giao / nộp duyệt / duyệt) hoặc báo lý do; `set_task_status`, `save_task`, `delete_task`, `set_task_assignees` từ chối đầu việc video và trigger `tasks_guard` chặn ghi trực tiếp kể cả quản lý CRM. Lịch do Leader đặt (`set_task_schedule`) được giữ qua các lần đồng bộ. Việc có thể liên kết dự án (`save_task` / `set_task_project`; đầu việc video theo dự án của video), lọc theo dự án, hiện mã dự án trên thẻ.

Kiểm thử: `tests/db/work-board.test.ts` (đồng bộ, chặn bỏ qua quy trình, quyền xem, đặt lịch, nhóm, dự án, kịch bản BelAZ), `tests/e2e/work-board.spec.ts` (bảng, kéo thả, lỗi → hoàn tác, thẻ video, BelAZ, lọc, phân quyền, điện thoại, nhóm + dự án). Dữ liệu demo có thêm video **BelAZ** (đang dựng 65%, hạn thứ Sáu) và 3 nhóm công việc.

### Bổ sung: quản trị nhân sự — Phòng ban, Nhân viên, Chức vụ (migration `0930`)

Xem `docs/nhan-su.md` (đối chiếu sơ đồ ↔ schema thật, bảng Tính năng | Bảng/cột | Quyền). Điểm chính: một người giữ **nhiều chức vụ cùng phòng**, nhiều quản lý / phòng, danh bạ nhân viên có mã NV, hình thức làm việc, loại và trạng thái nhân sự; hồ sơ có Tổng quan · Công tác · Liên hệ · Tài liệu · Công việc · Lương & bảo hiểm · Tài khoản; lọc / sắp xếp / phân trang / tổng hợp chạy ở CSDL; CSV theo bộ lọc. Kiểm thử: `tests/db/hr.test.ts` (13 bài), `tests/e2e/hr.spec.ts` (8 bài).

### Bổ sung: hồ sơ tự phục vụ (migration `0940`)

Cài đặt → **Hồ sơ của tôi**: ảnh đại diện (xem trước / thay / gỡ, hiện ở sidebar, danh sách nhân viên, hồ sơ, phòng ban), tự sửa địa chỉ / email / điện thoại, xem thông tin công việc và lương theo quyền, **Tài liệu cần nộp**. HR giao yêu cầu theo phòng hoặc từng người, duyệt / yêu cầu nộp lại kèm lý do, lọc ai còn thiếu giấy tờ (`/nhan-su/giay-to`). Chi tiết: `docs/nhan-su.md`. Kiểm thử: `tests/db/self-service.test.ts` (8 bài), `tests/e2e/self-service.spec.ts` (5 bài).

### Giới hạn đã biết (chưa làm hoặc làm mức cơ bản)

- **Thuế TNCN không tự tính** — kế toán nhập tay thành một dòng "Thuế TNCN" (biểu thuế cần cập nhật theo quy định hiện hành). Tỷ lệ bảo hiểm mặc định 10,5% chỉnh được ở Bảng lương → Thiết lập; cần kế toán xác nhận.
- Lãi / lỗ dự án **chưa gồm lương** và chi phí chung không gắn dự án.
- Hợp đồng chưa có tệp đính kèm (bản ký / scan); chưa có phụ lục / thay đổi giá trị hợp đồng; chưa có tồn kho / giao hàng cho đơn hàng.
- Các danh mục CRM chỉ có tìm kiếm + lọc 1 cột; chưa có theo dõi người theo dõi (follower), lịch sử hoạt động từng khách, nhắc việc tự động gửi (đã lưu `reminder_at`, chưa có tiến trình gửi).
- Xuất dữ liệu dạng CSV UTF-8 (mở bằng Excel); số tài khoản có số 0 đầu có thể bị Excel cắt — nhập cột dạng Text.
- Chưa thử trên Windows thật / Vercel thật với các migration mới: cần chạy workflow "Cập nhật cơ sở dữ liệu cloud" sau khi gộp.

---

## Chuyển sang quy trình công ty media (2026-11-26)

Theo "Bảng báo cáo bộ phận content HANA MEDIA", bỏ phần dự án / công việc / báo cáo ngày chung chung, thay bằng quy trình sản xuất video.

### Đã chạy

- **CSDL**: `0100` (vai trò mới: `system_admin`, `manager`, `content`, `editor`) + `0200_media_pipeline`: `channels`, `org_counters`, `videos`, `video_items` (4 hạng mục), `video_events`, `video_comments`, `notifications`; RPC `create_video`, `update_video_info`, `assign_video`, `update_content`, `submit_handover`, `confirm_handover`, `update_edit`, `submit_for_review`, `review_video`, `publish_video`, `set_video_hold`, `add_video_comment`, `upsert_channel`, `mark_notifications_read`.
- **Giao diện**: Tổng quan (việc cần làm theo vai trò, dây chuyền, chỉ số tháng, quá hạn); Video (bảng giống sheet, lọc tháng/giai đoạn/người, Kanban, tạo video); chi tiết video theo 4 bước + phân công + tạm dừng/hủy + trao đổi + lịch sử; Báo cáo tháng (chỉ số, theo Content, theo Editor, bảng, xuất CSV UTF-8 cùng cột với sheet); Thông báo; Cài đặt → Kênh phát hành.
- **Dữ liệu mẫu**: 9 video tháng 11 từ sheet (Hiếu, Duy, Hòa, Tiện…), link Drive thay bằng link giả.

### Kết quả kiểm thử

| Bộ | Kết quả | Nội dung chính |
|---|---|---|
| `tsc` strict, ESLint | Đạt, 0 cảnh báo | |
| Unit | **7/7** | Trạng thái Content khớp sheet, điều kiện bàn giao, việc cần làm theo vai trò, quá hạn, tháng, chỉ số tháng, CSV chống chèn công thức |
| CSDL (Postgres thật) | **17/17** | Cả đội xem bảng, không thấy công ty khác; khóa ngoại chặn gán người/kênh công ty khác; anon và UPDATE trực tiếp bị từ chối; tài khoản khóa mất quyền; Content tự tạo (mã tự tăng), không tạo hộ người khác; Editor không tạo được; Leader phân công đúng vai trò; **tạo đồng thời không trùng mã**; phân công lại có nhật ký; chỉ Content phụ trách sửa Content; **bàn giao chặn khi thiếu hạng mục/link**; không sửa Content sau bàn giao; Editor khác không xác nhận được; yêu cầu bổ sung bắt buộc ghi chú và trả về Content; Editor/Content không tự duyệt; yêu cầu sửa bắt buộc ghi chú; không nhảy bước; tạm dừng/hủy chỉ Leader; thông báo chỉ người nhận thấy; người ngoài không bình luận được; chỉ quản trị đổi vai trò |
| E2E Playwright | **5/5** | Đăng nhập sai; bảng tháng 11 khớp sheet (D0004: Hiếu → Hòa, Đã nhận đủ, ghi chú Edit); **toàn bộ quy trình** Content tạo → bàn giao bị chặn khi thiếu → bàn giao → Editor yêu cầu bổ sung → Content thấy thông báo, bổ sung → Editor nhận đủ, dựng, nộp duyệt → Leader yêu cầu sửa → Editor nộp lại → Leader duyệt → đăng → báo cáo tháng + tải CSV đúng cột; Editor không thấy nút của video không thuộc mình; điện thoại dạng thẻ, không cuộn ngang |

### Cần làm tiếp / cần môi trường

- Xác nhận các giả định trong README (đặc biệt: Leader là người duyệt và đăng; có cần bước Thumbnail/Tiêu đề SEO riêng không).
- Nhập dữ liệu thật các tháng còn lại từ Google Sheet (có thể viết công cụ nhập từ tệp Excel).
- Đẩy thông báo thời gian thực, chat, PWA ngoại tuyến; chạy thử trên Windows/Edge và triển khai thật khi có cấu hình.

---

## (Lưu trữ) Giai đoạn 1–3: Lát cắt đầu tiên dạng quản lý công việc chung (2026-11-26)

> Phần nghiệp vụ dưới đây đã được thay bằng quy trình sản xuất video ở trên; hạ tầng và cấu hình triển khai vẫn giữ nguyên.

### Đã chạy

- **CSDL** (`supabase/migrations`):
  - `0100` doanh nghiệp, phòng ban, hồ sơ, `user_roles`, `role_permissions`, `audit_logs`, hàm phân quyền ở schema `app`, RPC `get_my_context`, `set_user_roles`, `set_user_active`.
  - `0200` dự án, thành viên, công việc, `task_events`, `task_comments`, view `project_stats` (tiến độ có trọng số), RPC tạo dự án/giao việc/cập nhật tiến độ/duyệt/trả lại/giao lại/sửa tiến độ/hủy.
  - `0300` báo cáo ngày (nháp → đã gửi), RPC `save_daily_report_draft`, `submit_daily_report` (một giao dịch, idempotent theo người dùng + ngày, khóa `FOR UPDATE`).
  - RLS bật trên mọi bảng; client chỉ `SELECT`; khóa ngoại ghép `(org_id, …)`.
- **Ứng dụng**: đăng nhập; sidebar theo quyền (Tổng quan, Việc của tôi, Dự án, Báo cáo, Trò chuyện, Nhân sự, Cài đặt); Việc của tôi + cập nhật nhanh (một cột trên điện thoại); dự án (tạo, thành viên, giao việc, chỉ số tiến độ/hoàn tất/chờ duyệt/quá hạn/vướng mắc, danh sách/Kanban, duyệt/trả lại); báo cáo ngày (nháp máy chủ + nháp cục bộ, chống nhấn hai lần, trạng thái đang gửi/gửi lỗi/mất mạng, gửi lại an toàn); báo cáo của nhân sự theo phạm vi quản lý; nhân sự (đổi vai trò, khóa tài khoản — có nhật ký); đổi mật khẩu.
- **Triển khai tại văn phòng** (`deploy/onprem`): compose Postgres + GoTrue + PostgREST + Realtime v2.68 + Storage (file) + Caddy HTTPS; ảnh ứng dụng `Dockerfile` / `Dockerfile.prebuilt`; `gen-onprem-env.mjs`, `bootstrap-org.mjs`.

### Lệnh đã dùng (môi trường kiểm thử Linux; tương đương PowerShell ghi trong README)

```bash
npm install                                   # khóa phiên bản trong package-lock.json
node scripts/gen-onprem-env.mjs --domain hanapower.lan
docker compose -f deploy/onprem/docker-compose.yml -f deploy/onprem/docker-compose.sandbox.yml up -d db auth rest realtime storage gateway
node scripts/migrate.mjs --reset --yes --seed
npm run typecheck && npm run lint && npm run test
npm run test:db
npm run build && npm run start
E2E_BASE_URL=http://localhost:3000 E2E_RESET_DB=1 npm run test:e2e
# Ứng dụng trong container, sau gateway HTTPS:
BUILD_STANDALONE=1 npm run build
docker build -f deploy/onprem/Dockerfile.prebuilt -t hanapower-app:local .
docker compose ... --profile app up -d --no-build
E2E_BASE_URL=https://localhost:8443 E2E_IGNORE_HTTPS_ERRORS=1 E2E_RESET_DB=1 npm run test:e2e
# Không có Internet:
docker compose -f docker-compose.yml -f docker-compose.sandbox.yml -f docker-compose.offline-test.yml --profile check run --rm offline-check
```

### Kết quả kiểm thử

| Bộ | Kết quả | Nội dung |
|---|---|---|
| `tsc --noEmit` (strict) | Đạt | |
| ESLint (`next/core-web-vitals`, `next/typescript`) | Đạt, 0 cảnh báo | |
| Unit (Vitest) | **8/8** | Công thức tiến độ, trạng thái 100% → Chờ duyệt, quá hạn theo ngày doanh nghiệp, thông báo lỗi |
| CSDL (Vitest + Supabase Postgres 15.8 thật) | **22/22** | Tiến độ có trọng số/loại việc hủy/NULL; trọng số > 0; nhân viên không tạo dự án; chỉ QLDA giao việc, chỉ cho thành viên; **đọc chéo dự án bị chặn**; **đọc/ghi chéo doanh nghiệp bị chặn** (cả ở mức khóa ngoại); anon bị từ chối; không UPDATE/INSERT trực tiếp; tài khoản bị khóa mất quyền; người phụ trách không tự duyệt; duyệt → tăng hoàn tất + nhật ký, duyệt lặp không đổi; trả lại cần lý do; giao lại ghi nhật ký; gửi báo cáo cập nhật việc + lịch sử trong một giao dịch; **gửi lại/nhấn hai lần không ghi trùng**; **không báo cáo/sửa báo cáo của người khác**; QLDA chỉ thấy dòng của dự án mình, trưởng phòng thấy cả báo cáo; **hai lần gửi song song từ hai kết nối** chỉ tạo một báo cáo; chỉ quản trị đổi vai trò + nhật ký |
| E2E Playwright (Next.js production, Chromium) | **4/4** | Đăng nhập sai; luồng đầy đủ QLDA tạo dự án → giao việc → nhân viên gửi báo cáo 100% (nhấn đúp) → QLDA thấy 100%, hoàn tất 0/1, chờ duyệt 1, thấy dòng báo cáo → duyệt → 1/1 → nhân viên dự án khác không mở được; trả lại kèm lý do hiện cho nhân viên; điện thoại 390px một cột, không cuộn ngang |
| E2E qua gateway HTTPS + ứng dụng trong container | **4/4** | Cùng kịch bản tại `https://localhost:8443` (Caddy `tls internal`) |
| Kiểm tra ngoại tuyến (mạng Docker `internal`) | **5/5** | Không ra được Internet; đăng nhập GoTrue; RPC + RLS; lưu/tải tệp (backend file); Realtime broadcast qua WebSocket của gateway |

### Vấn đề gặp và cách xử lý

- `loading.tsx` ở nhóm route `(app)` làm server action treo sau `revalidatePath` (Next.js 15.5) → bỏ `loading.tsx`, giữ `error.tsx`.
- `supabase-js` 2.119 gửi khung broadcast nhị phân mà Realtime v2.34 không đọc được → nâng ảnh Realtime lên v2.68.0.
- UUID mẫu không đúng biến thể RFC 4122 → dùng `z.guid()` (Postgres vẫn kiểm tra kiểu `uuid`).

### Cần môi trường bổ sung để xác minh

- **Windows thật**: chạy `scripts/setup.ps1`, `db.ps1`, `test.ps1`, `onprem-init.ps1` (chưa chạy được PowerShell trên Windows trong môi trường này); `npx supabase start` với Docker Desktop (môi trường này không kéo được ảnh từ registry mặc định của Supabase CLI, nên đã kiểm thử bằng compose tự lưu trữ với cùng các thành phần).
- **Edge**: cài PWA, cửa sổ độc lập, tin cậy CA nội bộ qua GPO.
- **Hai máy / VPN / DNS nội bộ**; **cloud** (Supabase managed + tên miền HTTPS).

## Việc tiếp theo

1. Giai đoạn 4: báo cáo tuần (tổng hợp từ báo cáo ngày, nhận xét, kế hoạch tuần sau, bản chụp khi gửi); thông báo trong ứng dụng (giao việc, chờ duyệt, bị trả lại, sắp tới hạn); bình luận và tệp đính kèm công việc (bucket riêng + chính sách theo bản ghi); giao diện quản trị tài khoản/phòng ban.
2. Giai đoạn 5: chat 1–1, nhóm, kênh dự án; lưu Postgres trước, Realtime kênh riêng chỉ báo cập nhật; tải bù khi kết nối lại; kiểm thử đọc chat sau khi bị xóa khỏi nhóm.
3. Giai đoạn 6: service worker, trang ngoại tuyến, kiểm tra cài đặt Edge.

## Nâng cấp Dự án và Thu chi & công nợ (2026-11-27)

Xem `docs/du-an-thu-chi.md` (đối chiếu tên tham chiếu ↔ schema thật, luồng ghi nhận thu một cửa, kỳ tài chính / khóa kỳ / đối chiếu, báo cáo, quyền, việc còn lại). Điểm chính: nhiều quản lý / dự án, tiến độ + rủi ro (có chữ + lý do), danh sách Bảng / Kanban / Dòng thời gian với chế độ xem nhanh, cột chọn được, góc nhìn đã lưu, xem nhanh bên phải; tab Thanh toán với lịch mốc, % theo hợp đồng và phần chưa phân bổ; **ghi nhận thu một luồng cho mọi màn hình** (idempotent, an toàn khi đồng thời); thu chi có Tổng quan, Khoản thu, Khoản chi, Phải thu theo tuổi nợ, Kỳ tài chính (ghi chú, chốt kỳ, đối chiếu), Chứng từ nhiều tệp, Báo cáo theo dự án / khách hàng / tháng / phòng ban / nguồn / loại; CSV theo bộ lọc; nhắc việc mỗi sự kiện một lần. Kiểm thử: `tests/db/projects-finance.test.ts` (22 bài), `tests/e2e/projects-finance.spec.ts` (7 bài).

## Sản phẩm, Bảng giá, phê duyệt giá và lịch sử tài liệu (2026-11-28)

Xem `docs/san-pham-bang-gia.md`. Điểm chính: danh sách sản phẩm có xem nhanh, hồ sơ có so sánh giá + **ước tính báo giá** + **thêm vào cơ hội**; bảng giá chỉnh sửa trực tiếp (kiểm tra trước khi lưu, xung đột phiên bản) hoặc **đề nghị đổi giá → duyệt → hiệu lực theo ngày**; điều hành giá (thiếu giá đếm theo sản phẩm duy nhất); danh mục / đơn vị có số sản phẩm đang dùng; lịch sử xử lý yêu cầu nộp tài liệu. Kiểm thử: `tests/db/pricing.test.ts` (12), `tests/db/doc-history.test.ts` (1), `tests/e2e/pricing.spec.ts` (6).


## Nâng cấp trang Video — "Quản lý sản xuất video" (2026-11-28)

Xem `docs/video-san-xuat.md`. Trưởng nhóm mở `/video` và trả lời ngay: video nào cần xử lý, ai phụ trách, việc tiếp theo là gì. Điểm chính: tiêu đề gọn + nút **+ Tạo video** / **Nhập từ Excel** / chuyển **Bảng | Kanban**; bốn chế độ xem nhanh có đếm (Tất cả, Chờ xác nhận bàn giao, Chưa có Editor, Tạm dừng); tìm theo tiêu đề / mã, chọn tháng có nút trước / sau, lọc giai đoạn và người phụ trách (nói rõ Content hay Editor) — Bảng và Kanban dùng chung bộ lọc, lưu trên URL; mỗi video một dòng với **Hạng mục** (số hạng mục Content hoàn tất, bấm để xem mục nào xong / thiếu), **Bàn giao** (chưa gửi / chờ Editor xác nhận / đã nhận đủ / yêu cầu bổ sung) và **Giai đoạn** (+ việc tiếp theo) tách bạch; panel chi tiết bên phải (slide-over trên laptop hẹp, Esc đóng và trả tiêu điểm về dòng) chỉ hiện hành động đúng dữ liệu + quyền. Migration `20261127000980_video_handover_idempotent.sql` làm `confirm_handover` an toàn khi bấm đúp. Kiểm thử: `tests/unit/video-board.test.ts` (5), `tests/db/pipeline.test.ts` (+1), `tests/e2e/video-board.spec.ts` (9).
