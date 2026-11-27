"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { rpcCall } from "@/app/(app)/_actions/rpc";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type KanbanCard = { id: string; title: string; sub?: string; meta?: string; href: string };
export type KanbanColumn = { value: string; label: string; color: string; locked?: boolean; cards: KanbanCard[]; total?: string };

/**
 * Bảng Kanban: kéo thả thẻ giữa các cột (hoặc dùng ô "Chuyển đến" trên điện thoại / bàn phím).
 * Chuyển cột gọi RPC của CSDL; lỗi quy tắc nghiệp vụ được báo và thẻ trở về chỗ cũ.
 */
export function KanbanBoard({ columns: initial, rpc, idArg, statusArg, prompt, revalidate }: {
  columns: KanbanColumn[]; rpc: string; idArg: string; statusArg: string; prompt?: { value: string; text: string; arg: string }; revalidate: string[];
}) {
  const [cols, setCols] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  const move = (cardId: string, to: string) => {
    const from = cols.find((c) => c.cards.some((k) => k.id === cardId));
    const target = cols.find((c) => c.value === to);
    if (!from || !target || from.value === to) return;
    if (from.locked) { setErr(`Thẻ ở cột "${from.label}" không chuyển được thủ công.`); return; }
    if (target.locked) { setErr(`Không chuyển thủ công vào cột "${target.label}" — bước này tự động theo quy trình.`); return; }
    const args: Record<string, unknown> = { [idArg]: cardId, [statusArg]: to };
    if (prompt && prompt.value === to) {
      const v = window.prompt(prompt.text);
      if (v === null) return;
      if (!v.trim()) { setErr("Cần nhập nội dung."); return; }
      args[prompt.arg] = v.trim();
    }
    const before = cols;
    setErr(null);
    setCols(cols.map((c) => c.value === from.value ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c.value === to ? { ...c, cards: [from.cards.find((k) => k.id === cardId)!, ...c.cards] } : c));
    start(async () => {
      const r = await rpcCall(rpc, args, revalidate);
      if (r && !r.ok) { setCols(before); setErr(r.error); }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="relative -mx-1 flex gap-3 overflow-x-auto px-1 pb-3" data-testid="kanban">
        {cols.map((c) => (
          <section
            key={c.value}
            aria-label={`${c.label}: ${c.cards.length} thẻ`}
            data-column={c.value}
            onDragOver={(e) => { if (!c.locked) { e.preventDefault(); setOver(c.value); } }}
            onDragLeave={() => setOver((o) => (o === c.value ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, c.value); }}
            className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2.5 transition-colors", over === c.value && "border-primary bg-primary-soft/50")}
          >
            <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />{c.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">{c.cards.length}{c.total ? ` · ${c.total}` : ""}</span>
            </header>
            <ul className="flex min-h-12 flex-col gap-2">
              {c.cards.map((k) => (
                <li key={k.id} draggable={!c.locked} onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                  data-card={k.id} className={cn("rounded-lg border bg-card p-3 text-sm shadow-xs", !c.locked && "cursor-grab active:cursor-grabbing")}>
                  <Link href={k.href} className="font-medium hover:text-primary hover:underline">{k.title}</Link>
                  {k.sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{k.sub}</p> : null}
                  {k.meta ? <p className="mt-1.5 text-xs font-medium tabular-nums">{k.meta}</p> : null}
                  {!c.locked ? (
                    <label className="mt-2 block text-[11px] text-muted-foreground">
                      <span className="sr-only">Chuyển thẻ {k.title} đến cột</span>
                      <select aria-label={`Chuyển ${k.title} đến`} value={c.value} onChange={(e) => move(k.id, e.target.value)} className="select-chevron h-7 w-full rounded-md border border-input bg-card px-2 text-xs">
                        {cols.map((o) => <option key={o.value} value={o.value} disabled={o.locked && o.value !== c.value}>{o.label}</option>)}
                      </select>
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
