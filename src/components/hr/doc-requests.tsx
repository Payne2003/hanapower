import { Download } from "lucide-react";
import type { DocRequest } from "@/lib/hr-docs";
import { badge, DOC_STATUS } from "@/lib/status-maps";
import { formatDate, formatDateTime } from "@/lib/dates";
import { RpcButton } from "@/components/rpc-button";
import { RequestUpload } from "@/components/self/request-upload";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Hist = { id: number; request_id: string; action: string; note: string | null; file_name: string | null; created_at: string; actor: { full_name: string } | null };
const ACTION: Record<string, string> = { assigned: "HR giao yêu cầu", submitted: "Nhân viên nộp tệp", approved: "HR duyệt", rejected: "HR yêu cầu nộp lại" };

const KB = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Danh sách yêu cầu tài liệu của một nhân viên. mode="self": nhân viên nộp / thay tệp; mode="hr": HR xem tệp, duyệt, yêu cầu nộp lại, xóa. */
export async function DocRequests({ items, mode, today, timezone, revalidate }: { items: DocRequest[]; mode: "self" | "hr"; today: string; timezone: string; revalidate: string[] }) {
  const supabase = await createSupabaseServerClient();
  const { data: ev } = items.length ? await supabase.from("document_request_events").select("id, request_id, actor_id, action, note, file_name, created_at").in("request_id", items.map((i) => i.id)).order("id") : { data: [] };
  const evs = (ev ?? []) as unknown as (Hist & { actor_id: string | null })[];
  const actorIds = [...new Set(evs.map((e) => e.actor_id).filter(Boolean) as string[])];
  const { data: ppl } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const who = new Map(((ppl ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const history = new Map<string, Hist[]>();
  for (const e of evs) history.set(e.request_id, [...(history.get(e.request_id) ?? []), { ...e, actor: e.actor_id && who.get(e.actor_id) ? { full_name: who.get(e.actor_id)! } : null }]);
  if (items.length === 0) return <p className="text-sm text-muted-foreground" data-testid="no-requests">{mode === "self" ? "Hiện chưa có tài liệu nào cần bạn nộp." : "Chưa giao yêu cầu tài liệu nào cho nhân viên này."}</p>;
  return (
    <ul className="flex flex-col gap-3" data-testid="doc-requests">
      {items.map((r) => {
        const late = !!r.due_date && r.due_date < today && (r.status === "pending" || r.status === "rejected");
        return (
          <li key={r.id} data-request={r.id} data-status={r.status} className="flex flex-col gap-2 rounded-lg border p-3.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium" data-testid="req-name">{r.name}</span>
              <Badge className={r.is_required ? "bg-red-50 text-red-700 ring-red-200" : "bg-neutral-100 text-neutral-700 ring-neutral-300"}>{r.is_required ? "Bắt buộc" : "Tùy chọn"}</Badge>
              <span data-testid="req-status">{badge(DOC_STATUS, r.status)}</span>
              {r.due_date ? <span className={late ? "text-xs font-medium text-red-700" : "text-xs text-muted-foreground"}>Hạn nộp {formatDate(r.due_date)}{late ? " · Quá hạn" : ""}</span> : null}
            </div>
            {r.instructions ? <p className="text-muted-foreground">{r.instructions}</p> : null}
            {r.note ? <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs"><span className="font-medium">Ghi chú của HR:</span> {r.note}</p> : null}
            {r.status === "rejected" && r.reject_reason ? <p role="alert" data-testid="reject-reason" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900"><span className="font-medium">Cần nộp lại:</span> {r.reject_reason}</p> : null}
            {r.file ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Tệp đã nộp: <span className="font-medium text-foreground">{r.file.name}</span> ({KB(r.file.size_bytes)}){r.submitted_at ? ` · ${formatDateTime(r.submitted_at, timezone)}` : ""}</span>
                <a href={`/nhan-su/tai-lieu/${r.file.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium text-foreground hover:bg-muted"><Download className="size-3" aria-hidden />Xem / tải</a>
              </p>
            ) : null}
            {r.status === "approved" && r.reviewed_at ? <p className="text-xs text-emerald-700">Đã duyệt bởi {r.reviewer ?? "HR"} · {formatDateTime(r.reviewed_at, timezone)}</p> : null}
            {(history.get(r.id) ?? []).length > 1 ? (
              <details className="text-xs" data-testid="req-history"><summary className="cursor-pointer text-muted-foreground hover:text-foreground">Lịch sử xử lý ({(history.get(r.id) ?? []).length})</summary>
                <ol className="mt-1.5 flex flex-col gap-1">{(history.get(r.id) ?? []).map((h) => <li key={h.id}><span className="text-muted-foreground">{formatDateTime(h.created_at, timezone)}</span> · <strong>{h.actor?.full_name ?? "Hệ thống"}</strong> {ACTION[h.action] ?? h.action}{h.file_name ? ` (${h.file_name})` : ""}{h.note ? ` — “${h.note}”` : ""}</li>)}</ol></details>
            ) : null}
            {mode === "self" && r.status !== "approved" ? <RequestUpload requestId={r.id} exts={r.exts} maxMb={r.max_mb} replace={!!r.file} /> : null}
            {mode === "hr" ? (
              <div className="flex flex-wrap gap-1.5">
                {r.status === "submitted" ? <>
                  <RpcButton rpc="review_document_request" args={{ p_request: r.id, p_decision: "approve" }} label="Duyệt" variant="soft" revalidate={revalidate} />
                  <RpcButton rpc="review_document_request" args={{ p_request: r.id, p_decision: "reject" }} prompt={{ text: "Lý do yêu cầu nộp lại (bắt buộc)", arg: "p_reason", required: true }} label="Yêu cầu nộp lại…" variant="outline" revalidate={revalidate} />
                </> : null}
                <RpcButton rpc="delete_document_request" args={{ p_request: r.id }} label="Xóa yêu cầu" variant="ghost" confirm={`Xóa yêu cầu "${r.name}" và tệp đã nộp?`} revalidate={revalidate} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

