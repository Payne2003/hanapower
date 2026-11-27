"use client";
import Link from "next/link";
import { useActionState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, MinusCircle, XCircle } from "lucide-react";
import { previewCrmImport, runCrmImport } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function CrmImportWizard({ slug, label }: { slug: string; label: string }) {
  const [preview, previewAction] = useActionState(previewCrmImport, null);
  const [result, importAction] = useActionState(runCrmImport, null);
  const lines = useMemo(() => (preview?.ok ? preview.data?.lines ?? [] : []), [preview]);
  const fresh = lines.filter((l) => l.status === "new" && l.row);
  const counts = {
    new: fresh.length, exists: lines.filter((l) => l.status === "exists").length, error: lines.filter((l) => l.status === "error").length,
    warn: fresh.filter((l) => l.warnings.length).length,
  };
  const needAccounts = slug === "lien-he" && fresh.some((l) => l.row && "account_name" in l.row);

  return (
    <div className="flex flex-col gap-5">
      <form action={previewAction} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
        <input type="hidden" name="kind" value={slug} />
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><FileSpreadsheet className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="font-semibold">1. Chọn tệp Excel hoặc CSV</h2>
            <p className="text-sm text-muted-foreground">Dòng đầu là tiêu đề cột (Tên công ty, Điện thoại, Email…). Ứng dụng tự nhận ra cột theo tên, thứ tự cột tùy ý.</p>
            <a href={`/nhap-khach-hang/${slug}/mau`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Download className="size-4" aria-hidden />Tải tệp mẫu ({label})</a>
          </div>
        </div>
        <label htmlFor="crm-import-file" className="text-sm font-medium">Tệp .xlsx / .csv</label>
        <input id="crm-import-file" name="file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required
          className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-muted/40 p-3 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground" />
        {preview && !preview.ok ? <FormMessage state={preview} /> : null}
        <div><SubmitButton pendingText="Đang đọc tệp…">Đọc tệp và xem trước</SubmitButton></div>
      </form>

      {preview?.ok && preview.data ? (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-labelledby="pv-h">
          <div>
            <h2 id="pv-h" className="font-semibold">2. Kiểm tra trước khi nhập</h2>
            <p className="text-sm text-muted-foreground">{preview.data.fileName} · {lines.length} dòng · các cột nhận ra: {preview.data.recognized.join(", ")}</p>
            {preview.data.unknown.length ? <p className="text-xs text-amber-800">Cột không nhận ra (bỏ qua): {preview.data.unknown.join(", ")}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 text-sm" data-testid="import-summary">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800"><CheckCircle2 className="size-4" aria-hidden />{counts.new} bản ghi mới</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700"><MinusCircle className="size-4" aria-hidden />{counts.exists} trùng (bỏ qua)</span>
            {counts.warn ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-800"><AlertTriangle className="size-4" aria-hidden />{counts.warn} cần lưu ý</span> : null}
            {counts.error ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-800"><XCircle className="size-4" aria-hidden />{counts.error} lỗi (bỏ qua)</span> : null}
          </div>
          <ul className="max-h-[28rem] divide-y overflow-auto rounded-lg border">
            {lines.map((l) => (
              <li key={l.rowNo} className={cn("flex flex-col gap-1 p-3 text-sm", l.status !== "new" && "bg-muted/40 text-muted-foreground")} data-testid="import-line">
                <span className="flex items-center gap-2">
                  {l.status === "new" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="Sẽ nhập" /> : l.status === "exists" ? <MinusCircle className="size-4 shrink-0" aria-label="Bỏ qua" /> : <XCircle className="size-4 shrink-0 text-red-600" aria-label="Lỗi" />}
                  <span className="font-medium text-foreground">{l.label}</span>
                  <span className="text-xs text-muted-foreground">dòng {l.rowNo}</span>
                </span>
                {l.warnings.map((w) => <span key={w} className={cn("pl-6 text-xs", l.status === "error" ? "text-red-700" : l.status === "exists" ? "text-muted-foreground" : "text-amber-800")}>⚠ {w}</span>)}
              </li>
            ))}
          </ul>
          {result?.ok ? (
            <Alert tone="success" className="flex flex-wrap items-center justify-between gap-2">
              <span data-testid="import-done">{result.message}</span>
              <Link href={`/${slug}`} className="font-medium underline">Xem danh sách</Link>
            </Alert>
          ) : (
            <form action={importAction} className="flex flex-col gap-3 border-t pt-4">
              <input type="hidden" name="kind" value={slug} />
              <input type="hidden" name="rows" value={JSON.stringify(fresh.map((l) => l.row))} />
              {needAccounts ? (
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="create_accounts" defaultChecked className="mt-0.5 size-4 accent-[var(--primary)]" /> Tự tạo tài khoản công ty cho các liên hệ chưa có công ty trong hệ thống</label>
              ) : null}
              <FormMessage state={result} />
              <div><SubmitButton disabled={counts.new === 0} pendingText="Đang nhập…">{counts.new ? `Nhập ${counts.new} bản ghi` : "Không có bản ghi mới"}</SubmitButton></div>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
