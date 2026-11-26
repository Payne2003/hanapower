import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { MessagesSquare } from "lucide-react";

export const metadata: Metadata = { title: "Trò chuyện" };

export default function ChatPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Trò chuyện" description="Trao đổi theo từng video đã có trong trang chi tiết video." />
      <EmptyState icon={<MessagesSquare />}
        title="Chat thời gian thực đang được phát triển"
        description="Chat 1–1, nhóm riêng và kênh dự án; tin nhắn lưu vào CSDL trước khi báo thành công, Realtime chỉ báo có cập nhật."
      />
    </div>
  );
}
