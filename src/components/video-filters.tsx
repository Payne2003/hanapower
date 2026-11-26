"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

/** Bộ lọc tự áp dụng khi thay đổi (không cần nút "Lọc"), giữ trên URL để chia sẻ/tải lại. */
export function VideoFilters({ month, months, stages, people, basePath = "/video" }: {
  month: string | null; // null = tất cả
  months: Opt[];
  stages: Opt[];
  people: Opt[];
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    start(() => router.push(`${basePath}?${p.toString()}`));
  };
  const shift = (d: number) => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number) as [number, number];
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    go({ thang: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}` });
  };
  const stage = sp.get("giai_doan") ?? "";
  const person = sp.get("nguoi") ?? "";
  const filtered = !!stage || !!person;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] sm:flex-row sm:flex-wrap sm:items-center" aria-label="Bộ lọc" role="search">
      <div className="flex items-center rounded-lg border bg-card shadow-xs">
        <button type="button" onClick={() => shift(-1)} disabled={!month} aria-label="Tháng trước"
          className="grid h-10 w-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-muted disabled:opacity-40">
          <ChevronLeft className="size-4" />
        </button>
        <label className="sr-only" htmlFor="f-thang">Tháng</label>
        <select
          id="f-thang"
          value={month ?? "tat-ca"}
          onChange={(e) => go({ thang: e.target.value })}
          className="select-chevron h-10 flex-1 cursor-pointer border-x bg-transparent px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:w-44 sm:flex-none"
        >
          <option value="tat-ca">Tất cả các tháng</option>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button type="button" onClick={() => shift(1)} disabled={!month} aria-label="Tháng sau"
          className="grid h-10 w-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-muted disabled:opacity-40">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <label className="sr-only" htmlFor="f-gd">Giai đoạn</label>
        <Select id="f-gd" value={stage} onChange={(e) => go({ giai_doan: e.target.value || null })} className={cn("sm:w-44", stage && "border-primary/50 bg-primary-soft/50")}>
          <option value="">Mọi giai đoạn</option>
          {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <label className="sr-only" htmlFor="f-nguoi">Người</label>
        <Select id="f-nguoi" value={person} onChange={(e) => go({ nguoi: e.target.value || null })} className={cn("sm:w-44", person && "border-primary/50 bg-primary-soft/50")}>
          <option value="">Mọi người</option>
          <option value="toi">Của tôi</option>
          {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        {filtered ? (
          <button type="button" onClick={() => go({ giai_doan: null, nguoi: null })} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted px-3 text-xs font-medium hover:bg-[oklch(0.93_0.01_145)]">
            <X className="size-3.5" aria-hidden /> Bỏ lọc
          </button>
        ) : null}
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Đang tải" /> : null}
      </div>
    </div>
  );
}

/** Chuyển Bảng / Kanban. */
export function ViewSwitch({ kanban }: { kanban: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (k: boolean) => {
    const p = new URLSearchParams(sp.toString());
    if (k) p.set("xem", "kanban"); else p.delete("xem");
    router.push(`/video?${p.toString()}`);
  };
  return (
    <div role="tablist" aria-label="Kiểu hiển thị" className="inline-flex rounded-lg border bg-card p-1 text-sm shadow-xs">
      {([false, true] as const).map((k) => (
        <button key={String(k)} type="button" role="tab" aria-selected={kanban === k} onClick={() => set(k)}
          className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", kanban === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {k ? "Kanban" : "Bảng"}
        </button>
      ))}
    </div>
  );
}
