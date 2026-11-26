"use client";
import { useState } from "react";

/** Khối mở/đóng giữ trạng thái phía trình duyệt (không tự đóng khi máy chủ làm mới dữ liệu). */
export function Disclosure({ summary, defaultOpen = false, children }: { summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="rounded-lg border bg-card p-4" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-primary">{summary}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
