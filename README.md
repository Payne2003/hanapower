# HANA MEDIA – Quản lý sản xuất video

Ứng dụng web tiếng Việt cho đội sản xuất video của HANA MEDIA (cài được trên Windows qua Microsoft Edge dưới dạng PWA). Thay cho Google Sheet "Bảng báo cáo bộ phận content": **mỗi video một dòng**, đi qua các bước

**Ý tưởng → Đang chuẩn bị (Content: Nguồn thật, Video AI, Kịch bản/VO, Sơ đồ dựng + link tài nguyên) → Chờ bàn giao → Editor xác nhận (Đã nhận đủ / Yêu cầu bổ sung) → Đang dựng → Chờ duyệt (Leader duyệt / Yêu cầu sửa) → Chờ đăng → Đã đăng**

kèm thông báo trong ứng dụng, lịch sử từng bước, trao đổi theo video, báo cáo tháng (thay các tab t11, t12…) và xuất CSV cùng cột với bảng cũ.

- **Công nghệ:** Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · thành phần kiểu shadcn/ui · Supabase (PostgreSQL, Auth, Realtime, Storage) · Vitest · Playwright.
- **Kiến trúc, sơ đồ triển khai, quan hệ dữ liệu, luồng bàn giao:** [docs/architecture.md](docs/architecture.md)
- **Tiến độ theo giai đoạn và kết quả kiểm thử:** [docs/progress.md](docs/progress.md)
- **Lộ trình phát triển tiếp theo (đối chiếu với CRM Apollo):** [docs/roadmap.md](docs/roadmap.md)
- **Triển khai:** [docs/deploy-cloud.md](docs/deploy-cloud.md) (cloud — Supabase + Vercel, từng bước bấm chuột) · [docs/deploy-onprem.md](docs/deploy-onprem.md) (máy chủ tại văn phòng)
- **Lần đầu trên hệ thống trống:** trang `/khoi-tao` tạo doanh nghiệp + quản trị viên; sau đó quản trị viên tạo tài khoản nhân viên ở **Nhân sự**.

---

## Chạy trên Windows (phát triển)

### Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 22 LTS (≥ 22.12) | `winget install OpenJS.NodeJS.LTS` |
| Docker Desktop | bản ổn định mới | Cần cho Supabase cục bộ (WSL 2) |
| Git | bất kỳ | |
| Microsoft Edge | bản hiện hành | Để cài PWA |

### Bộ cài một lần nhấp (người dùng)

**Tải bản mới nhất:** trang **Releases** của repository (tự tạo mỗi khi nhánh `main` có bản mới bởi `.github/workflows/windows-installer.yml`). Bản của các nhánh khác: tab **Actions** → lần chạy → **Artifacts**.


Chạy `HanaMedia-Setup-<phiên bản>.exe` (tạo bằng `bash scripts/build-installer.sh`, cần `makensis`). Bộ cài chép ứng dụng vào `C:\HanaMedia` rồi chạy `scripts/setup.ps1`, script này tự cài Node.js, WSL, Docker Desktop nếu thiếu (qua `winget`, xin quyền quản trị), tự chạy tiếp sau khi khởi động lại, rồi cài thư viện, Supabase cục bộ, dữ liệu mẫu, đóng gói và tạo biểu tượng **HANA MEDIA** trên màn hình. Cài đè bản mới giữ nguyên dữ liệu. Xem `HUONG-DAN-CAI-DAT.txt`.

### Cài đặt nhanh (một lệnh, nhà phát triển)

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
| CSDL (RLS, quyền, chuyển bước, bàn giao, thông báo, đồng thời) | `powershell -File scripts\test.ps1 db` | Supabase cục bộ; **xóa và nạp lại dữ liệu mẫu** |
| E2E trình duyệt | `powershell -File scripts\test.ps1 e2e` | Supabase cục bộ; lần đầu: `npx playwright install chromium` |
| Tất cả | `powershell -File scripts\test.ps1` | |

### Tài khoản mẫu

Mật khẩu chung: **`MatKhau@123`** (chỉ dữ liệu phát triển).

