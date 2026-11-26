"use client";
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Khối mở/đóng giữ trạng thái phía trình duyệt (không tự đóng khi máy chủ làm mới dữ liệu). */
export function Disclosure({ summary, defaultOpen = false, children, icon }: { summary: string; defaultOpen?: boolean; children: React.ReactNode; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="group rounded-xl border bg-card shadow-[var(--shadow-card)]" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3.5 font-medium text-primary hover:bg-primary-soft/40 [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 place-items-center rounded-lg bg-primary-soft">{icon ?? <Plus className="size-4" aria-hidden />}</span>
        <span className="flex-1">{summary}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </summary>
      <div className="border-t px-4 pt-4 pb-5">{children}</div>
    </details>
  );
}
