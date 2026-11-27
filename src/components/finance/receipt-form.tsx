"use client";
import { useActionState, useState } from "react";
import { recordReceiptAction } from "@/app/(app)/thu-chi/actions";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Alert } from "@/components/ui/alert";
import { money } from "@/lib/form-spec";
import { periodLabel, periodOf, METHODS } from "@/lib/finance-ui";

type Opt = [string, string][];

/**
 * "Ghi nhận thu" cho một mốc — dùng chung ở hồ sơ dự án và tab "Phải thu theo mốc" (cùng một hàm CSDL).
 * Số tiền cố định theo mốc (chỉ thu trọn mốc); ngày thực thu quyết định kỳ tài chính, hiển thị trước khi lưu.
 */
export function ReceiptForm({ milestoneId, title, amount, dueDate, today, sources, people, departments, defaultSource, defaultOwner, defaultInvoice, defaultDate }: {
  milestoneId: string; title: string; amount: number; dueDate: string | null; today: string; sources: Opt; people: Opt; departments: Opt;
  defaultSource?: string; defaultOwner?: string; defaultInvoice?: string | null; defaultDate?: string;
}) {
  const [state, action] = useActionState(recordReceiptAction, null);
  const [date, setDate] = useState(defaultDate ?? today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const per = valid ? periodOf(date) : null;
  const sameMonth = !!(dueDate && valid && dueDate.slice(0, 7) === date.slice(0, 7));
  const id = (n: string) => `receipt-${milestoneId}-${n}`;
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="receipt-form">
      <input type="hidden" name="milestone" value={milestoneId} />
      <p className="text-sm"><strong>{title}</strong> — số tiền mốc <strong className="tabular-nums">{money(amount)}</strong>. Một mốc ghi nhận thu trọn một lần; bấm lại sẽ không tạo thêm khoản thu.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Ngày thực thu *" htmlFor={id("date")}>
          <Input id={id("date")} name="received_on" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Nguồn thu" htmlFor={id("source")}>
          <Select id={id("source")} name="source" defaultValue={defaultSource ?? ""}><option value="">— Mặc định theo dự án —</option>{sources.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Hình thức thu" htmlFor={id("method")}>
          <Select id={id("method")} name="method" defaultValue="Chuyển khoản">{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
        </Field>
        <Field label="Người phụ trách" htmlFor={id("owner")}>
          <Select id={id("owner")} name="owner" defaultValue={defaultOwner ?? ""}><option value="">— Người ghi nhận —</option>{people.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Phòng ban" htmlFor={id("dept")}>
          <Select id={id("dept")} name="department" defaultValue=""><option value="">— Không chọn —</option>{departments.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Số hóa đơn" htmlFor={id("inv")}><Input id={id("inv")} name="invoice_no" defaultValue={defaultInvoice ?? ""} /></Field>
        <Field label="Chứng từ (có thể chọn nhiều tệp)" htmlFor={id("file")} hint="PDF, ảnh, Word, Excel — tối đa 5 MB mỗi tệp" className="sm:col-span-2">
          <Input id={id("file")} name="file" type="file" multiple className="h-auto py-1.5" />
        </Field>
        <Field label="Ghi chú" htmlFor={id("note")} className="sm:col-span-full"><Textarea id={id("note")} name="note" rows={2} /></Field>
      </div>
      {per ? (
        <Alert tone="info" data-testid="receipt-period">
          Khoản thu sẽ ghi vào <strong>{periodLabel(per.year, per.month)}</strong> (theo ngày thực thu).
          {dueDate && !sameMonth ? <> Mốc đến hạn {dueDate.split("-").reverse().join("/")} — {dueDate < date ? "thu muộn hơn kế hoạch: lịch thu vẫn nằm ở kỳ đến hạn, tiền thực thu nằm ở kỳ này." : "thu sớm hơn kế hoạch."}</> : null}
        </Alert>
      ) : null}
      <FormMessage state={state} />
      <div><SubmitButton pendingText="Đang ghi nhận…">Ghi nhận đã thu {money(amount)}</SubmitButton></div>
    </form>
  );
}
