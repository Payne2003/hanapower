"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { rpcCall } from "@/app/(app)/_actions/rpc";
import { quickAddTask } from "@/app/(app)/cong-viec/actions";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { COLUMNS, type Card, type ColumnId } from "@/lib/work-board";
import { WorkCardBody } from "@/components/work-card";

/**
 * Bảng công việc 3 cột (Việc cần làm / Đang tiến hành / Xong). Việc độc lập đổi cột bằng set_task_status;
 * thẻ gắn video không bao giờ đổi cột bằng cách kéo: thả vào cột sẽ mở đúng thao tác nghiệp vụ (bàn giao, nộp duyệt, duyệt)
 * hoặc báo lý do chưa làm được. Lỗi → thẻ trở về chỗ cũ kèm thông báo.
 */
export function WorkBoard({ cards: initial, query, selected, mode = "status", groups = [] }: { cards: Card[]; query: string; selected?: string; mode?: "status" | "group"; groups?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ msg: string; href: string; label: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setCards(initial); }, [initial]);
  useEffect(() => { if (adding) input.current?.focus(); }, [adding]);

  const byGroup = mode === "group";
  type Col = { id: string; label: string; color: string; gid: string | null; custom: boolean };
  const columns: Col[] = byGroup
    ? [{ id: "none", label: "Chưa phân nhóm", color: "#94a3b8", gid: null, custom: false }, ...groups.map((g) => ({ id: g.id, label: g.name, color: "#7c3aed", gid: g.id, custom: true }))]
    : COLUMNS.map((c) => ({ id: c.id, label: c.label, color: c.color, gid: null, custom: false }));
  const inCol = (k: Card, c: Col) => (byGroup ? (k.groupId ?? "none") === c.id : k.status === c.id);

  const moveGroup = (id: string, to: string) => {
    const c = cards.find((k) => k.id === id);
    const gid = to === "none" ? null : to;
    if (!c || (c.groupId ?? null) === gid) return;
    setErr(null); setNotice(null);
    const before = cards;
    setCards(cards.map((k) => (k.id === id ? { ...k, groupId: gid } : k)));
    start(async () => {
      const r = await rpcCall("set_task_group", { p_id: id, p_group: gid }, ["/cong-viec"]);
      if (r && !r.ok) { setCards(before); setErr(r.error); }
    });
  };

  const addGroup = (form: HTMLFormElement) => {
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) { setErr("Nhập tên nhóm."); return; }
    setErr(null);
    start(async () => {
      const r = await rpcCall("save_task_group", { p_id: null, p_name: name }, ["/cong-viec"]);
      if (r && !r.ok) setErr(r.error); else form.reset();
    });
  };

  const move = (id: string, to: ColumnId) => {
    const c = cards.find((k) => k.id === id);
    if (!c || c.status === to) return;
    const rule = c.move[to];
    setErr(null); setNotice(null);
    if (!rule) return;
    if (rule.t === "block") { setErr(`${c.title}: ${rule.msg}`); return; }
    if (rule.t === "open") {
      setNotice({ msg: `Bước này làm ở trang Video — ${rule.label}.`, href: rule.href, label: rule.label });
      router.push(rule.href);
      return;
    }
    const before = cards;
    setCards(cards.map((k) => (k.id === id ? { ...k, status: to } : k)));
    start(async () => {
      const r = await rpcCall("set_task_status", { p_id: id, p_status: to }, ["/cong-viec"]);
      if (r && !r.ok) { setCards(before); setErr(r.error); }
    });
  };

  const add = async (col: string, form: HTMLFormElement) => {
    const title = String(new FormData(form).get("title") ?? "");
    setBusy(true); setErr(null);
    setAdding(null); // đóng biểu mẫu ngay để bố cục không xê dịch khi thẻ mới xuất hiện
    const r = await quickAddTask(title, byGroup ? "not_started" : (col as ColumnId), byGroup ? groups.find((g) => g.id === col)?.id ?? null : null);
    setBusy(false);
    if (!r.ok) { setErr(r.error); setAdding(col); return; }
    form.reset(); // quickAddTask đã revalidate: máy chủ gửi dữ liệu mới cùng phản hồi, không cần refresh thêm
  };

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
      {err ? <Alert tone="error" data-testid="board-error">{err}</Alert> : null}
      {notice ? <Alert tone="info">{notice.msg} <Link className="font-medium underline" href={notice.href}>{notice.label}</Link></Alert> : null}
      <div className="relative -mx-1 grid max-w-full auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-3 md:grid-flow-row md:grid-cols-3" data-testid="work-board" data-mode={mode}>
        {columns.map((col) => {
          const list = cards.filter((k) => inCol(k, col));
          return (
            <section
              key={col.id}
              aria-label={`${col.label}: ${list.length} việc`}
              data-column={col.id}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) { if (byGroup) moveGroup(id, col.id); else move(id, col.id as ColumnId); } }}
              className={cn("flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2.5 transition-colors", over === col.id && "border-primary bg-primary-soft/50")}
            >
              <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ background: col.color }} aria-hidden />{col.label}
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground" data-testid={`count-${col.id}`}>{list.length}</span></h3>
                {col.custom ? (
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <button type="button" className="rounded px-1 hover:bg-background hover:text-foreground" onClick={() => { const n = window.prompt("Tên mới của nhóm", col.label); if (n && n.trim() && n.trim() !== col.label) start(async () => { const r = await rpcCall("save_task_group", { p_id: col.id, p_name: n.trim() }, ["/cong-viec"]); if (r && !r.ok) setErr(r.error); }); }}>Đổi tên</button>
                    <button type="button" className="rounded px-1 hover:bg-background hover:text-red-700" onClick={() => { if (window.confirm(`Xóa nhóm "${col.label}"? Việc trong nhóm không bị xóa, chỉ trở về "Chưa phân nhóm".`)) start(async () => { const r = await rpcCall("delete_task_group", { p_id: col.id }, ["/cong-viec"]); if (r && !r.ok) setErr(r.error); }); }}>Xóa</button>
                  </span>
                ) : null}
                <button type="button" aria-label={`Thêm việc vào "${col.label}"`} onClick={() => setAdding(adding === col.id ? null : col.id)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><Plus className="size-4" aria-hidden /></button>
              </header>
              {adding === col.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void add(col.id, e.currentTarget); }} className="flex flex-col gap-2 rounded-lg border bg-card p-2.5">
                  <input ref={input} name="title" required maxLength={200} placeholder="Tên công việc" aria-label={`Tên công việc mới trong "${col.label}"`} className="h-9 rounded-md border border-input bg-card px-2.5 text-sm" />
                  <div className="flex gap-2">
                    <button disabled={busy} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60">{busy ? "Đang thêm…" : "Thêm"}</button>
                    <button type="button" onClick={() => setAdding(null)} className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted">Hủy</button>
                  </div>
                </form>
              ) : null}
              <ul className="flex min-h-12 flex-col gap-2">
                {list.map((k) => (
                  <li key={k.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                    data-card={k.id} className={cn("cursor-grab rounded-lg border bg-card p-3 text-sm shadow-xs active:cursor-grabbing", selected === k.id && "ring-2 ring-primary")}>
                    <WorkCardBody card={k} href={`${query}${query.includes("?") ? "&" : "?"}the=${k.id}`} showStatus={byGroup} />
                    <label className="mt-2 block text-[11px] text-muted-foreground">
                      <span className="sr-only">Chuyển thẻ {k.title} đến {byGroup ? "nhóm" : "cột"}</span>
                      <select aria-label={`Chuyển ${k.title} đến`} value={byGroup ? (k.groupId ?? "none") : (k.status === "not_started" || k.status === "in_progress" || k.status === "completed" ? k.status : "not_started")}
                        onChange={(e) => (byGroup ? moveGroup(k.id, e.target.value) : move(k.id, e.target.value as ColumnId))} className="select-chevron h-7 w-full rounded-md border border-input bg-card px-2 text-xs">
                        {columns.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
                {list.length === 0 ? <li className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Chưa có việc</li> : null}
              </ul>
            </section>
          );
        })}
        {byGroup ? (
          <section aria-label="Thêm nhóm công việc" className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed bg-card/50 p-2.5">
            <form onSubmit={(e) => { e.preventDefault(); addGroup(e.currentTarget); }} className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 px-1 text-sm font-medium text-primary" htmlFor="new-group"><Plus className="size-4" aria-hidden />Thêm nhóm công việc</label>
              <input id="new-group" name="name" maxLength={60} placeholder="Tên nhóm, ví dụ: Quay phim" className="h-9 rounded-md border border-input bg-card px-2.5 text-sm" />
              <button className="h-8 self-start rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">Thêm nhóm</button>
            </form>
          </section>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Việc của video tự cập nhật theo bước sản xuất; kéo thẻ video sẽ mở đúng bước cần làm (bàn giao, nộp duyệt, duyệt) thay vì đổi trạng thái trực tiếp. Việc đã xong lâu hoặc bị hoãn/hủy xem ở “Danh sách chờ”.</p>
    </div>
  );
}
