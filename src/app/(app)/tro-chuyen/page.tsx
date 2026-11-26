import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Trò chuyện" };

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Trò chuyện</h1>
      <EmptyState
        title="Chat thời gian thực sẽ có ở giai đoạn 5"
        description="Chat 1–1, nhóm riêng và kênh dự án; tin nhắn lưu vào CSDL trước khi báo thành công, Realtime chỉ báo có cập nhật."
      />
    </div>
  );
}
