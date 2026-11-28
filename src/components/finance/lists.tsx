import Link from "next/link";
import { Plus } from "lucide-react";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { APPROVAL, PAYMENT, badge } from "@/lib/status-maps";
import { financeParams, getExpenses, getIncomes, type ExpenseRow, type FinanceLookups, type FinanceQuery, type IncomeRow } from "@/lib/finance";
import { METHODS } from "@/lib/finance-ui";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/page-header";
import { Disclosure } from "@/components/disclosure";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { EmptyState } from "@/components/ui/alert";
import { Pager, SortTh, TABLE, THEAD } from "@/components/hr/ui";
import { FilterBar } from "@/components/finance/filter-bar";
import { FileUpload } from "@/components/finance/file-upload";
import { uploadFinanceFileAction } from "@/app/(app)/thu-chi/actions";

type Common = { q: FinanceQuery; L: FinanceLookups; today: string; userId: string; canManage: boolean };

function VoucherCell({ kind, id, count, canAttach }: { kind: "income" | "expense"; id: string; count: number; canAttach: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {count ? <Link href={`/thu-chi?tab=chung-tu&ct=has&loai-ct=${kind}#row-${id}`} className="text-xs font-medium text-primary hover:underline">{count} chứng từ</Link> : <Badge className="bg-amber-50 text-amber-800 ring-amber-300">Thiếu chứng từ</Badge>}
      {canAttach ? (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground hover:text-foreground">Đính kèm</summary>
          <div className="mt-2 w-72"><FileUpload id={`up-${id}`} action={uploadFinanceFileAction} hidden={{ kind, ref: id }} label="Chứng từ" /></div>
        </details>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Khoản thu
export async function IncomesTab({ q, L, today, userId, canManage }: Common) {
  const list = await getIncomes(q);
  const base = (over: Partial<FinanceQuery>) => `/thu-chi${financeParams({ ...q, ...over }, { tab: "thu" })}`;
  const sortHref = (col: string, dir: "asc" | "desc") => base({ sort: col, dir, page: 1 });
  const exportHref = `/thu-chi/xuat${financeParams(q, { type: "incomes" })}`;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tổng thu trong bộ lọc" value={money(list.sum)} tone="green" hint={`${list.total} khoản · tính trên toàn bộ kết quả lọc`} testId="sum-income" />
        <StatCard label="Thu theo mốc" value={money(list.sum_milestone)} tone="sky" />
        <StatCard label="Thu khác" value={money(list.sum_other)} tone="violet" />
        <StatCard label="Thiếu chứng từ" value={list.missing_voucher} tone={list.missing_voucher ? "orange" : "slate"} href={base({ voucher: "missing", page: 1 })} />
      </section>
      <FilterBar tab="thu" q={q} today={today} L={L} keys={["nguon", "kh", "da", "pb", "pt", "ht", "ct", "loai", "tt"]} exportHref={exportHref} />
      {canManage ? (
        <Disclosure summary="Ghi nhận thu khác (AdSense, tài trợ…) — thu theo mốc ghi nhận ở “Phải thu theo mốc” hoặc hồ sơ dự án" icon={<Plus className="size-4" aria-hidden />}>
          <RpcForm rpc="record_income" submitLabel="Ghi nhận" revalidate={["/thu-chi", "/du-an"]} resetOnSuccess columns={3}
            fields={[
              { name: "p_occurred_on", label: "Ngày thực thu", type: "date", required: true, defaultValue: today }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true },
              { name: "p_source_id", label: "Nguồn thu", type: "select", as: "uuid", options: L.sources },
              { name: "p_project_id", label: "Dự án (nếu có)", type: "select", as: "uuid", options: L.projects, hint: "Thu gắn dự án nên đi theo mốc thanh toán" },
              { name: "p_department_id", label: "Phòng ban", type: "select", as: "uuid", options: L.departments }, { name: "p_owner_id", label: "Người phụ trách", type: "select", as: "uuid", options: L.people, defaultValue: userId },
              { name: "p_invoice_no", label: "Số hóa đơn" }, { name: "p_method", label: "Hình thức", type: "select", options: METHODS.map((m) => [m, m] as [string, string]) },
              { name: "p_description", label: "Nội dung", wide: true },
            ]} />
        </Disclosure>
      ) : null}
      {list.rows.length === 0 ? <EmptyState title="Không có khoản thu khớp bộ lọc" description="Thử mở rộng khoảng thời gian hoặc bỏ bớt bộ lọc." /> : (
        <>
          <div className={TABLE}>
            <table className="w-full min-w-[960px] text-sm" data-testid="list-incomes">
              <thead className={THEAD}><tr>
                <SortTh label="Ngày thực thu" col="date" sort={q.sort} dir={q.dir} href={sortHref} /><th className="px-3.5 py-2.5">Loại</th><th className="px-3.5 py-2.5">Nội dung</th><th className="px-3.5 py-2.5">Khách hàng · Nguồn</th>
                <th className="px-3.5 py-2.5">Phòng ban · Phụ trách</th><SortTh label="Số tiền" col="amount" sort={q.sort} dir={q.dir} href={sortHref} className="text-right" /><th className="px-3.5 py-2.5">Chứng từ</th><th className="px-3.5 py-2.5" />
              </tr></thead>
              <tbody className="divide-y">{list.rows.map((r: IncomeRow) => (
                <tr key={r.id} id={`row-${r.id}`} className={r.status === "cancelled" ? "bg-muted/30 text-muted-foreground" : undefined}>
                  <td className="px-3.5 py-2.5 align-top whitespace-nowrap">{formatDate(r.occurred_on)}</td>
                  <td className="px-3.5 py-2.5 align-top">{r.status === "cancelled" ? <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-300">Đã hủy</Badge> : r.is_milestone ? <Badge className="bg-sky-50 text-sky-800 ring-sky-300">Thu theo mốc</Badge> : <Badge className="bg-violet-50 text-violet-800 ring-violet-300">Thu khác</Badge>}</td>
                  <td className="px-3.5 py-2.5 align-top">
                    <p className={cn("font-medium", r.status === "cancelled" && "line-through")}>{r.description ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.project_id ? <Link className="text-primary hover:underline" href={`/du-an/${r.project_id}?tab=thanh-toan`}>{r.project_code} · {r.project_name}</Link> : "Không gắn dự án"}
                      {r.milestone_name ? <> · mốc <Link className="text-primary hover:underline" href={`/du-an/${r.project_id}?tab=thanh-toan`}>{r.milestone_name}</Link></> : null}
                      {r.invoice_no ? ` · HĐ ${r.invoice_no}` : ""}{r.payment_method ? ` · ${r.payment_method}` : ""}
                    </p>
                    {r.cancel_reason ? <p className="text-xs text-destructive">Lý do hủy: {r.cancel_reason}</p> : null}
                  </td>
                  <td className="px-3.5 py-2.5 align-top text-xs">{r.customer_name ?? "—"}<br /><span className="text-muted-foreground">{r.source_name ?? "—"}</span></td>
                  <td className="px-3.5 py-2.5 align-top text-xs">{r.department_name ?? <span className="text-muted-foreground">Chưa gán phòng ban</span>}<br /><span className="text-muted-foreground">{r.owner_name ?? "—"}</span>
                    {canManage && r.status === "confirmed" ? (
                      <details className="mt-1"><summary className="cursor-pointer text-primary">Gán</summary>
                        <div className="mt-2 w-64"><RpcForm rpc="set_transaction_scope" fixed={{ p_kind: "income", p_id: r.id }} submitLabel="Lưu" revalidate={["/thu-chi"]} columns={1} variant="outline"
                          fields={[{ name: "p_department", label: "Phòng ban", type: "select", as: "uuid", options: L.departments, defaultValue: r.department_id ?? "" }, { name: "p_owner", label: "Người phụ trách", type: "select", as: "uuid", options: L.people, defaultValue: r.owner_id ?? "" }]} /></div>
                      </details>) : null}
                  </td>
                  <td className="px-3.5 py-2.5 align-top text-right tabular-nums"><strong className={r.status === "cancelled" ? "line-through" : ""}>{money(r.amount)}</strong></td>
                  <td className="px-3.5 py-2.5 align-top"><VoucherCell kind="income" id={r.id} count={r.file_count} canAttach={canManage && r.status === "confirmed"} /></td>
                  <td className="px-3.5 py-2.5 align-top">{canManage && r.status === "confirmed" ? <RpcButton rpc="cancel_income" args={{ p_id: r.id }} prompt={{ text: "Lý do hủy khoản thu (điều chỉnh sai sót):", arg: "p_reason", required: true }} label="Hủy" variant="ghost" confirm="Hủy khoản thu? Mốc liên kết sẽ trở lại chưa thu; việc hủy ghi nhật ký kèm lý do." revalidate={["/thu-chi", "/du-an"]} /> : null}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <Pager total={list.total} page={q.page} size={q.size} href={(p) => base({ page: p })} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Khoản chi
export async function ExpensesTab({ q, L, today, userId, canManage, canApprove, canViewAll, advances }: Common & { canApprove: boolean; canViewAll: boolean; advances: [string, string][] }) {
  const list = await getExpenses(q);
  const base = (over: Partial<FinanceQuery>) => `/thu-chi${financeParams({ ...q, ...over }, { tab: "chi" })}`;
  const sortHref = (col: string, dir: "asc" | "desc") => base({ sort: col, dir, page: 1 });
  const rev = ["/thu-chi", "/du-an"];
  const keys: ("lc" | "da" | "pb" | "pt" | "ht" | "ct" | "dv" | "chung")[] = ["lc", "da", "pb", "ht", "ct", "dv", "chung"];
  if (canViewAll) keys.splice(4, 0, "pt");
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Đã ghi nhận (đã duyệt)" value={money(list.sum)} tone="amber" hint={`${list.total} khoản trong bộ lọc`} testId="sum-expense" />
        <StatCard label="Chờ duyệt" value={money(list.sum_pending)} tone="orange" href={base({ approval: "submitted", page: 1 })} />
        <StatCard label="Thiếu chứng từ" value={list.missing_voucher} tone={list.missing_voucher ? "orange" : "slate"} href={base({ voucher: "missing", page: 1 })} />
        <StatCard label="Khoản chi chung" value="Lọc" tone="slate" hint="Chi không gắn dự án" href={base({ general: true, page: 1 })} />
      </section>
      <FilterBar tab="chi" q={q} today={today} L={L} keys={keys} exportHref={`/thu-chi/xuat${financeParams(q, { type: "expenses" })}`} />
      <Disclosure summary="Đề nghị chi / ghi nhận chi phí" icon={<Plus className="size-4" aria-hidden />}>
        <RpcForm rpc="create_expense" submitLabel="Gửi duyệt" revalidate={rev} resetOnSuccess columns={3} fixed={{ p_submit: true }}
          fields={[
            { name: "p_occurred_on", label: "Ngày phát sinh", type: "date", required: true, defaultValue: today }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true },
            { name: "p_category_id", label: "Loại chi phí", type: "select", as: "uuid", options: L.categories },
            { name: "p_project_id", label: "Dự án", type: "select", as: "uuid", options: L.projects, hint: "Để trống = chi chung; chỉ kế toán ghi nhận chi không gắn dự án" },
            { name: "p_payee_type", label: "Người nhận", type: "select", required: true, defaultValue: "vendor", options: [["vendor", "Nhà cung cấp"], ["freelancer", "Cộng tác viên"], ["employee", "Nhân viên"], ["other", "Khác"]] },
            { name: "p_payee_name", label: "Tên người / đơn vị nhận" }, { name: "p_description", label: "Nội dung", wide: true },
            { name: "p_due_date", label: "Hạn thanh toán", type: "date" }, { name: "p_invoice_url", label: "Link chứng từ (http…)", type: "url", hint: "Tệp chứng từ đính kèm sau khi tạo khoản chi" },
            { name: "p_advance_id", label: "Trừ vào tạm ứng", type: "select", as: "uuid", options: advances },
          ]} />
      </Disclosure>
      {list.rows.length === 0 ? <EmptyState title="Không có khoản chi khớp bộ lọc" description="Bấm “Đề nghị chi” để tạo khoản đầu tiên hoặc mở rộng bộ lọc." /> : (
        <>
          <div className={TABLE}>
            <table className="w-full min-w-[980px] text-sm" data-testid="list-expenses">
              <thead className={THEAD}><tr>
                <SortTh label="Ngày" col="date" sort={q.sort} dir={q.dir} href={sortHref} /><th className="px-3.5 py-2.5">Nội dung</th><th className="px-3.5 py-2.5">Phòng ban · Người đề nghị</th>
                <SortTh label="Số tiền" col="amount" sort={q.sort} dir={q.dir} href={sortHref} className="text-right" /><th className="px-3.5 py-2.5">Duyệt</th><th className="px-3.5 py-2.5">Thanh toán</th><th className="px-3.5 py-2.5">Chứng từ</th><th className="px-3.5 py-2.5">Thao tác</th>
              </tr></thead>
              <tbody className="divide-y">{list.rows.map((r: ExpenseRow) => {
                const mine = r.owner_id === userId;
                return (
                  <tr key={r.id} id={`row-${r.id}`}>
                    <td className="px-3.5 py-2.5 align-top whitespace-nowrap">{formatDate(r.occurred_on)}</td>
                    <td className="px-3.5 py-2.5 align-top"><p className="font-medium">{r.description ?? r.payee_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.category_name ?? "Chưa phân loại"} · {r.project_id ? <Link className="text-primary hover:underline" href={`/du-an/${r.project_id}?tab=tai-chinh`}>{r.project_code} · {r.project_name}</Link> : "Chi chung (không gắn dự án)"}</p></td>
                    <td className="px-3.5 py-2.5 align-top text-xs">{r.department_name ?? <span className="text-muted-foreground">Chưa gán phòng ban</span>}<br /><span className="text-muted-foreground">{r.owner_name ?? "—"}</span>
                      {canManage ? (
                        <details className="mt-1"><summary className="cursor-pointer text-primary">Gán phòng ban</summary>
                          <div className="mt-2 w-64"><RpcForm rpc="set_transaction_scope" fixed={{ p_kind: "expense", p_id: r.id }} submitLabel="Lưu" revalidate={["/thu-chi"]} columns={1} variant="outline"
                            fields={[{ name: "p_department", label: "Phòng ban", type: "select", as: "uuid", options: L.departments, defaultValue: r.department_id ?? "" }]} /></div>
                        </details>) : null}
                    </td>
                    <td className="px-3.5 py-2.5 align-top text-right tabular-nums"><strong>{money(r.amount)}</strong></td>
                    <td className="px-3.5 py-2.5 align-top">{badge(APPROVAL, r.approval)}</td><td className="px-3.5 py-2.5 align-top">{badge(PAYMENT, r.payment)}</td>
                    <td className="px-3.5 py-2.5 align-top"><VoucherCell kind="expense" id={r.id} count={r.file_count} canAttach={canManage || (mine && ["draft", "submitted", "rejected"].includes(r.approval))} />{r.invoice_url ? <a className="mt-1 block text-xs text-primary hover:underline" href={r.invoice_url} target="_blank" rel="noreferrer noopener">Liên kết chứng từ</a> : null}</td>
                    <td className="px-3.5 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {r.approval === "draft" && mine ? <RpcButton rpc="submit_expense" args={{ p_id: r.id }} label="Gửi duyệt" variant="soft" revalidate={rev} /> : null}
                        {canApprove && r.approval === "submitted" ? <><RpcButton rpc="decide_expense" args={{ p_id: r.id, p_decision: "approve" }} label="Duyệt" variant="soft" revalidate={rev} /><RpcButton rpc="decide_expense" args={{ p_id: r.id, p_decision: "reject" }} prompt={{ text: "Lý do từ chối:", arg: "p_note", required: true }} label="Từ chối" variant="ghost" revalidate={rev} /></> : null}
                        {canManage && r.approval === "approved" && r.payment === "unpaid" ? <RpcButton rpc="pay_expense" args={{ p_id: r.id }} label="Đã thanh toán" variant="default" confirm="Xác nhận đã thanh toán khoản này?" revalidate={rev} /> : null}
                        {r.payment === "unpaid" && (mine || canManage) && r.approval !== "approved" ? <RpcButton rpc="delete_expense" args={{ p_id: r.id }} label="Xóa" variant="ghost" confirm="Xóa khoản chi này?" revalidate={rev} /> : null}
                      </div>
                      {(r.approval === "draft" || r.approval === "rejected") && (mine || canManage) ? (
                        <details className="mt-1.5 text-xs"><summary className="cursor-pointer text-primary">Sửa</summary>
                          <div className="mt-2 w-80"><RpcForm rpc="update_expense" fixed={{ p_id: r.id }} submitLabel="Lưu thay đổi" revalidate={rev} columns={1} variant="outline"
                            fields={[{ name: "p_occurred_on", label: "Ngày phát sinh", type: "date", required: true, defaultValue: r.occurred_on }, { name: "p_amount", label: "Số tiền (₫)", type: "number", required: true, defaultValue: Number(r.amount) },
                              { name: "p_category_id", label: "Loại chi phí", type: "select", as: "uuid", options: L.categories, defaultValue: r.category_id ?? "" }, { name: "p_description", label: "Nội dung", defaultValue: r.description ?? "" },
                              { name: "p_due_date", label: "Hạn thanh toán", type: "date", defaultValue: r.due_date ?? "" }, { name: "p_invoice_url", label: "Link chứng từ", type: "url", defaultValue: r.invoice_url ?? "" }]} /></div>
                        </details>) : null}
                    </td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <Pager total={list.total} page={q.page} size={q.size} href={(p) => base({ page: p })} />
        </>
      )}
    </>
  );
}
