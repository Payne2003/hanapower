# Dữ liệu ảo để xem demo

Nạp một bộ dữ liệu mẫu phủ **mọi bảng** (khoảng 36 video, 24 lead, 15 khách hàng, 16 cơ hội, 12 báo giá, 5 hợp đồng, 6 dự án, thu chi, tạm ứng, cộng tác viên, chấm công 3 tháng, 2 kỳ lương, ghi chú và lịch sử hoạt động…) để xem toàn bộ ứng dụng có số liệu. Ngày tháng tính theo hôm nay nên luôn "mới".

## Cách an toàn

- Mọi bản ghi demo có id dạng `dede????-0000-4000-a000-…` → **gỡ chính xác**, không đụng dữ liệu thật.
- Chạy lại nhiều lần không nhân đôi.
- Tạo **13 tài khoản demo** `demo.<tên>@hanamedia.demo` với mật khẩu do bạn đặt. Đây là tài khoản đăng nhập thật — **đặt mật khẩu tạm và gỡ demo sau khi xem xong**, đừng để tồn tại trên hệ thống đang dùng thật.
- Nên nạp vào bản thử / doanh nghiệp thử nếu có; nạp vào hệ thống đang dùng thật sẽ lẫn số liệu demo vào báo cáo, dashboard, bảng lương (gỡ là hết).

## Tài khoản demo

| Email | Vai trò |
|---|---|
| `demo.quanly@hanamedia.demo` | Quản lý + quản trị hệ thống (xem được mọi mục) |
| `demo.truongnhom1@…`, `demo.truongnhom2@…` | Trưởng nhóm |
| `demo.content1..3@…` | Content |
| `demo.editor1..3@…` | Editor |
| `demo.ketoan@…` | Kế toán |
| `demo.nhansu@…` | Nhân sự |
| `demo.ctv1@…`, `demo.ctv2@…` | Cộng tác viên (chỉ thấy việc được giao) |

## Chạy trên máy phát triển

```bash
node scripts/seed-demo.mjs --password "MatKhauTam#1"           # nạp vào doanh nghiệp đầu tiên
node scripts/seed-demo.mjs --password "MatKhauTam#1" --org "Tên doanh nghiệp"
node scripts/seed-demo.mjs --remove                              # gỡ
```

## Chạy trên cloud (Supabase)

GitHub → **Actions → "Dữ liệu demo (nạp / gỡ)" → Run workflow**: chọn `nap` hoặc `go`, gõ `DEMO` để xác nhận, nhập mật khẩu tạm (chỉ khi nạp; mật khẩu hiện trên trang chạy workflow nên chỉ dùng mật khẩu tạm), tên doanh nghiệp (để trống = doanh nghiệp đầu tiên). Dùng secret `SUPABASE_DB_URL` sẵn có.

## Ghi chú

- Mã chạy tiếp theo (video, báo giá, hợp đồng, đơn hàng, dự án) vẫn tăng sau khi gỡ — sẽ có khoảng trống số thứ tự, không ảnh hưởng hoạt động.
- Gỡ demo xóa luôn các tài khoản demo và mọi thông báo / chấm công / lương của họ.
