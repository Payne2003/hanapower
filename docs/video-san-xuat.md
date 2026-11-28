# Trang Video — Quản lý sản xuất video

Route: `/video` (danh sách), `/video/[id]` (trang chi tiết đầy đủ, giữ nguyên), `/video/import` (nhập từ Excel, chỉ quản lý).

## Ba câu hỏi trang phải trả lời
1. **Video nào cần xử lý?** → chế độ xem nhanh có đếm + cột "Giai đoạn · việc tiếp theo".
2. **Ai phụ trách?** → cột Content và Editor (tên đầy đủ, ảnh đại diện; chưa có Editor hiện chip "Chưa phân công").
3. **Hành động tiếp theo?** → dòng "Việc tiếp theo" (`nextStep` trong `src/lib/pipeline.ts`) và các nút hành động trong panel.

## Hai sự kiện tách biệt
- **Hoàn tất hạng mục** (Content): `update_content` — 4 hạng mục Nguồn thật, Video AI, Kịch bản / VO, Sơ đồ dựng.
- **Bàn giao**: Content gửi (`submit_handover`) → Editor xác nhận (`confirm_handover`: `received` hoặc `needs_more` kèm ghi chú).
Cột Hạng mục đếm sự kiện thứ nhất; cột Bàn giao hiển thị sự kiện thứ hai. Video 4/4 vẫn có thể "Chưa gửi bàn giao" hoặc "Chờ Editor xác nhận".

## Tham số URL
`thang=YYYY-MM` (hoặc `tat-ca`), `giai_doan`, `nguoi` (`c:<uuid>` chỉ Content, `e:<uuid>` chỉ Editor, `toi`, hoặc `<uuid>` cả hai), `loc` (xem nhanh: `cho-ban-giao` | `chua-editor` | `tam-dung`), `q` (tìm tiêu đề / mã), `chon` (video đang mở panel), `tao=1` (mở form tạo video), `xem=kanban` (chế độ Kanban).
Đổi bộ lọc bỏ `chon`; mở / đóng panel không làm mất bộ lọc.

## Quyền và an toàn
Mọi ghi đều qua RPC SECURITY DEFINER kiểm tra quyền ở CSDL: chỉ Content phụ trách gửi bàn giao; chỉ Editor được giao (hoặc quản lý) xác nhận; chỉ người giao việc chọn Editor. Nút ẩn khi không hợp lệ nhưng quyền thật nằm ở backend. Migration `…000980` làm `confirm_handover('received')` lặp lại im lặng (bấm đúp, kể cả khi video đã sang bước sau hoặc tạm dừng) và chỉ ghi một sự kiện.

## File chính
- `src/app/(app)/video/page.tsx`, `actions.ts` (thêm op `send_handover`)
- `src/components/video-toolbar.tsx`, `video-board.tsx`
- `src/lib/pipeline.ts` (QUICK_VIEWS, checklistDetail, handoverInfo, nextStep, parsePersonFilter), `queries.ts`, `types.ts`
- `supabase/migrations/20261127000980_video_handover_idempotent.sql`
- Kiểm thử: `tests/unit/video-board.test.ts`, `tests/db/pipeline.test.ts`, `tests/e2e/video-board.spec.ts`

## Giới hạn
- Hệ thống chưa có trường ảnh thu nhỏ (thumbnail) của video nên không hiển thị; ảnh đại diện người dùng dùng chữ cái đầu khi chưa có ảnh.
- Không có bản mockup ảnh trong ngữ cảnh; bố cục theo mô tả yêu cầu.
- Migration 0980 chưa áp dụng lên cloud (workflow tự áp dụng khi gộp vào `main`).
