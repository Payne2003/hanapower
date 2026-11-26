# Triển khai “Tại văn phòng” (tự lưu trữ)

Next.js + Supabase (Postgres, GoTrue, PostgREST, Realtime, Storage) chạy bằng Docker trên **một máy chủ trong LAN**. Máy trong LAN truy cập `https://hanapower.lan`; người ở xa vào qua **VPN** của doanh nghiệp rồi dùng cùng địa chỉ. Khi Internet văn phòng gián đoạn, các chức năng nội bộ vẫn chạy (xem bảng phụ thuộc trong [architecture.md](architecture.md#12-tại-văn-phòng-tự-lưu-trữ)).

> Chỉ triển khai lên máy chủ thật khi đã có cấu hình (tên miền, máy chủ, chứng chỉ) và được yêu cầu. Tài liệu này là quy trình đã được chạy thử trong môi trường kiểm thử.

## 1. Chuẩn bị máy chủ

- Windows Server 2022 / Windows 11 Pro với Docker Desktop (WSL 2), **hoặc** Linux (Ubuntu 24.04) với Docker Engine + Compose v2.
- Tối thiểu 4 vCPU, 8 GB RAM, SSD 100 GB (dữ liệu Postgres + tệp).
- IP tĩnh trong LAN, ví dụ `192.168.1.10`.
- DNS nội bộ: bản ghi `hanapower.lan → 192.168.1.10` (trên router/AD DNS). Không có DNS: thêm vào `C:\Windows\System32\drivers\etc\hosts` mỗi máy.
- Tường lửa: mở **TCP 443** cho LAN và dải VPN. Không mở 5432/8000 ra LAN (compose chỉ bind `127.0.0.1`).

## 2. Khởi tạo

```powershell
powershell -File scripts\onprem-init.ps1 -Domain hanapower.lan
```

Script thực hiện:

1. `node scripts/gen-onprem-env.mjs` → tạo `deploy/onprem/.env` với mật khẩu Postgres, `JWT_SECRET`, anon/service JWT ngẫu nhiên (giữ bí mật, không commit).
2. `docker compose up -d db auth rest realtime storage`.
3. `node scripts/migrate.mjs` (chỉ migration, **không** nạp dữ liệu mẫu, `APP_ENV=production` chặn lệnh reset).
4. Build và chạy container `app` + `gateway`.

Tạo doanh nghiệp và quản trị viên đầu tiên (đặt biến từ `deploy/onprem/.env`):

```powershell
$env:DATABASE_URL = "postgres://postgres:<POSTGRES_PASSWORD>@127.0.0.1:54322/postgres"
$env:SUPABASE_PUBLIC_URL = "http://127.0.0.1:8000"
$env:SUPABASE_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
node scripts/bootstrap-org.mjs --org "Tên doanh nghiệp" --email admin@congty.vn --name "Họ tên" --password "<mật khẩu mạnh>"
```

### Máy chủ không có Internet khi cài

- Kéo ảnh Docker trước ở máy có Internet (`docker save` / `docker load`) hoặc dùng registry nội bộ: `IMAGE_REGISTRY=registry.congty.lan/` trong `.env`.
- Ứng dụng: build sẵn trên máy build (`$env:BUILD_STANDALONE="1"; npm run build`) rồi đóng gói bằng `deploy/onprem/Dockerfile.prebuilt` (không cần `npm ci` trong Docker).

## 3. HTTPS

- Mặc định `TLS_MODE=internal`: Caddy tự tạo CA nội bộ và cấp chứng chỉ cho `hanapower.lan`. **Cài chứng chỉ gốc lên các máy Windows** để Edge tin cậy và cho phép cài PWA:
  ```powershell
  docker compose -f deploy/onprem/docker-compose.yml cp gateway:/data/caddy/pki/authorities/local/root.crt .\hanapower-root.crt
  ```
  Phân phối `hanapower-root.crt` bằng Group Policy (Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies → Trusted Root Certification Authorities) hoặc `certutil -addstore -f Root hanapower-root.crt` (quyền Administrator).
- Có chứng chỉ doanh nghiệp: đặt `cert.pem`, `key.pem` vào `deploy/onprem/certs/` và `TLS_MODE=/certs/cert.pem /certs/key.pem`.

## 4. Vận hành

| Việc | Lệnh |
|---|---|
| Trạng thái | `docker compose -f deploy/onprem/docker-compose.yml --profile app ps` |
| Nhật ký | `docker compose -f deploy/onprem/docker-compose.yml logs -f --tail 100 app auth` |
| Nâng cấp ứng dụng | build ảnh mới → `docker compose --profile app up -d app` → `node scripts/migrate.mjs` |
| Sao lưu CSDL | `docker compose -f deploy/onprem/docker-compose.yml exec db pg_dump -U postgres -Fc postgres > backup.dump` |
| Sao lưu tệp | sao chép volume `hanapower_storage-data` |

Lên lịch sao lưu hằng đêm (Task Scheduler / cron) và lưu một bản ra ngoài máy chủ.

## 5. Đã xác minh trong môi trường kiểm thử

| Hạng mục | Cách kiểm | Kết quả |
|---|---|---|
| Toàn bộ stack lên bằng compose | `docker compose up` (ảnh qua `IMAGE_REGISTRY=mirror.gcr.io/`) | Đạt |
| Ứng dụng trong container sau gateway HTTPS (`tls internal`) | E2E Playwright 4/4 tại `https://localhost:8443` | Đạt |
| Không cần Internet: đăng nhập, RLS/RPC, lưu/tải tệp, Realtime | `docker-compose.offline-test.yml` (mạng `internal: true`) + `tests/onprem/offline-check.mjs` | 5/5 đạt |

`docker-compose.sandbox.yml` chỉ dành cho môi trường kiểm thử không hỗ trợ IPv6 (vá cổng nghe IPv4 của Realtime); máy chủ thông thường không dùng.

Chạy lại kiểm tra ngoại tuyến:

```powershell
cd deploy\onprem
docker compose -f docker-compose.yml -f docker-compose.offline-test.yml up -d db auth rest realtime storage gateway
docker compose -f docker-compose.yml -f docker-compose.offline-test.yml --profile check run --rm offline-check
docker compose -f docker-compose.yml -f docker-compose.offline-test.yml down
```

## Chưa xác minh (cần môi trường thật)

- Truy cập qua VPN thật của doanh nghiệp và DNS nội bộ.
- Cài PWA trên Edge với chứng chỉ gốc nội bộ được phân phối bằng GPO.
- Hiệu năng với số người dùng thực tế; sao lưu/khôi phục định kỳ.
