"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { Select } from "@/components/ui/form";
import { QUICK_VIEWS, type QuickView } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

/**
 * Góc nhìn nhanh + tìm kiếm + tháng + giai đoạn + người phụ trách. Mọi trạng thái nằm trên URL nên Bảng và Kanban dùng chung,
 * và giữ nguyên khi đổi chế độ hoặc mở / đóng khung chi tiết.
 */
export function VideoToolbar({ month, months, stages, contents, editors, counts, personLabel, personRoleLabel }: {
  month: string | null; months: Opt[]; stages: Opt[]; contents: Opt[]; editors: Opt[]; counts: Record<QuickView, number>;
  personLabel: string | null; personRoleLabel: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const loc = (sp.get("loc") as QuickView | null) ?? "tat-ca";
  const stage = sp.get("giai_doan") ?? "";
  const person = sp.get("nguoi") ?? "";
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setQ(urlQ), [urlQ]);

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    p.delete("chon"); // đổi bộ lọc thì đóng chi tiết (video đang xem có thể không còn trong danh sách)
    start(() => router.push(`/video?${p.toString()}`, { scroll: false }));
  };
  const onSearch = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() || null }), 350);
  };
  const shift = (d: number) => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number) as [number, number];
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    go({ thang: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}` });
  };
  const filtered = !!stage || !!person || !!urlQ || loc !== "tat-ca";

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Tra cứu video">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Góc nhìn nhanh" data-testid="quick-views">
        {QUICK_VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={loc === v.key} title={v.hint} data-testid={`qv-${v.key}`}
            onClick={() => go({ loc: v.key === "tat-ca" ? null : v.key })}
            className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", loc === v.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {v.label}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", loc === v.key ? "bg-white/20" : "bg-muted text-muted-foreground")} data-testid={`qv-count-${v.key}`}>{counts[v.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => onSearch(e.target.value)} aria-label="Tìm tiêu đề hoặc mã video" placeholder="Tìm tiêu đề hoặc mã video (VD: D0012)…" data-testid="video-search"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-xs placeholder:text-muted-foreground/80 focus-visible:outline-2 focus-visible:outline-ring/40" />
        </div>
        <div className="flex items-center rounded-lg border bg-card shadow-xs">
          <button type="button" onClick={() => shift(-1)} disabled={!month} aria-label="Tháng trước" data-testid="month-prev" className="grid h-10 w-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <label className="sr-only" htmlFor="f-thang">Tháng</label>
          <select id="f-thang" value={month ?? "tat-ca"} onChange={(e) => go({ thang: e.target.value })} data-testid="month-select"
            className="select-chevron h-10 flex-1 cursor-pointer border-x bg-transparent px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:w-44 sm:flex-none">
            <option value="tat-ca">Tất cả các tháng</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" onClick={() => shift(1)} disabled={!month} aria-label="Tháng sau" data-testid="month-next" className="grid h-10 w-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
        <label className="sr-only" htmlFor="f-gd">Giai đoạn</label>
        <Select id="f-gd" value={stage} onChange={(e) => go({ giai_doan: e.target.value || null })} className={cn("lg:w-44", stage && "border-primary/50 bg-primary-soft/50")}>
          <option value="">Mọi giai đoạn</option>
          {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <label className="sr-only" htmlFor="f-nguoi">Người phụ trách</label>
        <Select id="f-nguoi" value={person} onChange={(e) => go({ nguoi: e.target.value || null })} className={cn("lg:w-52", person && "border-primary/50 bg-primary-soft/50")}>
          <option value="">Mọi người phụ trách</option>
          <option value="toi">Của tôi (Content hoặc Editor)</option>
          <optgroup label="Content">{contents.map((p) => <option key={`c${p.value}`} value={`c:${p.value}`}>{p.label}</option>)}</optgroup>
          <optgroup label="Editor">{editors.map((p) => <option key={`e${p.value}`} value={`e:${p.value}`}>{p.label}</option>)}</optgroup>
        </Select>
        <div className="flex items-center gap-2 lg:ml-auto">
          {filtered ? <button type="button" onClick={() => go({ giai_doan: null, nguoi: null, q: null, loc: null })} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted px-3 text-xs font-medium hover:bg-[oklch(0.93_0.01_145)]"><X className="size-3.5" aria-hidden />Bỏ lọc</button> : null}
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Đang tải" /> : null}
        </div>
      </div>
      {personLabel ? (
        <p className="flex items-center gap-2 text-sm" data-testid="person-filter-note" aria-live="polite">
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">Đang lọc {personRoleLabel}</span>
          <span><strong>{personLabel}</strong>{personRoleLabel === "Content hoặc Editor" ? " — video mà người này là Content hoặc Editor" : ""}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Chuyển Bảng / Kanban — giữ nguyên mọi tham số tra cứu và video đang chọn. */
export function ViewToggle({ kanban }: { kanban: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (k: boolean) => {
    const p = new URLSearchParams(sp.toString());
    if (k) p.set("xem", "kanban"); else p.delete("xem");
    router.push(`/video?${p.toString()}`, { scroll: false });
  };
  return (
    <div role="tablist" aria-label="Kiểu hiển thị" className="inline-flex rounded-lg border bg-card p-1 text-sm shadow-xs">
      {([false, true] as const).map((k) => (
        <button key={String(k)} type="button" role="tab" aria-selected={kanban === k} onClick={() => set(k)} data-testid={k ? "mode-kanban" : "mode-table"}
          className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", kanban === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {k ? "Kanban" : "Bảng"}
        </button>
      ))}
    </div>
  );
}