| Email | Tên | Vai trò | Làm được gì |
|---|---|---|---|
| `leader@hanamedia.local` | Leader Sản xuất | Leader / Quản lý sản xuất | Tạo & phân công video, duyệt/yêu cầu sửa, ghi nhận đăng kênh, tạm dừng/hủy, quản lý kênh |
| `hieu@hanamedia.local` | Hiếu | Content | Tự tạo video, cập nhật 4 hạng mục + link tài nguyên, bàn giao |
| `phong@hanamedia.local` | Phong | Content | như trên |
| `duy@hanamedia.local` | Duy | Editor | Xác nhận nhận đủ / yêu cầu bổ sung, cập nhật tiến độ dựng, nộp duyệt |
| `hoa@hanamedia.local` | Hòa | Editor | như trên |
| `tien@hanamedia.local` | Tiện | Editor | như trên |
| `admin@hanamedia.local` | Quản trị hệ thống | Quản trị hệ thống | Vai trò, khóa tài khoản, nhật ký, mọi mục |
| `ketoan@hanamedia.local` | Kế toán Lan | Kế toán | Duyệt & thanh toán chi phí, tạm ứng, xuất hóa đơn / thu tiền, duyệt bảng lương, xuất dữ liệu cho kế toán |
| `nhansu@hanamedia.local` | Nhân sự Mai | Nhân sự | Hồ sơ lương, chấm công, lập & kiểm tra bảng lương |
| `truongnhom@hanamedia.local` | Trưởng nhóm Bình | Trưởng nhóm | Tạo dự án, xem & ghi CRM |
| `ctv@hanamedia.local` | Cộng tác viên Trang | Cộng tác viên | Chỉ thấy đầu việc được giao: nhận việc, bàn giao, xem trạng thái thanh toán |
| `nguoingoai@congtykhac.local` | Người Ngoài | Doanh nghiệp khác | Kiểm tra cô lập dữ liệu |

Dữ liệu mẫu: **D0001–D0009 lấy từ tab "Báo cáo Content t11"** trong Google Sheet của bạn (link Drive được thay bằng link giả); D0010–D0012 là video mẫu minh họa các bước Chờ duyệt, Chờ đăng, Đã đăng.

---

## Thử nhanh quy trình

1. Đăng nhập `hieu@hanamedia.local` → **Video** → "+ Tạo video mới", chọn Editor → trong trang video, đặt 4 hạng mục **Hoàn thành**, dán link tài nguyên → **Lưu & bàn giao cho Editor**.
2. Đăng nhập `duy@hanamedia.local` (cửa sổ InPrivate) → **Tổng quan** hiện "Xác nhận bàn giao" → mở video → **Đã nhận đủ** (hoặc **Yêu cầu bổ sung…** kèm ghi chú → video quay về Content).
3. Editor nhập tiến độ, link bản dựng → **Nộp duyệt**.
4. Đăng nhập `leader@hanamedia.local` → **Duyệt** (hoặc **Yêu cầu sửa…**) → nhập link YouTube → **Xác nhận đã đăng**.
5. **Báo cáo** → chỉ số tháng, bảng theo Content/Editor, **Xuất Excel (CSV)**.

## Cài PWA trên Windows

Ở môi trường HTTPS (cloud hoặc tại văn phòng): mở địa chỉ ứng dụng bằng Edge → menu **⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng**. Ứng dụng mở ở cửa sổ độc lập. (Manifest + icon đã có; service worker/trang ngoại tuyến chưa làm.)

---

## Giả định (cần xác nhận)

| Giả định | Giá trị đang dùng | Thay ở đâu |
|---|---|---|
| Quy trình sau bàn giao | Đang dựng → Chờ duyệt → Chờ đăng → Đã đăng (bảng gốc chỉ có đến bàn giao) | `supabase/migrations/…_media_pipeline.sql` |
| Ai duyệt và ghi nhận đăng | Leader (vai trò `manager`) | `role_permissions` |
| Ai tạo video | Leader và Content (Content tự tạo thì mình là người phụ trách) | `create_video()` |
| Điều kiện bàn giao | Cả 4 hạng mục Hoàn thành + có link tài nguyên + đã chọn Editor | `submit_handover()` |
| Ai xem bảng video | Cả đội trong công ty (giống Google Sheet chung); chỉ người được phân công mới thao tác | RLS `videos_select` |
| Mã video | Tự cấp D0001, D0002… theo công ty | `org_counters` |
| Báo cáo tháng | Theo "Ngày báo cáo" (ngày tạo video, múi giờ `Asia/Ho_Chi_Minh`) | `monthRange()` |
| Kênh | "Kênh động vật hoang dã (mẫu)" — chưa biết tên kênh thật | Cài đặt → Kênh phát hành |
| Tên miền tại văn phòng | `hanapower.lan` | `scripts/gen-onprem-env.mjs --domain` |
| Email | Không gửi email (chạy được khi mất Internet); quản trị viên đặt lại mật khẩu | — |

## Cấu trúc thư mục

Xem [docs/architecture.md § Tổ chức mã nguồn](docs/architecture.md#4-tổ-chức-mã-nguồn).

## Bảo mật (tóm tắt)

- RLS bật trên mọi bảng ứng dụng; client chỉ `SELECT`. Thao tác nghiệp vụ đi qua hàm RPC kiểm tra vai trò + phân công (Content phụ trách, Editor tiếp nhận) + đúng bước.
- Khóa ngoại ghép `(org_id, …)` chặn gán người/kênh/video của doanh nghiệp khác ngay trong CSDL.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ ở máy chủ (`server-only`); trình duyệt chỉ nhận anon key.
- Nhật ký `audit_logs`: đổi vai trò, khóa/mở tài khoản, phân công lại, duyệt, yêu cầu sửa, đăng kênh, hủy video.
