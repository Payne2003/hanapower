import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireContext, can, hasRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { ASSIGNMENT, PAYMENT, badge } from "@/lib/status-maps";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { DataTable, NoAccess } from "@/components/data-table";
import { FreelancerForm } from "@/components/freelancer-forms";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Cộng tác viên" };

export default async function FreelancersPage() {
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Danh sách cộng tác viên" />;
  const supabase = await createSupabaseServerClient();
  const canManage = can(ctx, "freelancers.manage");
  const [fl, as, cu] = await Promise.all([
    supabase.from("freelancers").select("*").is("deleted_at", null).order("full_name"),
    supabase.from("freelance_assignments").select("*").in("status", ["assigned", "accepted", "delivered"]).order("due_date", { ascending: true, nullsFirst: false }).limit(100),
    canManage ? supabase.from("user_roles").select("user_id").eq("role", "collaborator") : Promise.resolve({ data: [] as Row[] }),
  ]);
  const rows = (fl.data ?? []) as Row[];
  const names = new Map(rows.map((f) => [f.id as string, f.full_name as string]));
  let collabUsers: [string, string][] = [];
  if (canManage && cu.data?.length) {
    const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", cu.data.map((x) => x.user_id as string));
    collabUsers = (ps ?? []).map((p) => [p.id as string, p.full_name as string]);
  }
  const open = (as.data ?? []) as Row[];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Cộng tác viên" eyebrow={`${rows.length} hồ sơ`} description="Hồ sơ freelancer, giao đầu việc theo hạn bàn giao, nghiệm thu và theo dõi thanh toán thù lao." />
      {canManage ? <Disclosure summary="Thêm cộng tác viên" icon={<Plus className="size-4" aria-hidden />}><FreelancerForm collabUsers={collabUsers} revalidate={["/cong-tac-vien"]} /></Disclosure> : null}
      <Card>
        <CardHeader><CardTitle>Việc đang mở ({open.length})</CardTitle></CardHeader>
        <CardContent>
          <DataTable rows={open as (Row & { id: string })[]} href={(r) => `/cong-tac-vien/viec/${r.id}`} empty={<p className="text-sm text-muted-foreground">Không có đầu việc nào đang mở.</p>}
            cols={[{ label: "Đầu việc", cell: (r) => <div><p className="font-medium">{String(r.title)}</p><p className="text-xs text-muted-foreground">{String(r.context ?? "")}</p></div> }, { label: "Cộng tác viên", cell: (r) => names.get(String(r.freelancer_id)) ?? "—" },
              { label: "Hạn", cell: (r) => formatDate(r.due_date as string) }, { label: "Thù lao", cell: (r) => money(r.fee as number), className: "text-right hidden sm:table-cell" }, { label: "Trạng thái", cell: (r) => badge(ASSIGNMENT, r.status) }]} />
        </CardContent>
      </Card>
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/cong-tac-vien/${r.id}`} testId="list-freelancers" empty={<p className="text-sm text-muted-foreground">Chưa có cộng tác viên.</p>}
        cols={[
          { label: "Họ tên", cell: (r) => <span className="font-medium">{String(r.full_name)}</span> }, { label: "Kỹ năng", cell: (r) => (r.skills as string[]).join(", ") || "—", className: "hidden md:table-cell" },
          { label: "Liên hệ", cell: (r) => (r.phones as string[])[0] ?? (r.emails as string[])[0] ?? "—", className: "hidden sm:table-cell" },
          { label: "Đăng nhập", cell: (r) => (r.user_id ? "Có tài khoản" : "Không"), className: "hidden lg:table-cell" },
          { label: "Trạng thái", cell: (r) => (r.is_active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đang hợp tác</Badge> : <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-300">Ngừng</Badge>) },
        ]} />
      <span className="hidden">{String(PAYMENT.paid)}</span>
    </div>
  );
}
