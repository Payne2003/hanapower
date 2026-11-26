"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, Loader2, Save, Send } from "lucide-react";
import { saveDailyReportDraft, submitDailyReport, type DailyReportPayload } from "@/app/(app)/bao-cao/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input, Label, Textarea } from "@/components/ui/form";
import { TaskStatusBadge } from "@/components/status";
import type { TaskStatus } from "@/lib/types";

export type ReportTask = { id: string; title: string; project: string; progress: number; status: TaskStatus; blocker: string | null };
type Row = { include: boolean; result: string; progress: number; blocker: string };
type Saved = { note: string; rows: Record<string, Row> };
type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "submitting" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

export function DailyReportForm({ userId, reportDate, tasks, initial }: {
  userId: string;
  reportDate: string;
  tasks: ReportTask[];
  initial: { note: string; items: { task_id: string; result: string; progress: number; blocker: string | null }[] } | null;
}) {
  const storageKey = `bao-cao-nhap:${userId}:${reportDate}`;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [online, setOnline] = useState(true);
  const busy = phase.kind === "saving" || phase.kind === "submitting";
  const inFlight = useRef(false);

  const defaults = useMemo<Saved>(() => {
    const fromServer = new Map((initial?.items ?? []).map((i) => [i.task_id, i]));
    const rows: Record<string, Row> = {};
    for (const t of tasks) {
      const s = fromServer.get(t.id);
      rows[t.id] = s
        ? { include: true, result: s.result, progress: s.progress, blocker: s.blocker ?? "" }
        : { include: !initial && t.status === "in_progress", result: "", progress: t.progress, blocker: t.blocker ?? "" };
    }
    return { note: initial?.note ?? "", rows };
  }, [tasks, initial]);

  const [state, setState] = useState<Saved>(defaults);

  // Khôi phục bản nháp cục bộ (phòng khi mất mạng / đóng tab trước khi lưu lên máy chủ).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        setState((cur) => ({ note: saved.note ?? cur.note, rows: { ...cur.rows, ...Object.fromEntries(Object.entries(saved.rows ?? {}).filter(([k]) => k in cur.rows)) } }));
      }
    } catch { /* bỏ qua dữ liệu cục bộ hỏng */ }
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* bộ nhớ đầy / chế độ riêng tư */ }
  }, [state, storageKey]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const setRow = (id: string, patch: Partial<Row>) => setState((s) => ({ ...s, rows: { ...s.rows, [id]: { ...s.rows[id]!, ...patch } } }));

  const payload = (): DailyReportPayload => ({
    report_date: reportDate,
    note: state.note,
    items: tasks
      .filter((t) => state.rows[t.id]?.include)
      .map((t) => {
        const r = state.rows[t.id]!;
        return { task_id: t.id, result: r.result, progress: r.progress, blocker: r.blocker.trim() ? r.blocker : null };
      }),
  });

  const run = async (kind: "saving" | "submitting") => {
    if (inFlight.current) return; // chống nhấn hai lần
    inFlight.current = true;
    setPhase({ kind });
    try {
      const res = kind === "saving" ? await saveDailyReportDraft(payload()) : await submitDailyReport(payload());
      if (res.ok) {
        setPhase({ kind: "ok", text: res.message ?? "Đã lưu." });
        if (kind === "submitting") {
          try { localStorage.removeItem(storageKey); } catch { /* */ }
        }
        startTransition(() => router.refresh());
      } else {
        setPhase({ kind: "error", text: res.error });
      }
    } catch {
      setPhase({ kind: "error", text: "Gửi lỗi do mất kết nối. Nội dung vẫn được giữ trên máy này — bấm gửi lại khi có mạng (không bị ghi trùng)." });
    } finally {
      inFlight.current = false;
    }
  };

  const selected = tasks.filter((t) => state.rows[t.id]?.include).length;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void run("submitting"); }}
      className="flex flex-col gap-4"
      aria-label="Báo cáo ngày"
      aria-busy={busy}
    >
      {!online ? (
        <Alert tone="warning" className="flex items-center gap-2"><CloudOff className="size-4" aria-hidden /> Mất kết nối mạng. Bạn vẫn có thể soạn; dữ liệu được giữ trên máy này.</Alert>
      ) : null}

      {tasks.length === 0 ? (
        <Alert tone="info">Bạn chưa có công việc đang thực hiện để báo cáo.</Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((t) => {
            const r = state.rows[t.id]!;
            const locked = t.status === "in_review";
            return (
              <li key={t.id} className={`rounded-lg border p-3 ${r.include ? "bg-card" : "bg-muted/50"}`} data-testid="report-row" data-task-id={t.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    id={`inc-${t.id}`}
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => setRow(t.id, { include: e.target.checked })}
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <label htmlFor={`inc-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.project} · hiện tại {t.progress}%</span>
                  </label>
                  <TaskStatusBadge status={t.status} />
                </div>
                {r.include ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem]">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`res-${t.id}`}>Kết quả trong ngày</Label>
                      <Textarea id={`res-${t.id}`} rows={2} value={r.result} onChange={(e) => setRow(t.id, { result: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`pg-${t.id}`}>Tiến độ (%)</Label>
                      <Input id={`pg-${t.id}`} type="number" min={0} max={100} value={r.progress} disabled={locked}
                        onChange={(e) => setRow(t.id, { progress: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} />
                      {locked ? <span className="text-xs text-muted-foreground">Đang chờ duyệt</span> : r.progress === 100 ? <span className="text-xs text-amber-800">Sẽ chuyển Chờ duyệt</span> : null}
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor={`bl-${t.id}`}>Vướng mắc</Label>
                      <Input id={`bl-${t.id}`} value={r.blocker} placeholder="Để trống nếu không có" onChange={(e) => setRow(t.id, { blocker: e.target.value })} />
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rp-note">Ghi chú chung</Label>
        <Textarea id="rp-note" rows={2} value={state.note} onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))} />
      </div>

      <div aria-live="polite">
        {phase.kind === "ok" ? <Alert tone="success">{phase.text}</Alert> : null}
        {phase.kind === "error" ? <Alert tone="error">{phase.text}</Alert> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || selected === 0}>
          {phase.kind === "submitting" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {phase.kind === "submitting" ? "Đang gửi…" : phase.kind === "error" ? "Gửi lại" : `Gửi báo cáo (${selected})`}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run("saving")}>
          {phase.kind === "saving" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {phase.kind === "saving" ? "Đang lưu…" : "Lưu nháp"}
        </Button>
        <span className="text-xs text-muted-foreground">Sau khi gửi, báo cáo không sửa được.</span>
      </div>
    </form>
  );
}
