# Sản phẩm, Bảng giá và quy trình đổi giá

Màn hình: `/san-pham` (danh sách + xem nhanh), `/san-pham/<id>` (Tổng quan · Bảng giá · Tệp đính kèm, có **Ước tính báo giá**), `/san-pham/dieu-hanh` (điều hành giá),
`/bang-gia` (danh sách), `/bang-gia/<id>` (Dòng giá · Đề nghị thay đổi · Thông tin), `/bang-gia/de-nghi` và `/bang-gia/de-nghi/<id>` (đề nghị thay đổi giá), `/danh-muc`, `/don-vi` (số sản phẩm đang dùng).
Tệp: `GET /san-pham/tep/<id>` (`?xem=1` xem ảnh / PDF). Migration: `20261127000960_pricing.sql`, `20261127000970_doc_history.sql`.

## Đối chiếu yêu cầu ↔ schema thật

| Yêu cầu | Trong repo trước khi làm | Xử lý |
|---|---|---|
| `product_attachments` | **chưa có** | `product_files` + `product_file_blobs` (ảnh ≤ 2 MB, tài liệu ≤ 5 MB, lưu CSDL, tải qua route kiểm quyền). `products.image_file_id` = ảnh chính. |
| Bảng giá mặc định của sản phẩm | **chưa có** | `products.default_price_book_id` (khóa ngoại cùng doanh nghiệp). |
| Đơn vị của dòng giá | `price_book_products` khóa duy nhất `(price_book_id, product_id)`; **đơn vị là `products.unit_id`** (một đơn vị / sản phẩm) | Giữ nguyên: "cùng sản phẩm, cùng đơn vị" = cùng sản phẩm. Giá riêng theo từng đơn vị (vd. phút và video) cần thêm `unit_id` vào khóa dòng giá — chưa làm vì sẽ đổi hợp đồng dữ liệu của mọi báo giá cũ. |
| Phí / thuế dạng tiền | chỉ lưu **`fee_percent`, `tax_percent`** | Trường nhập = đơn giá, % phí, % thuế. Tiền phí / tiền thuế / giá sau phí-thuế là **trường tính** (không thể mâu thuẫn). |
| Quy tắc tính | `round(giá × SL × (1+phí%) × (1+thuế%), 2)` rải rác | Một nơi: `app.line_amounts` — tạm tính = round(giá×SL,2); phí = round(tạm tính×%phí,2); thuế = round((tạm tính+phí)×%thuế,2); tổng = cộng ba số. Dùng cho dòng cơ hội, báo giá, ước tính, lưới giá (UI dùng cùng công thức). Với số tiền nguyên VND kết quả không đổi so với trước. |
| Phiên bản giá / ngày hiệu lực | **chưa có** | `price_book_line_history` (mỗi dòng: giá, phí, thuế, `effective_from`; duy nhất theo `(bảng, sản phẩm, ngày)` ⇒ tại một thời điểm chỉ một phiên bản hiệu lực). `price_books.version` tăng sau mỗi lần lưu / áp dụng. `price_lookup(bảng, sản phẩm, ngày)` tra giá hiệu lực. |
| Phê duyệt giá | **chưa có** | `price_change_requests/lines/events`; quyền mới `pricing.approve` (manager, system_admin); bảng bật `requires_approval` chặn sửa trực tiếp **ở mọi đường** (trigger trên `price_book_products`). |
| Bản chụp giá trên báo giá | `quote_items` đã lưu đơn giá / phí / thuế **tại thời điểm tạo** | Giữ nguyên + thêm `quote_items.product_id` để đối chiếu. Báo giá đã gửi không bao giờ đổi; PDF đọc từ bản chụp. |

## Quy tắc nghiệp vụ

- **Ước tính**: `price_estimate(sản phẩm, bảng giá, số lượng)`. DV001: đối tác 4.500.000 × 3 = **13.500.000** tạm tính. Thiếu dòng giá → báo tên bảng + đơn vị cần bổ sung.
- **Thêm vào cơ hội** (`add_priced_line`): ghi sản phẩm, đơn vị, số lượng, đơn giá, phí, thuế. Khác bảng giá của cơ hội → trả về chênh lệch và 3 cách xử lý (dùng bảng của cơ hội · dùng bảng đã chọn cho riêng dòng này · đổi bảng giá của cơ hội). Sản phẩm ngừng kinh doanh không thêm được vào cơ hội mới nhưng vẫn tra cứu được trên giao dịch cũ.
- **Điều hành giá** (`price_health`): sản phẩm đang kinh doanh thiếu giá = `no_default` · `default_inactive` · `no_line`; đếm theo `product_id` duy nhất; **giá 0 hợp lệ**.
- **Lưu trực tiếp** (`save_price_lines`, bảng không cần duyệt): một giao dịch, kiểm tra trùng / miền giá trị, **xung đột phiên bản** (người sau nhận “bảng đã được người khác sửa”).
- **Đề nghị đổi giá**: Nháp → Chờ duyệt → Đã duyệt (**chờ hiệu lực** → **đang áp dụng**) hoặc Yêu cầu chỉnh sửa (cần ý kiến). Người lập ≠ người duyệt (kể cả quản trị). Duyệt chỉ khi giá “trước” còn khớp bảng hiện hành, nếu không phải “Đối chiếu giá hiện hành” (`rebase_price_change`). Hai đề nghị cùng ngày hiệu lực cho cùng một dòng bị chặn. `apply_due_price_changes` áp dụng đề nghị tới ngày hiệu lực (idempotent; gọi trước mọi thao tác đọc giá) — trước ngày hiệu lực giá cũ vẫn dùng.
- **Báo giá**: báo giá mới dùng giá hiệu lực; báo giá **nháp** chỉ cập nhật sau khi xem chênh lệch và xác nhận (`quote_price_diff` → `refresh_quote_prices`); báo giá đã gửi giữ nguyên. Cơ hội có panel tương tự (`opportunity_price_diff` → `refresh_opportunity_prices`).
- **Danh mục / Đơn vị**: hiển thị số sản phẩm đang dùng (bấm mở danh sách đã lọc); trigger chặn ngừng sử dụng khi còn sản phẩm đang bán.

## Lịch sử yêu cầu nộp tài liệu (0970)

`document_request_events`: ai giao / nộp / duyệt / yêu cầu nộp lại, thời điểm, lý do, tên tệp — **kể cả bản đã bị thay thế** (tệp cũ vẫn bị xóa để giải phóng dung lượng). Chính chủ và HR xem được.

## Kiểm thử

`tests/db/pricing.test.ts` (12 bài: ước tính, thêm vào cơ hội, hiệu lực theo ngày, bản chụp báo giá, tách người lập / người duyệt, dữ liệu gốc đổi, xung đột phiên bản, thiếu giá, so sánh giá, danh mục, tệp, phân quyền), `tests/db/doc-history.test.ts`, `tests/e2e/pricing.spec.ts` (6 bài).

## Chưa làm / hạn chế

1. **Giá theo đơn vị riêng** (cùng sản phẩm bán theo “video” và “phút” với hai giá): cần `unit_id` trong khóa dòng giá.
2. **Sơ đồ tổ chức**: `departments` chưa có `parent_id` nên chưa có quan hệ cha–con để vẽ sơ đồ.
3. **Xóa dòng giá qua đề nghị**: đề nghị hiện chỉ gồm thêm / sửa dòng; xóa dòng chỉ làm trực tiếp ở bảng không cần duyệt.
4. **Sửa dòng cơ hội đã thêm** vẫn bằng thao tác xóa + thêm lại (chưa có sửa tại chỗ).
