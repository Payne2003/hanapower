"use client";
import Link from "next/link";
import { useActionState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, MinusCircle, XCircle } from "lucide-react";
import { previewImportAction, runImportAction } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { Alert } from "@/components/ui/alert";
import { StageBadge } from "@/components/status";
import { cn } from "@/lib/utils";

export function ImportWizard() {
  const [preview, previewAction] = useActionState(previewImportAction, null);
  const [result, importAction] = useActionState(runImportAction, null);
  const lines = useMemo(() => (preview?.ok ? preview.data?.lines ?? [] : []), [preview]);
  const fresh = lines.filter((l) => l.status === "new" && l.video);
  const counts = {
    new: fresh.length,
    exists: lines.filter((l) => l.status === "exists").length,
    error: lines.filter((l) => l.status === "error").length,
    warn: fresh.filter((l) => l.warnings.length).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <form action={previewAction} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><FileSpreadsheet className="size-5" aria-hidden /></span>
          <div>
            <h2 className="font-semibold">1. Chọn tệp Excel</h2>
            <p className="text-sm text-muted-foreground">Trong Google Sheet: <b>Tệp → Tải xuống → Microsoft Excel (.xlsx)</b>. Ứng dụng đọc mọi tab (t11, t12, t1…) có cột &quot;Mã dự án&quot;.</p>
          </div>
        </div>
        <label htmlFor="import-file" className="text-sm font-medium">Tệp .xlsx</label>
        <input id="import-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
          className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-muted/40 p-3 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground" />
        {preview && !preview.ok ? <FormMessage state={preview} /> : null}
        <div><SubmitButton pendingText="Đang đọc tệp…">Đọc tệp và xem trước</SubmitButton></div>
      </form>

      {preview?.ok && preview.data ? (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]" aria-labelledby="pv-h">
          <div>
            <h2 id="pv-h" className="font-semibold">2. Kiểm tra trước khi nhập</h2>
            <p className="text-sm text-muted-foreground">{preview.data.fileName} · {preview.data.sheets.length} tab · {lines.length} dòng</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm" data-testid="import-summary">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800"><CheckCircle2 className="size-4" aria-hidden />{counts.new} video mới</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700"><MinusCircle className="size-4" aria-hidden />{counts.exists} đã có (bỏ qua)</span>
            {counts.warn ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-800"><AlertTriangle className="size-4" aria-hidden />{counts.warn} cần lưu ý</span> : null}
            {counts.error ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-800"><XCircle className="size-4" aria-hidden />{counts.error} lỗi (bỏ qua)</span> : null}
          </div>

          <ul className="divide-y rounded-lg border">
            {lines.map((l, i) => (
              <li key={i} className={cn("flex flex-col gap-1.5 p-3 text-sm sm:flex-row sm:items-start sm:gap-4", l.status !== "new" && "bg-muted/40 text-muted-foreground")} data-testid="import-line">
                <span className="flex shrink-0 items-center gap-2 sm:w-40">
                  {l.status === "new" ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="Sẽ nhập" /> : l.status === "exists" ? <MinusCircle className="size-4" aria-label="Bỏ qua" /> : <XCircle className="size-4 text-red-600" aria-label="Lỗi" />}
                  <span className="font-mono text-xs">{l.code || "—"}</span>
                  {l.video ? <StageBadge stage={l.video.stage} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{l.title || "(không có tên)"}</span>
                  <span className="block text-xs text-muted-foreground">{l.sheet} · dòng {l.rowNo} · Content: {l.content_name || "—"} · Editor: {l.editor_name || "—"}</span>
                  {l.warnings.map((w) => <span key={w} className={cn("mt-1 block text-xs", l.status === "error" ? "text-red-700" : "text-amber-800")}>⚠ {w}</span>)}
                </span>
              </li>
            ))}
          </ul>

          {result?.ok ? (
            <Alert tone="success" className="flex flex-wrap items-center justify-between gap-2">
              <span>{result.message}</span>
              <Link href="/video?thang=tat-ca" className="font-medium underline">Xem danh sách video</Link>
            </Alert>
          ) : (
            <form action={importAction} className="flex flex-col gap-3 border-t pt-4">
              <input type="hidden" name="videos" value={JSON.stringify(fresh.map((l) => l.video))} />
              {counts.warn ? <Alert tone="warning">Một số dòng thiếu người phụ trách/Editor vì chưa có tài khoản tương ứng. Bạn có thể tạo tài khoản ở <Link href="/nhan-su" className="underline">Nhân sự</Link> rồi đọc lại tệp, hoặc nhập luôn và phân công sau.</Alert> : null}
              <FormMessage state={result} />
              <div><SubmitButton disabled={counts.new === 0} pendingText="Đang nhập…">{counts.new ? `Nhập ${counts.new} video` : "Không có video mới"}</SubmitButton></div>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
