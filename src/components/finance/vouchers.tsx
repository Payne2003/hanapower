import Link from "next/link";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { financeParams, getExpenses, getIncomes, type FinanceLookups, type FinanceQuery } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/alert";
import { RpcButton } from "@/components/rpc-button";
import { FilterBar } from "@/components/finance/filter-bar";
import { FileUpload } from "@/components/finance/file-upload";
import { uploadFinanceFileAction } from "@/app/(app)/thu-chi/actions";
import { cn } from "@/lib/utils";

type F = { id: string; kind: string; ref_id: string; name: string; size_bytes: number };

/** Chứng từ: nhiều tệp cho một giao dịch; số tiền vẫn tính một lần. Mặc định lọc "Thiếu chứng từ". */
export async function VouchersTab({ q, kind, L, today, canManage, userId }: { q: FinanceQuery; kind: "income" | "expense" | "all"; L: FinanceLookups; today: string; canManage: boolean; userId: string }) {
  const [inc, exp] = await Promise.all([kind === "expense" ? null : getIncomes({ ...q, size: 50, page: 1 }), kind === "income" ? null : getExpenses({ ...q, size: 50, page: 1 })]);
  const ids = [...(inc?.rows ?? []).map((r) => r.id), ...(exp?.rows ?? []).map((r) => r.id)];
  const supabase = await createSupabaseServerClient();
  const files = new Map<string, F[]>();
  if (ids.length) {
    const { data } = await supabase.from("finance_files").select("id, kind, ref_id, name, size_bytes").in("ref_id", ids).order("created_at");
    for (const f of (data ?? []) as F[]) files.set(f.ref_id, [...(files.get(f.ref_id) ?? []), f]);
  }
  const link = (over: Record<string, string>) => `/thu-chi${financeParams(q, { tab: "chung-tu", ...over })}`;
  const Row = ({ id, k, date, title, sub, amount, missing }: { id: string; k: "income" | "expense"; date: string; title: string; sub: string; amount: string; missing: boolean }) => (
    <li id={`row-${id}`} className="flex flex-col gap-2 px-4 py-3 text-sm" data-testid="voucher-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><p className="font-medium"><Badge className={cn(k === "income" ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-amber-50 text-amber-800 ring-amber-300", "mr-2")}>{k === "income" ? "Thu" : "Chi"}</Badge>{title}</p><p className="text-xs text-muted-foreground">{formatDate(date)} · {sub}</p></div>
        <div className="flex items-center gap-3"><strong className="tabular-nums">{money(amount)}</strong>{missing ? <Badge className="bg-amber-50 text-amber-800 ring-amber-300">Thiếu chứng từ</Badge> : null}</div>
      </div>
      {(files.get(id) ?? []).length ? (
        <ul className="flex flex-wrap gap-2 text-xs">{(files.get(id) ?? []).map((f) => (
          <li key={f.id} className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1"><a className="font-medium text-primary hover:underline" href={`/thu-chi/chung-tu/${f.id}?xem=1`} target="_blank" rel="noreferrer">{f.name}</a><a className="text-muted-foreground hover:underline" href={`/thu-chi/chung-tu/${f.id}`}>tải</a>
            {canManage ? <RpcButton rpc="delete_finance_file" args={{ p_id: f.id }} label="Xóa" variant="ghost" confirm="Xóa chứng từ này?" revalidate={["/thu-chi"]} /> : null}</li>))}</ul>
      ) : null}
      {canManage || k === "expense" ? <details className="text-xs"><summary className="cursor-pointer text-primary">Đính kèm chứng từ</summary><div className="mt-2 max-w-xl"><FileUpload id={`v-${id}`} action={uploadFinanceFileAction} hidden={{ kind: k, ref: id }} label="Chọn một hoặc nhiều tệp" /></div></details> : null}
    </li>
  );
  const missingTotal = (inc?.missing_voucher ?? 0) + (exp?.missing_voucher ?? 0);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Khoản thu thiếu chứng từ" value={inc?.missing_voucher ?? "—"} tone="orange" /><StatCard label="Khoản chi thiếu chứng từ" value={exp?.missing_voucher ?? "—"} tone="orange" />
        <StatCard label="Thiếu chứng từ (tổng)" value={missingTotal} tone={missingTotal ? "amber" : "green"} hint="Tính theo bộ lọc hiện tại" />
      </section>
      <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Loại giao dịch">
        {([["all", "Thu và chi"], ["income", "Chỉ khoản thu"], ["expense", "Chỉ khoản chi"]] as const).map(([k, l]) => <Link key={k} href={link({ "loai-ct": k })} aria-current={kind === k ? "true" : undefined} className={cn("rounded-full border px-3 py-1 font-medium", kind === k ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>{l}</Link>)}
      </nav>
      <FilterBar tab="chung-tu" q={q} today={today} L={L} keys={["da", "pb", "ct"]} extraHidden={{ "loai-ct": kind }} />
      {(inc?.rows.length ?? 0) + (exp?.rows.length ?? 0) === 0 ? <EmptyState title="Không có giao dịch khớp bộ lọc" description={q.voucher === "missing" ? "Mọi giao dịch trong khoảng này đã có chứng từ." : "Thử đổi bộ lọc."} /> : (
        <ul className="divide-y rounded-xl border bg-card shadow-[var(--shadow-card)]" data-testid="voucher-list">
          {(inc?.rows ?? []).map((r) => <Row key={r.id} id={r.id} k="income" date={r.occurred_on} title={r.description ?? "Khoản thu"} sub={`${r.project_code ? `${r.project_code} · ` : ""}${r.customer_name ?? "Không gắn khách"}${r.status === "cancelled" ? " · đã hủy" : ""}`} amount={r.amount} missing={r.file_count === 0 && r.status === "confirmed"} />)}
          {(exp?.rows ?? []).map((r) => <Row key={r.id} id={r.id} k="expense" date={r.occurred_on} title={r.description ?? r.payee_name ?? "Khoản chi"} sub={`${r.project_code ? `${r.project_code} · ` : "Chi chung · "}${r.category_name ?? "Chưa phân loại"}${r.owner_id === userId ? " · của bạn" : ""}`} amount={r.amount} missing={!r.has_voucher && r.approval === "approved"} />)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Hiển thị tối đa 50 giao dịch mỗi loại — thu hẹp khoảng thời gian để xem hết.</p>
    </>
  );
}
