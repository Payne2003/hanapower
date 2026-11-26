# Hana Power – Quản trị công việc nội bộ

Ứng dụng web tiếng Việt (cài được trên Windows qua Microsoft Edge dưới dạng PWA) để **giao việc, cập nhật tiến độ, gửi báo cáo ngày/tuần, tổng hợp tiến độ dự án và chat nội bộ**. Nhân viên tại văn phòng và ở xa dùng chung một hệ thống.

- **Công nghệ:** Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · thành phần kiểu shadcn/ui · Supabase (PostgreSQL, Auth, Realtime, Storage) · Vitest · Playwright.
- **Kiến trúc, sơ đồ triển khai, quan hệ dữ liệu, luồng gửi báo cáo:** [docs/architecture.md](docs/architecture.md)
- **Tiến độ theo giai đoạn và kết quả kiểm thử:** [docs/progress.md](docs/progress.md)
- **Triển khai:** [docs/deploy-onprem.md](docs/deploy-onprem.md) (tại văn phòng) · [docs/deploy-cloud.md](docs/deploy-cloud.md) (cloud)

> Trạng thái hiện tại: **Giai đoạn 1–3 (lát cắt đầu tiên) đã chạy và kiểm thử.** Báo cáo tuần, thông báo, chat, tệp đính kèm và PWA đầy đủ là các giai đoạn tiếp theo — xem [docs/progress.md](docs/progress.md).

---

## Chạy trên Windows (phát triển)

### Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 22 LTS (≥ 22.12) | `winget install OpenJS.NodeJS.LTS` |
| Docker Desktop | bản ổn định mới | Cần cho Supabase cục bộ (WSL 2) |
| Git | bất kỳ | |
| Microsoft Edge | bản hiện hành | Để cài PWA |

### Cài đặt nhanh (một lệnh)

Mở **PowerShell** tại thư mục repository:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Script sẽ: `npm ci` → `npx supabase start` (Postgres, Auth, REST, Realtime, Storage, Studio) → tạo `.env.local` từ `supabase status` → chạy migration + nạp dữ liệu mẫu.

### Từng bước (nếu muốn tự làm)

```powershell
npm ci
```

```powershell
npx supabase@2.122.1 start
```

```powershell
npx supabase@2.122.1 status -o env
```

Sao chép `.env.example` thành `.env.local`, điền `SUPABASE_PUBLIC_URL` (= `API_URL`), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (= `DB_URL`) từ lệnh trên:

```powershell
Copy-Item .env.example .env.local
```

Chạy migration và dữ liệu mẫu:

```powershell
powershell -File scripts\db.ps1 reset
```

(Hoặc dùng Supabase CLI: `npx supabase@2.122.1 db reset` — cùng thư mục `supabase/migrations` và `supabase/seed.sql`.)

Chạy ứng dụng:

```powershell
npm run dev
```

Mở <http://localhost:3000>.

### Lệnh CSDL

| Việc | PowerShell |
|---|---|
| Áp dụng migration mới | `powershell -File scripts\db.ps1 migrate` |
| Xem trạng thái migration | `powershell -File scripts\db.ps1 status` |
| Nạp lại dữ liệu mẫu | `powershell -File scripts\db.ps1 seed` |
| **Xóa** dữ liệu ứng dụng + migration + seed (chỉ phát triển) | `powershell -File scripts\db.ps1 reset` |

### Kiểm thử

| Bộ | Lệnh | Cần |
|---|---|---|
| Kiểu + đơn vị | `powershell -File scripts\test.ps1 unit` | — |
| CSDL (RLS, quyền, RPC, idempotent, đồng thời) | `powershell -File scripts\test.ps1 db` | Supabase cục bộ; **xóa và nạp lại dữ liệu mẫu** |
| E2E trình duyệt | `powershell -File scripts\test.ps1 e2e` | Supabase cục bộ; lần đầu: `npx playwright install chromium` |
| Tất cả | `powershell -File scripts\test.ps1` | |

### Tài khoản mẫu

Mật khẩu chung: **`MatKhau@123`** (chỉ dữ liệu phát triển).

