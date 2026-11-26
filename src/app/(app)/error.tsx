"use client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <Alert tone="error">
        Không tải được dữ liệu. {/fetch failed|network/i.test(error.message) ? "Mất kết nối tới máy chủ." : "Vui lòng thử lại."}
      </Alert>
      <div><Button onClick={reset}>Thử lại</Button></div>
    </div>
  );
}
