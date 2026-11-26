import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { markNotificationsRead } from "../video/actions";
import { EmptyState } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Thông báo" };

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const items = await getNotifications();
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Thông báo {unread ? `(${unread} chưa đọc)` : ""}</h1>
        {unread ? (
          <form action={markNotificationsRead}><SubmitButton size="sm" variant="outline" pendingText="…">Đánh dấu đã đọc tất cả</SubmitButton></form>
        ) : null}
      </header>
      {items.length === 0 ? (
        <EmptyState title="Chưa có thông báo" description="Bạn sẽ nhận thông báo khi được giao video, có bàn giao, yêu cầu bổ sung, chờ duyệt, yêu cầu sửa hoặc video đã đăng." />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="notifications">
          {items.map((n) => (
            <li key={n.id} className={cn("rounded-md border px-3 py-2 text-sm", n.read_at ? "bg-card" : "border-primary/30 bg-primary-soft")}>
              {n.video_id ? <Link href={`/video/${n.video_id}`} className="font-medium hover:underline">{n.message}</Link> : <span className="font-medium">{n.message}</span>}
              <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at, ctx.timezone)}{n.read_at ? "" : " · chưa đọc"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
