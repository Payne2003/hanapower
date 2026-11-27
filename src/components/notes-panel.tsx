import { CheckSquare, History, Pin, StickyNote } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { badge, TASK_STATUS } from "@/lib/status-maps";
import { LEAD_STATUS, STAGE_OPP } from "@/lib/entities";
import { Avatar } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { Disclosure } from "@/components/disclosure";
import { cn } from "@/lib/utils";

type Item = { kind: "note" | "audit" | "task"; at: string; actor: string | null; title: string; detail: Record<string, unknown>; id: string | null; author_id: string | null; pinned: boolean };

const ST: Record<string, string> = { draft: "Nháp", pending_approval: "Chờ duyệt", approved: "Đã duyệt", sent: "Đã gửi khách", accepted: "Khách chấp nhận", rejected: "Khách từ chối", expired: "Hết hạn", pending: "Chờ hiệu lực", active: "Đang hiệu lực", terminated: "Đã chấm dứt", cancelled: "Đã hủy",
  planning: "Lên kế hoạch", in_progress: "Đang thực hiện", acceptance: "Nghiệm thu", completed: "Hoàn thành", on_hold: "Tạm dừng" };
const stage = (v: unknown) => STAGE_OPP[String(v)]?.[0] ?? LEAD_STATUS[String(v)]?.[0] ?? ST[String(v)] ?? String(v ?? "");

/** Diễn giải một dòng nhật ký thao tác thành câu tiếng Việt. */
export function auditText(action: string, d: Record<string, unknown>): string {
  const move = d.from !== undefined && d.to !== undefined ? `: ${stage(d.from)} → ${stage(d.to)}` : "";
  switch (action) {
    case "lead.convert": return "Chuyển đổi lead thành tài khoản + liên hệ" + (d.opportunity ? " + cơ hội" : "");
    case "lead.status": return `Đổi trạng thái lead${move}`;
    case "opportunity.stage": return `Đổi giai đoạn cơ hội${move}`;
    case "quote.create": return `Tạo báo giá ${d.code ?? ""}`.trim();
    case "quote.status": return `Báo giá đổi trạng thái${move}`;
    case "contract.create": return `Lập hợp đồng ${d.code ?? ""}`.trim();
    case "contract.status": return `Hợp đồng đổi trạng thái${move}`;
    case "contract.update": return "Cập nhật thông tin hợp đồng";
    case "order.status": return `Đơn hàng đổi trạng thái${move}`;
    case "project.create": return `Tạo dự án ${d.code ?? ""}`.trim();
    case "project.update": return "Cập nhật thông tin dự án";
    case "project.stage": return `Dự án đổi trạng thái${move}`;
    case "project.members": return "Cập nhật thành viên dự án";
    case "milestone.accept": return `Nghiệm thu mốc "${d.name ?? ""}"`;
    case "milestone.unaccept": return `Hủy nghiệm thu mốc "${d.name ?? ""}"`;
    case "milestone.invoice": return "Xuất hóa đơn cho mốc thanh toán";
    case "milestone.paid": return `Đã thu tiền mốc thanh toán${d.amount ? ` (${new Intl.NumberFormat("vi-VN").format(Number(d.amount))} ₫)` : ""}`;
    default: return action;
  }
}

/** Ghi chú, lịch sử hoạt động và công việc liên quan của một bản ghi — giống tab "Hoạt động" của CRM. */
export async function NotesPanel({ type, id, canWrite, userId, people, isManager }: { type: "lead" | "account" | "contact" | "opportunity" | "project"; id: string; canWrite: boolean; userId: string; people: [string, string][]; isManager: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("record_timeline", { p_type: type, p_id: id, p_limit: 80 });
  const items = (data ?? []) as Item[];
  const rev = [`/${{ lead: "lead", account: "tai-khoan", contact: "lien-he", opportunity: "co-hoi", project: "du-an" }[type]}/${id}`];
  const tasks = items.filter((i) => i.kind === "task");
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4 text-primary" aria-hidden />Ghi chú & hoạt động</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite ? (
          <div className="flex flex-col gap-3">
            <RpcForm rpc="add_note" fixed={{ p_type: type, p_id: id }} submitLabel="Thêm ghi chú" revalidate={rev} resetOnSuccess columns={1} okMessage="Đã thêm ghi chú."
              fields={[{ name: "p_body", label: "Ghi chú mới", type: "textarea", required: true, placeholder: "Nội dung trao đổi với khách, việc cần nhớ…" }, { name: "p_pinned", label: "Ghim", type: "checkbox", placeholder: "Ghim lên đầu" }]} />
            {type !== "project" ? (
              <Disclosure summary={`Thêm công việc liên quan${tasks.length ? ` (đang có ${tasks.length})` : ""}`} icon={<CheckSquare className="size-4" aria-hidden />}>
                <RpcForm rpc="save_task" fixed={{ p_id: null, p_related_type: type, p_related_id: id }} submitLabel="Thêm công việc" revalidate={[...rev, "/cong-viec"]} resetOnSuccess columns={2}
                  fields={[
                    { name: "p_title", label: "Việc cần làm", required: true, wide: true },
                    { name: "p_type", label: "Loại", type: "select", required: true, defaultValue: "call", options: [["to_do", "Việc cần làm"], ["call", "Gọi điện"], ["email", "Gửi email"], ["meeting", "Họp"], ["appointment", "Cuộc hẹn"], ["visit", "Thăm khách"]] },
                    { name: "p_scheduled_at", label: "Hạn / giờ hẹn", type: "datetime" },
                    { name: "p_assignees", label: "Giao cho", type: "checks", options: people, defaultValue: [userId] },
                  ]} />
              </Disclosure>
            ) : null}
          </div>
        ) : null}
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có ghi chú hay hoạt động nào.</p> : (
          <ol className="flex flex-col gap-3" data-testid="timeline">
            {items.map((i, idx) => (
              <li key={`${i.kind}${i.id ?? idx}${i.at}`} className={cn("flex gap-3 rounded-lg p-2.5", i.pinned && "bg-amber-50/70")}>
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", i.kind === "note" ? "bg-primary-soft text-primary" : i.kind === "task" ? "bg-sky-50 text-sky-700" : "bg-muted text-muted-foreground")} aria-hidden>
                  {i.kind === "note" ? <StickyNote className="size-4" /> : i.kind === "task" ? <CheckSquare className="size-4" /> : <History className="size-4" />}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  {i.kind === "note" ? <p className="whitespace-pre-wrap">{i.title}</p>
                    : i.kind === "task" ? <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.title}</span>{badge(TASK_STATUS, i.detail.status)}</p>
                    : <p className="text-foreground/85">{auditText(i.title, i.detail)}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {i.actor ? <span className="inline-flex items-center gap-1"><Avatar name={i.actor} className="size-4 text-[8px]" />{i.actor}</span> : null}
                    <span>{formatDateTime(i.at)}</span>{i.pinned ? <span className="inline-flex items-center gap-0.5 text-amber-700"><Pin className="size-3" aria-hidden />Đã ghim</span> : null}
                  </p>
                </div>
                {i.kind === "note" && i.id && canWrite ? (
                  <div className="flex shrink-0 items-start gap-1">
                    <RpcButton rpc="pin_note" args={{ p_id: i.id, p_pinned: !i.pinned }} label={i.pinned ? "Bỏ ghim" : "Ghim"} variant="ghost" revalidate={rev} />
                    {(i.author_id === userId || isManager) ? <RpcButton rpc="delete_note" args={{ p_id: i.id }} label="Xóa" variant="ghost" confirm="Xóa ghi chú này?" revalidate={rev} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
