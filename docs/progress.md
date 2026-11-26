# Tiến độ theo giai đoạn

Quy ước: **Đã chạy & kiểm thử** = mã đã triển khai và có kiểm thử tự động đạt trong môi trường hiện tại. **Một phần** = có mã nhưng chưa đủ phạm vi yêu cầu. **Chưa làm** = chưa bắt đầu.

| # | Giai đoạn | Trạng thái |
|---|---|---|
| 1 | Nền tảng: Next.js, Supabase, migration, dữ liệu mẫu, script PowerShell | **Đã chạy & kiểm thử** (script `.ps1` chưa chạy trên Windows thật — xem dưới) |
| 2 | Nhân sự và quyền: phòng ban, vai trò, thành viên dự án, RLS | **Đã chạy & kiểm thử** cho phạm vi lát cắt 1. Chưa có: giao diện tạo tài khoản/phòng ban (đang dùng `bootstrap-org.mjs` + seed) |
| 3 | Luồng nghiệp vụ đầu tiên: giao việc → báo cáo ngày → tiến độ → duyệt | **Đã chạy & kiểm thử** |
| 4 | Báo cáo tuần, thông báo, danh sách & Kanban | **Một phần**: danh sách + Kanban (chỉ xem) đã có. Báo cáo tuần, thông báo: chưa làm |
| 5 | Chat thời gian thực | **Chưa làm** (đã xác minh Realtime tự lưu trữ hoạt động — xem giai đoạn 7) |
| 6 | Hoàn thiện PWA | **Một phần**: manifest, icon, `display: standalone`. Chưa có service worker, trang ngoại tuyến |
| 7 | Kiểm thử hai máy, chạy thử một phòng ban; cấu hình cloud / tại văn phòng | **Một phần**: cấu hình tại văn phòng đã chạy và kiểm thử trong Docker (kể cả không có Internet); cloud mới có tài liệu. Chưa kiểm thử hai máy thật / VPN |

---

## Giai đoạn 1–3: Lát cắt đầu tiên (2026-11-26)

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
