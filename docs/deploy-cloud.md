# Triển khai Cloud

Máy trong văn phòng và máy ở xa truy cập **cùng một địa chỉ HTTPS** (ví dụ `https://app.congty.vn`).

> Chưa triển khai: cần tài khoản/cấu hình cloud và yêu cầu triển khai. Dưới đây là quy trình đã chuẩn bị.

## Thành phần

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| CSDL, Auth, Realtime, Storage | Supabase (managed), vùng Singapore (`ap-southeast-1`) | Gần Việt Nam |
| Ứng dụng Next.js | Vercel, hoặc ảnh Docker (`Dockerfile`) trên VPS/Cloud Run/App Service | HTTPS do nền tảng cấp |

## Các bước

1. Tạo dự án Supabase. Ghi lại `Project URL`, `anon key`, `service_role key`, chuỗi kết nối Postgres (session pooler).
2. Áp dụng migration:
   ```powershell
   $env:DATABASE_URL = "postgres://postgres.<ref>:<mật khẩu>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
   $env:APP_ENV = "production"
   node scripts/migrate.mjs
   ```
   (Hoặc `npx supabase@2.122.1 link --project-ref <ref>` rồi `npx supabase@2.122.1 db push`.)
3. Supabase Dashboard → Authentication: **tắt Sign-ups**; Site URL = `https://app.congty.vn`; (tùy chọn) cấu hình SMTP để gửi email đặt lại mật khẩu.
4. Biến môi trường cho ứng dụng (runtime, không cần build lại khi đổi):
   ```
   SUPABASE_PUBLIC_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # chỉ ở máy chủ
   APP_ENV=production
   ```
5. Tạo doanh nghiệp + quản trị viên đầu tiên: `node scripts/bootstrap-org.mjs --org ... --email ... --name ... --password ...`.
6. Trỏ tên miền về nền tảng chạy ứng dụng; HTTPS bắt buộc (PWA chỉ cài được qua HTTPS).

## Kiểm tra sau triển khai

- Đăng nhập, tạo dự án, giao việc, gửi báo cáo, duyệt (kịch bản E2E): `E2E_BASE_URL=https://app.congty.vn npx playwright test` — **chỉ chạy trên môi trường thử nghiệm**, vì kịch bản tạo dữ liệu và cần tài khoản mẫu.
