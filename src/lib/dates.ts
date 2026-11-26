export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function formatDateTime(iso: string | null | undefined, timeZone = "Asia/Ho_Chi_Minh"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Quá hạn khi hạn < hôm nay (theo múi giờ doanh nghiệp) và việc chưa xong. */
export function isOverdue(due: string | null, today: string, status: string): boolean {
  return !!due && due < today && status !== "done" && status !== "cancelled";
}
