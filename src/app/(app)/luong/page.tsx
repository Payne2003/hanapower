import type { Metadata } from "next";
import Link from "next/link";
import { requireContext, can } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { BONUS, PAYROLL, badge } from "@/lib/status-maps";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/disclosure";
import { DataTable } from "@/components/data-table";
import { RpcForm } from "@/components/rpc-form";
import { RpcButton } from "@/components/rpc-button";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Bảng lương" };

const TABS: [string, string][] = [["ky-luong", "Kỳ lương"], ["ho-so", "Hồ sơ lương"], ["thuong", "Thưởng dự án"], ["cai-dat", "Thiết lập"]];

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [ctx, sp] = await Promise.all([requireContext(), searchParams]);
  const view = can(ctx, "payroll.view");
  const supabase = await createSupabaseServerClient();
  if (!view) return <MyPayslips ctxUser={ctx.user_id} supabase={supabase} />;
  const tab = TABS.some(([k]) => k === sp.tab) ? String(sp.tab) : "ky-luong";
  const manage = can(ctx, "payroll.manage"), approve = can(ctx, "payroll.approve");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Bảng lương" description="Chấm công → nhân sự lập & kiểm tra bảng lương → kế toán duyệt → chi trả. Thuế TNCN nhập tay (hệ thống chưa tự tính)." />
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Phần lương">
        {TABS.map(([k, l]) => <Link key={k} href={`/luong?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>{l}</Link>)}
      </nav>
      {tab === "ky-luong" ? <Periods supabase={supabase} manage={manage} today={ctx.today} /> : null}
      {tab === "ho-so" ? <Profiles supabase={supabase} manage={manage} /> : null}
      {tab === "thuong" ? <Bonuses supabase={supabase} approve={approve} /> : null}
      {tab === "cai-dat" ? <Settings supabase={supabase} manage={manage} /> : null}
    </div>
  );
}

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function MyPayslips({ ctxUser, supabase }: { ctxUser: string; supabase: SB }) {
  const [{ data: lines }, { data: periods }, { data: prof }] = await Promise.all([
    supabase.from("payroll_lines").select("*").eq("user_id", ctxUser),
    supabase.from("payroll_periods").select("id, year, month, status, paid_on"),
    supabase.from("salary_profiles").select("base_salary").eq("user_id", ctxUser).maybeSingle(),
  ]);
  type Slip = Row & { id?: string; period?: Row };
  const pm = new Map(((periods ?? []) as Row[]).map((p) => [String(p.id), p]));
  const key = (r: Slip) => `${r.period?.year}${String(r.period?.month).padStart(2, "0")}`;
  const rows: Slip[] = ((lines ?? []) as Row[]).map((l) => ({ ...l, period: pm.get(String(l.period_id)) } as Slip)).sort((x, y) => key(y).localeCompare(key(x)));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Phiếu lương của tôi" description={prof ? `Lương cơ bản hiện tại: ${money(prof.base_salary as number)}` : "Chưa có hồ sơ lương — liên hệ nhân sự."} />
      <DataTable rows={rows} href={(r) => `/luong/${r.period_id}`} empty={<EmptyState title="Chưa có phiếu lương" description="Phiếu lương hiện sau khi kế toán duyệt bảng lương của kỳ." />}
        cols={[{ label: "Kỳ", cell: (r) => `Tháng ${r.period?.month}/${r.period?.year}` }, { label: "Công", cell: (r) => String(r.worked_days) }, { label: "Thực nhận", cell: (r) => <strong>{money(r.net_pay as number)}</strong>, className: "text-right" }, { label: "Trạng thái", cell: (r) => badge(PAYROLL, r.period?.status) }]} />
    </div>
  );
}

async function Periods({ supabase, manage, today }: { supabase: SB; manage: boolean; today: string }) {
  const [{ data }, { data: lines }] = await Promise.all([
    supabase.from("payroll_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
    supabase.from("payroll_lines").select("period_id, net_pay"),
  ]);
  const tot = new Map<string, { n: number; sum: number }>();
  for (const l of lines ?? []) { const t = tot.get(l.period_id as string) ?? { n: 0, sum: 0 }; t.n++; t.sum += Number(l.net_pay); tot.set(l.period_id as string, t); }
  const rows = (data ?? []) as Row[];
  return (
    <>
      {manage ? (
        <Disclosure summary="Tạo / tính lại bảng lương một tháng">
          <RpcForm rpc="generate_payroll" submitLabel="Tạo bảng lương" revalidate={["/luong"]} columns={2} redirectTo="/luong/{}"
            fields={[{ name: "p_year", label: "Năm", type: "number", as: "number", required: true, defaultValue: Number(today.slice(0, 4)) }, { name: "p_month", label: "Tháng", type: "number", as: "number", required: true, defaultValue: Number(today.slice(5, 7)) }]} />
          <p className="mt-2 text-xs text-muted-foreground">Lấy lương cơ bản, phụ cấp, công thực tế từ chấm công, bảo hiểm và thưởng dự án đã duyệt của tháng. Chỉ tạo / tính lại được khi kỳ ở trạng thái nháp.</p>
        </Disclosure>
      ) : null}
      <DataTable rows={rows as (Row & { id: string })[]} href={(r) => `/luong/${r.id}`} testId="list-payroll" empty={<EmptyState title="Chưa có kỳ lương" description="Tạo bảng lương cho tháng đầu tiên." />}
        cols={[{ label: "Kỳ", cell: (r) => <span className="font-medium">Tháng {String(r.month)}/{String(r.year)}</span> }, { label: "Trạng thái", cell: (r) => badge(PAYROLL, r.status) }, { label: "Số người", cell: (r) => tot.get(String(r.id))?.n ?? 0, className: "text-right" },
          { label: "Tổng thực nhận", cell: (r) => <strong>{money(tot.get(String(r.id))?.sum ?? 0)}</strong>, className: "text-right" }, { label: "Chi trả", cell: (r) => formatDate(r.paid_on as string), className: "hidden sm:table-cell" }]} />
    </>
  );
}

async function Profiles({ supabase, manage }: { supabase: SB; manage: boolean }) {
  const [{ data }, { data: al }, L, { data: cu }] = await Promise.all([
    supabase.from("salary_profiles").select("*"), supabase.from("salary_allowances").select("*").eq("is_active", true), loadLookups(["people"]),
    supabase.from("user_roles").select("user_id").eq("role", "collaborator"),
  ]);
  const collab = new Set((cu ?? []).map((x) => x.user_id as string));
  const rows = ((data ?? []) as Row[]);
  const have = new Set(rows.map((r) => r.user_id as string));
  const allow = new Map<string, Row[]>();
  for (const a of (al ?? []) as Row[]) allow.set(a.user_id as string, [...(allow.get(a.user_id as string) ?? []), a]);
  return (
    <>
      {manage ? (
        <Disclosure summary="Thêm / sửa hồ sơ lương">
          <RpcForm rpc="save_salary_profile" submitLabel="Lưu hồ sơ lương" revalidate={["/luong"]} columns={3}
            fields={[
              { name: "p_user", label: "Nhân viên", type: "select", as: "uuid", required: true, options: (L.people ?? []).filter(([v]) => !collab.has(v)) },
              { name: "p_base", label: "Lương cơ bản (₫/tháng)", type: "number", required: true }, { name: "p_insurance_base", label: "Mức đóng bảo hiểm (để trống = lương cơ bản)", type: "number" },
              { name: "p_bank", label: "Ngân hàng" }, { name: "p_account_no", label: "Số tài khoản" }, { name: "p_account_name", label: "Chủ tài khoản" },
            ]} />
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-medium">Thêm phụ cấp</p>
            <RpcForm rpc="save_allowance" fixed={{ p_id: null }} submitLabel="Thêm phụ cấp" revalidate={["/luong"]} columns={3} resetOnSuccess
              fields={[{ name: "p_user", label: "Nhân viên", type: "select", as: "uuid", required: true, options: (L.people ?? []).filter(([v]) => have.has(v)) }, { name: "p_name", label: "Tên phụ cấp", required: true }, { name: "p_amount", label: "Số tiền (₫/tháng)", type: "number", required: true }]} />
          </div>
        </Disclosure>
      ) : null}
      <DataTable rows={rows as (Row & { id: string })[]} testId="list-salary" empty={<EmptyState title="Chưa có hồ sơ lương" />}
        cols={[{ label: "Nhân viên", cell: (r) => <span className="font-medium">{nameOf(L, "people", r.user_id)}</span> }, { label: "Lương cơ bản", cell: (r) => money(r.base_salary as number), className: "text-right" },
          { label: "Phụ cấp", cell: (r) => (allow.get(String(r.user_id)) ?? []).map((a) => `${a.name}: ${money(a.amount as number)}`).join("; ") || "—", className: "hidden md:table-cell" },
          { label: "Tài khoản NH", cell: (r) => (r.account_no ? `${r.bank_name ?? ""} ${r.account_no}` : "—"), className: "hidden lg:table-cell" }]} />
    </>
  );
}

async function Bonuses({ supabase, approve }: { supabase: SB; approve: boolean }) {
  const [{ data }, L, { data: pj }] = await Promise.all([supabase.from("project_bonuses").select("*").order("created_at", { ascending: false }).limit(100), loadLookups(["people"]), supabase.from("projects").select("id, code")]);
  const pc = new Map((pj ?? []).map((p) => [p.id as string, p.code as string]));
  return (
    <DataTable rows={(data ?? []) as (Row & { id: string })[]} empty={<EmptyState title="Chưa có đề xuất thưởng" description="Quản lý dự án đề xuất thưởng trong tab Thưởng của dự án." />}
      cols={[{ label: "Người nhận", cell: (r) => nameOf(L, "people", r.user_id) }, { label: "Dự án", cell: (r) => <Link className="text-primary hover:underline" href={`/du-an/${r.project_id}?tab=thuong`}>{pc.get(String(r.project_id)) ?? "—"}</Link> }, { label: "Tháng", cell: (r) => String(r.month_date).slice(0, 7) },
        { label: "Số tiền", cell: (r) => money(r.amount as number), className: "text-right" }, { label: "Trạng thái", cell: (r) => badge(BONUS, r.status) },
        ...(approve ? [{ label: "", cell: (r: Row) => r.status === "requested" ? (<div className="flex gap-1.5"><RpcButton rpc="decide_project_bonus" args={{ p_id: r.id, p_approve: true }} label="Duyệt" variant="soft" revalidate={["/luong"]} /><RpcButton rpc="decide_project_bonus" args={{ p_id: r.id, p_approve: false }} prompt={{ text: "Lý do từ chối:", arg: "p_reason", required: true }} label="Từ chối" variant="ghost" revalidate={["/luong"]} /></div>) : null }] : [])]} />
  );
}

async function Settings({ supabase, manage }: { supabase: SB; manage: boolean }) {
  const { data } = await supabase.from("payroll_settings").select("*").maybeSingle();
  return (
    <Card>
      <CardHeader><CardTitle>Thiết lập chung</CardTitle></CardHeader>
      <CardContent>
        <RpcForm rpc="save_payroll_settings" submitLabel="Lưu thiết lập" revalidate={["/luong"]} columns={2}
          fields={[{ name: "p_standard_days", label: "Số công chuẩn / tháng", type: "number", required: true, defaultValue: Number(data?.standard_days ?? 26), hint: "Lương theo công = lương cơ bản × công thực tế ÷ công chuẩn" },
            { name: "p_insurance_rate", label: "Tỷ lệ bảo hiểm người lao động (%)", type: "number", required: true, defaultValue: Number(data?.insurance_rate ?? 10.5), hint: "Mặc định 10,5% (BHXH 8% + BHYT 1,5% + BHTN 1%). Kiểm tra lại theo quy định hiện hành." }]} />
        {!manage ? <p className="mt-2 text-xs text-muted-foreground">Bạn chỉ có quyền xem; nhân sự mới được sửa.</p> : null}
      </CardContent>
    </Card>
  );
}
