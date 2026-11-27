import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { ASSIGNMENT, PAYMENT, badge } from "@/lib/status-maps";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Đầu việc" };

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("freelance_assignments").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as Row;
  const { data: f } = await supabase.from("freelancers").select("id, full_name, user_id").eq("id", a.freelancer_id as string).maybeSingle();
  const mine = f?.user_id === ctx.user_id;
  const collab = ctx.roles.includes("collaborator");
  const mgr = !collab && (ctx.permissions.includes("freelancers.manage") || a.created_by === ctx.user_id || ctx.permissions.includes("projects.manage_all"));
  const st = String(a.status);
  const rev = [`/cong-tac-vien/viec/${id}`, "/cong-tac-vien", "/"];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {collab ? <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Việc của tôi</Link>
        : <Link href="/cong-tac-vien" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Cộng tác viên</Link>}
      <PageHeader title={String(a.title)} eyebrow={<span>{collab ? "Đầu việc được giao" : <>Cộng tác viên: <Link className="text-primary hover:underline" href={`/cong-tac-vien/${f?.id}`}>{String(f?.full_name ?? "—")}</Link></>}{a.context ? ` · ${a.context}` : ""}</span>} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trạng thái" value={badge(ASSIGNMENT, st)} tone="sky" />
        <StatCard label="Thù lao" value={money(a.fee as number)} tone="green" />
        <StatCard label="Hạn bàn giao" value={formatDate(a.due_date as string)} tone="amber" />
        <StatCard label="Thanh toán" value={st === "approved" ? badge(PAYMENT, a.payment) : "—"} tone="violet" hint={a.paid_on ? `Ngày ${formatDate(a.paid_on as string)}` : undefined} />
      </section>
      {a.description ? <Card><CardHeader><CardTitle>Yêu cầu</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{String(a.description)}</CardContent></Card> : null}
      {a.review_note && (st === "accepted" || st === "declined" || st === "approved" || st === "cancelled") ? <Alert tone={st === "accepted" ? "warning" : "info"}>Ghi chú: {String(a.review_note)}</Alert> : null}
      {a.delivered_url ? <p className="text-sm">Sản phẩm bàn giao: <a href={String(a.delivered_url)} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{String(a.delivered_url)}</a></p> : null}

      {(mine || mgr) && st === "assigned" ? (
        <Card><CardHeader><CardTitle>Nhận việc</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
          <RpcButton rpc="assignment_action" args={{ p_id: id, p_action: "accept" }} label="Nhận việc" variant="default" revalidate={rev} />
          <RpcButton rpc="assignment_action" args={{ p_id: id, p_action: "decline" }} prompt={{ text: "Lý do từ chối:", arg: "p_note", required: true }} label="Từ chối" variant="outline" revalidate={rev} />
        </CardContent></Card>
      ) : null}
      {(mine || mgr) && st === "accepted" ? (
        <Card><CardHeader><CardTitle>Bàn giao sản phẩm</CardTitle></CardHeader><CardContent>
          <RpcForm rpc="assignment_action" fixed={{ p_id: id, p_action: "deliver" }} submitLabel="Bàn giao" revalidate={rev} columns={1}
            fields={[{ name: "p_url", label: "Link sản phẩm (Drive, WeTransfer…)", type: "url", required: true, placeholder: "https://…" }, { name: "p_note", label: "Ghi chú", type: "textarea" }]} />
        </CardContent></Card>
      ) : null}
      {mgr && st === "delivered" ? (
        <Card><CardHeader><CardTitle>Nghiệm thu</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
          <RpcButton rpc="assignment_action" args={{ p_id: id, p_action: "approve" }} label="Nghiệm thu & đề nghị chi thù lao" variant="default" confirm="Nghiệm thu? Hệ thống sẽ tạo đề nghị chi thù lao để kế toán duyệt." revalidate={rev} />
          <RpcButton rpc="assignment_action" args={{ p_id: id, p_action: "revise" }} prompt={{ text: "Yêu cầu chỉnh sửa:", arg: "p_note", required: true }} label="Yêu cầu sửa" variant="outline" revalidate={rev} />
        </CardContent></Card>
      ) : null}
      {mgr && !["approved", "cancelled", "declined"].includes(st) ? <div><RpcButton rpc="assignment_action" args={{ p_id: id, p_action: "cancel" }} label="Hủy đầu việc" variant="ghost" confirm="Hủy đầu việc này?" revalidate={rev} /></div> : null}
    </div>
  );
}
