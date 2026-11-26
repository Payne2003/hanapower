import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { markNotificationsRead } from "../video/actions";
import { EmptyState } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Bell, CheckCheck } from "lucide-react";

export const metadata: Metadata = { title: "Thông báo" };

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const items = await getNotifications();
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Thông báo"
        description={unread ? `${unread} thông báo chưa đọc` : "Bạn đã đọc hết thông báo."}
        actions={unread ? <form action={markNotificationsRead}><SubmitButton size="sm" variant="outline" pendingText="…"><CheckCheck aria-hidden />Đánh dấu đã đọc tất cả</SubmitButton></form> : null}
      />
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="Chưa có thông báo" description="Bạn sẽ nhận thông báo khi được giao video, có bàn giao, yêu cầu bổ sung, chờ duyệt, yêu cầu sửa hoặc video đã đăng." />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="notifications">
          {items.map((n) => (
            <li key={n.id} className={cn("flex gap-3 rounded-xl border p-3.5 text-sm shadow-[var(--shadow-card)]", n.read_at ? "bg-card" : "border-primary/30 bg-primary-soft/60")}>
              <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", n.read_at ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")} aria-hidden>
                <Bell className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                {n.video_id ? <Link href={`/video/${n.video_id}`} className="font-medium leading-snug hover:underline">{n.message}</Link> : <span className="font-medium">{n.message}</span>}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at, ctx.timezone)}{n.read_at ? "" : " · chưa đọc"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