| Email | Họ tên | Vai trò | Ghi chú |
|---|---|---|---|
| `admin@hanapower.local` | Nguyễn Văn An | Quản trị hệ thống | Quản lý vai trò, khóa tài khoản |
| `truongphong@hanapower.local` | Trần Thị Bình | Quản lý phòng ban (Kỹ thuật) | Xem báo cáo nhân sự phòng mình |
| `quanlyduan@hanapower.local` | Lê Minh Châu | Quản lý dự án | DA “Điện mặt trời áp mái…”, “Chuẩn bị hồ sơ thầu 2027” (chưa có việc) |
| `quanlyduan2@hanapower.local` | Võ Thanh Hải | Quản lý dự án + phòng ban (Kinh doanh) | DA “Nâng cấp hệ thống giám sát SCADA” |
| `nhanvien1@hanapower.local` | Phạm Quốc Dũng | Nhân viên | Thành viên cả hai dự án |
| `nhanvien2@hanapower.local` | Hoàng Thu Hà | Nhân viên | Thành viên DA điện mặt trời |
| `nhanvien3@hanapower.local` | Đỗ Khánh Linh | Nhân viên | Chỉ thành viên DA SCADA (kiểm tra đọc chéo dự án) |
| `nguoingoai@congtykhac.local` | Người Ngoài | Quản trị ở **doanh nghiệp khác** | Kiểm tra cô lập đa doanh nghiệp |

Dữ liệu mẫu có đủ trạng thái: Hoàn tất, Đang làm, Cần làm, Đã hủy, có vướng mắc, quá hạn, dự án chưa có việc (“Chưa có dữ liệu tiến độ”).

---

## Lát cắt đầu tiên – thử nhanh

1. Đăng nhập `quanlyduan@hanapower.local` → **Dự án** → “+ Tạo dự án mới”, chọn thành viên → **Giao việc mới**.
2. Đăng nhập `nhanvien1@hanapower.local` (cửa sổ InPrivate) → **Báo cáo** → chọn công việc, nhập kết quả và tiến độ → **Gửi báo cáo**. Báo 100% → việc chuyển **Chờ duyệt**.
3. Quay lại quản lý dự án → trang dự án: tiến độ đã đổi, số việc hoàn tất chưa tăng → **Duyệt hoàn tất** (hoặc **Trả lại…** kèm lý do).

## Cài PWA trên Windows

Ở môi trường HTTPS (cloud hoặc tại văn phòng): mở địa chỉ ứng dụng bằng Edge → menu **⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng**. Ứng dụng mở ở cửa sổ độc lập. (Manifest + icon đã có; service worker/trang ngoại tuyến thuộc giai đoạn 6.)

---

## Giả định (cần xác nhận)

| Giả định | Giá trị đang dùng | Thay ở đâu |
|---|---|---|
| Tên doanh nghiệp | “Công ty Hana Power (mẫu)” (suy từ tên repository) | `supabase/seed.sql` (dev); môi trường thật: `scripts/bootstrap-org.mjs --org` |
| Múi giờ doanh nghiệp | `Asia/Ho_Chi_Minh` | cột `organizations.timezone` |
| Tên miền tại văn phòng | `hanapower.lan` (DNS nội bộ trỏ về máy chủ) | `scripts/gen-onprem-env.mjs --domain` |
| Tên miền cloud | chưa có — ví dụ `app.congty.vn` | `docs/deploy-cloud.md` |
| Chứng chỉ HTTPS tại văn phòng | CA nội bộ của Caddy (`TLS_MODE=internal`) | hoặc chứng chỉ doanh nghiệp: `TLS_MODE="/certs/cert.pem /certs/key.pem"` |
| Email | Không gửi email (chạy được khi mất Internet). Quản trị viên tạo tài khoản và đặt lại mật khẩu | Có thể bật SMTP cho bản cloud |
| VPN | Doanh nghiệp đã có VPN cho người ở xa; ứng dụng không cấu hình VPN | — |
| Tuần làm việc (báo cáo tuần) | Thứ Hai – Chủ Nhật theo múi giờ doanh nghiệp | Giai đoạn 4 |
| Trả lại công việc | Quản lý đặt lại tiến độ (mặc định 90%, 0–99) để việc về “Đang làm” | `return_task()` |

## Cấu trúc thư mục

Xem [docs/architecture.md § Tổ chức mã nguồn](docs/architecture.md#4-tổ-chức-mã-nguồn).

## Bảo mật (tóm tắt)

- RLS bật trên mọi bảng ứng dụng; client chỉ `SELECT`. Thao tác nghiệp vụ đi qua hàm RPC kiểm tra quyền + phạm vi (doanh nghiệp, phòng ban, dự án).
- Khóa ngoại ghép `(org_id, …)` chặn liên kết nhầm doanh nghiệp ngay trong CSDL.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ ở máy chủ (`server-only`); trình duyệt chỉ nhận anon key.
- Nhật ký `audit_logs`: đổi vai trò, khóa/mở tài khoản, giao lại việc, duyệt, trả lại, sửa tiến độ, hủy việc.
