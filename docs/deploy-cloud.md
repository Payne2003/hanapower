# Đưa HANA MEDIA lên cloud (cách 2)

Sau khi làm xong, cả đội (văn phòng và ở xa) mở **một đường link HTTPS** là dùng chung một dữ liệu.
Mỗi lần có bản mới: GitHub tự cập nhật cơ sở dữ liệu, Vercel tự triển khai — không ai phải cài lại.

Thành phần: **Supabase** (cơ sở dữ liệu, đăng nhập) + **Vercel** (chạy ứng dụng) + **GitHub** (mã nguồn, tự động hóa).

> Chi phí: gói miễn phí đủ để chạy thử. Lưu ý: Supabase gói Free **tạm dừng dự án nếu 7 ngày không có ai dùng** (bấm "Restore" để bật lại) và không sao lưu tự động; Vercel gói Hobby chỉ dành cho mục đích phi thương mại. Khi dùng chính thức cho công ty nên nâng Supabase Pro (~25 USD/tháng) và Vercel Pro (~20 USD/tháng/người quản trị).

## Bước 1 — Supabase (khoảng 5 phút)

1. Vào <https://supabase.com> → **Start your project** → đăng nhập bằng GitHub.
2. **New project**: Name `hanamedia`, **Database Password**: bấm *Generate* rồi **lưu lại mật khẩu này**, Region **Southeast Asia (Singapore)** → **Create new project**. Đợi 1–2 phút.
3. Lấy 4 thông tin (để ở một tệp ghi chú riêng, **không gửi qua chat**):
   - **Project URL**: *Project Settings → Data API* (dạng `https://xxxx.supabase.co`).
   - **anon key** và **service_role key**: *Project Settings → API Keys → tab "Legacy API keys"* (bấm *Reveal* để xem service_role).
   - **Chuỗi kết nối**: nút **Connect** ở đầu trang → mục **Session pooler** → sao chép, thay `[YOUR-PASSWORD]` bằng mật khẩu ở bước 2.
4. Tắt tự đăng ký: *Authentication → Sign In / Providers* → tắt **Allow new users to sign up** → Save.

## Bước 2 — GitHub (khoảng 3 phút)

1. Mở Pull Request #1 của repository và bấm **Merge pull request** (đưa mã vào nhánh `main`).
2. *Settings → Secrets and variables → Actions → New repository secret*:
   - Name: `SUPABASE_DB_URL` — Secret: chuỗi kết nối Session pooler ở bước 1.3.
3. Tab **Actions** → chọn **"Cập nhật cơ sở dữ liệu cloud"** → **Run workflow** → Run. Đợi dấu ✓ xanh (tạo bảng trên Supabase).

## Bước 3 — Vercel (khoảng 5 phút)

1. Vào <https://vercel.com> → đăng nhập bằng GitHub → **Add New… → Project** → chọn repository **hanapower** → **Import**.
2. Mục **Environment Variables**, thêm 3 biến:

   | Name | Value |
   |---|---|
   | `SUPABASE_PUBLIC_URL` | Project URL |
   | `SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

3. **Deploy**. Xong sẽ có địa chỉ dạng `https://hanapower-xxxx.vercel.app` (đổi tên ở *Settings → Domains*, hoặc gắn tên miền riêng như `app.hanamedia.vn`).
4. Quay lại Supabase: *Authentication → URL Configuration* → **Site URL** = địa chỉ Vercel → Save.

## Bước 4 — Khởi tạo và mời nhân viên

1. Mở địa chỉ Vercel → hệ thống trống nên tự chuyển sang **Khởi tạo** → nhập tên công ty, họ tên, email, mật khẩu của bạn.
2. **Cài đặt → Kênh phát hành**: thêm kênh YouTube.
3. **Nhân sự → + Tạo tài khoản nhân viên**: nhập họ tên, email, mật khẩu ban đầu, chọn vai trò (Content / Editor / Leader).
4. Gửi cho từng nhân viên: đường link + email + mật khẩu. Nhân viên đổi mật khẩu ở **Cài đặt**.

## Cài như ứng dụng trên máy nhân viên (không cần file exe)

Mở link bằng **Microsoft Edge** → menu **⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng**. Có biểu tượng trên màn hình và cửa sổ riêng. Điện thoại: mở bằng Chrome/Safari → *Thêm vào màn hình chính*.

## Cập nhật bản mới

Bản mới được đẩy lên nhánh `main` (qua Pull Request) → GitHub tự chạy migration (nếu có) → Vercel tự triển khai trong 1–2 phút. Người dùng chỉ cần tải lại trang.

## Gỡ rối

| Hiện tượng | Cách xử lý |
|---|---|
| Trang báo lỗi "Thiếu SUPABASE_PUBLIC_URL…" | Kiểm tra 3 biến ở Vercel → *Settings → Environment Variables* → **Redeploy** |
| Không vào được trang Khởi tạo, báo lỗi bảng không tồn tại | Chưa chạy bước 2.3 (workflow cập nhật cơ sở dữ liệu) |
| Workflow báo "password authentication failed" | Chuỗi `SUPABASE_DB_URL` sai mật khẩu — sửa secret rồi chạy lại |
| Sau 7 ngày không dùng, trang báo lỗi kết nối | Supabase Free đã tạm dừng dự án → vào Supabase bấm **Restore** |
