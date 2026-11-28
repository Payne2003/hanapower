import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { ADVANCE, badge } from "@/lib/status-maps";
import { Disclosure } from "@/components/disclosure";
import { DataTable } from "@/components/data-table";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function projectOptions(supabase: SB): Promise<[string, string][]> {
  const { data } = await supabase.from("projects").select("id, code, name").is("deleted_at", null).not("stage", "in", "(cancelled,completed)").order("code");
  return (data ?? []).map((p) => [p.id as string, `${p.code} – ${p.name}`]);
}

export async function Advances({ ctxUser, canApprove, canPay, supabase }: { ctxUser: string; canApprove: boolean; canPay: boolean; supabase: SB }) {
  const [{ data }, projects, L] = await Promise.all([supabase.from("advances").select("*").order("created_at", { ascending: false }).limit(200), projectOptions(supabase), loadLookups(["people"])]);
  const rows = (data ?? []) as Row[];
  const rev = ["/thu-chi"];
  return (
    <>
      <Disclosure summary="Đề nghị tạm ứng">
        <RpcForm rpc="request_advance" submitLabel="Gửi đề nghị" revalidate={rev} resetOnSuccess columns={3}
          fields={[{ name: "p_project_id", label: "Dự án", type: "select", as: "uuid", options: projects }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true }, { name: "p_purpose", label: "Mục đích", required: true, wide: true }]} />
      </Disclosure>
      <DataTable rows={rows as (Row & { id: string })[]} empty={<EmptyState title="Chưa có tạm ứng" />}
        cols={[
          { label: "Người ứng", cell: (r) => nameOf(L, "people", r.user_id) }, { label: "Mục đích", cell: (r) => String(r.purpose) },
          { label: "Số tiền", cell: (r) => <strong>{money(r.amount as number)}</strong>, className: "text-right" },
          { label: "Đã chi / hoàn", cell: (r) => (r.status === "settled" ? `${money(r.settled_amount as number)} / ${money(r.refund_amount as number)}` : "—"), className: "hidden md:table-cell" },
          { label: "Trạng thái", cell: (r) => badge(ADVANCE, r.status) },
          { label: "Thao tác", cell: (r) => (
            <div className="flex flex-wrap gap-1.5">
              {canApprove && r.status === "requested" ? <><RpcButton rpc="decide_advance" args={{ p_id: r.id, p_decision: "approve" }} label="Duyệt" variant="soft" revalidate={rev} /><RpcButton rpc="decide_advance" args={{ p_id: r.id, p_decision: "reject" }} prompt={{ text: "Lý do từ chối:", arg: "p_note", required: true }} label="Từ chối" variant="ghost" revalidate={rev} /></> : null}
              {canPay && r.status === "approved" ? <RpcButton rpc="disburse_advance" args={{ p_id: r.id }} label="Đã giải ngân" variant="default" confirm="Xác nhận đã chuyển tiền tạm ứng?" revalidate={rev} /> : null}
              {r.status === "disbursed" && (r.user_id === ctxUser || canPay) ? <RpcButton rpc="settle_advance" args={{ p_id: r.id }} label="Quyết toán" variant="outline" confirm="Quyết toán tạm ứng dựa trên các chi phí đã duyệt gắn với khoản này?" revalidate={rev} /> : null}
            </div>
          ) },
        ]} />
    </>
  );
}

