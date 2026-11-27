import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
import { RpcForm } from "@/components/rpc-form";
import { FreelancerForm } from "@/components/freelancer-forms";

export const metadata: Metadata = { title: "Cộng tác viên" };

export default async function FreelancerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  if (hasRole(ctx, "collaborator")) return <NoAccess what="Hồ sơ cộng tác viên" />;
  const supabase = await createSupabaseServerClient();
  const canManage = can(ctx, "freelancers.manage");
  const [{ data }, pay, as, prj, cu] = await Promise.all([
    supabase.from("freelancers").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("freelancer_payment_info").select("*").eq("freelancer_id", id).maybeSingle(),
    supabase.from("freelance_assignments").select("*").eq("freelancer_id", id).order("created_at", { ascending: false }),
    supabase.from("projects").select("id, code, name").is("deleted_at", null).not("stage", "in", "(cancelled,completed)").order("code"),
    canManage ? supabase.from("user_roles").select("user_id").eq("role", "collaborator") : Promise.resolve({ data: [] as Row[] }),
  ]);
  if (!data) notFound();
  const f = data as Row;
  let collabUsers: [string, string][] = [];
  if (canManage && cu.data?.length) {
    const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", cu.data.map((x) => x.user_id as string));
    collabUsers = (ps ?? []).map((p) => [p.id as string, p.full_name as string]);
  }
  const rows = (as.data ?? []) as Row[];
  const paid = rows.filter((r) => r.payment === "paid").reduce((s, r) => s + Number(r.fee), 0);
  const owed = rows.filter((r) => r.status === "approved" && r.payment === "unpaid").reduce((s, r) => s + Number(r.fee), 0);
  const p = pay.data as Row | null;
  const rev = [`/cong-tac-vien/${id}`, "/cong-tac-vien"];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href="/cong-tac-vien" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Cộng tác viên</Link>
      <PageHeader title={String(f.full_name)} eyebrow={(f.skills as string[]).join(" · ") || "Cộng tác viên"} description={`Đã thanh toán: ${money(paid)} · Đã nghiệm thu, chờ thanh toán: ${money(owed)}`} />
      {canManage ? <Disclosure summary="Sửa hồ sơ"><FreelancerForm f={f} collabUsers={collabUsers} revalidate={rev} /></Disclosure> : null}
      <Card>
        <CardHeader><CardTitle>Thông tin thanh toán</CardTitle></CardHeader>
        <CardContent>
          {p ? <p className="text-sm">{String(p.bank_name ?? "—")} · {String(p.account_no ?? "—")} · {String(p.account_name ?? "—")}{p.tax_code ? ` · MST ${p.tax_code}` : ""}</p> : <p className="text-sm text-muted-foreground">Chưa có thông tin thanh toán (hoặc bạn không có quyền xem).</p>}
          {canManage || can(ctx, "finance.manage") ? (
            <div className="mt-3"><Disclosure summary="Cập nhật thông tin thanh toán">
              <RpcForm rpc="save_freelancer_payment" fixed={{ p_id: id }} submitLabel="Lưu" revalidate={rev} columns={3}
                fields={[{ name: "p_bank", label: "Ngân hàng", defaultValue: (p?.bank_name as string) ?? "" }, { name: "p_account_no", label: "Số tài khoản", defaultValue: (p?.account_no as string) ?? "" }, { name: "p_account_name", label: "Chủ tài khoản", defaultValue: (p?.account_name as string) ?? "" },
                  { name: "p_tax_code", label: "Mã số thuế", defaultValue: (p?.tax_code as string) ?? "" }, { name: "p_id_number", label: "CCCD", defaultValue: (p?.id_number as string) ?? "" }]} />
            </Disclosure></div>
          ) : null}
        </CardContent>
      </Card>
      {f.is_active && (canManage || can(ctx, "projects.create")) ? (
        <Disclosure summary="Giao việc mới">
          <RpcForm rpc="assign_freelancer" fixed={{ p_freelancer: id }} submitLabel="Giao việc" revalidate={rev} resetOnSuccess columns={3}
            fields={[
              { name: "p_title", label: "Tên đầu việc", required: true }, { name: "p_fee", label: "Thù lao (₫)", type: "number", required: true }, { name: "p_due", label: "Hạn bàn giao", type: "date" },
              { name: "p_project", label: "Dự án", type: "select", as: "uuid", options: (prj.data ?? []).map((x) => [x.id as string, `${x.code} – ${x.name}`] as [string, string]) },
              { name: "p_description", label: "Yêu cầu chi tiết", type: "textarea" },
            ]} />
        </Disclosure>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Lịch sử đầu việc ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/cong-tac-vien/viec/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa được giao việc.</p>}
            cols={[{ label: "Đầu việc", cell: (r) => <div><p className="font-medium">{String(r.title)}</p><p className="text-xs text-muted-foreground">{String(r.context ?? "")}</p></div> }, { label: "Hạn", cell: (r) => formatDate(r.due_date as string), className: "hidden sm:table-cell" },
              { label: "Thù lao", cell: (r) => money(r.fee as number), className: "text-right" }, { label: "Trạng thái", cell: (r) => badge(ASSIGNMENT, r.status) }, { label: "Thanh toán", cell: (r) => (r.status === "approved" ? badge(PAYMENT, r.payment) : "—") }]} />
        </CardContent>
      </Card>
    </div>
  );
}
