import Link from "next/link";
import { Crown, Download, FileText } from "lucide-react";
import type { ProfileData } from "@/lib/hr-profile";
import { badge, EMPLOYMENT_STATUS, EMPLOYMENT_TYPE, GENDER, PAYROLL, TASK_PRIORITY, TASK_STATUS, TASK_TYPE, WORK_FORM, ATTENDANCE, opts } from "@/lib/status-maps";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/dates";
import { dayIn } from "@/lib/work-board";
import { money } from "@/lib/form-spec";
import { Avatar } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alert";
import { RpcButton } from "@/components/rpc-button";
import { RpcForm } from "@/components/rpc-form";
import { RoleEditor } from "@/components/role-editor";
import { PasswordResetForm } from "@/components/account-forms";
import { DocumentUploadForm } from "@/components/hr/document-upload";
import { TABLE, THEAD } from "@/components/hr/ui";
import { cn } from "@/lib/utils";

export const PROFILE_TABS = [
  ["tong-quan", "Tổng quan"], ["cong-tac", "Công tác"], ["lien-he", "Liên hệ"], ["tai-lieu", "Tài liệu"], ["cong-viec", "Công việc"], ["luong", "Lương & bảo hiểm"], ["tai-khoan", "Tài khoản"],
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number][0];

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{children ?? "—"}</dd></>);
const mask = (s: string | null) => (s ? `${s.slice(0, 3)}•••${s.slice(-3)}` : null);
const KB = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Hồ sơ nhân viên. Dữ liệu đã đi qua RLS: phần không được xem là rỗng; cờ `perms` chỉ quyết định mục nào hiển thị. */
export function StaffProfile({ d, tab, tabHref, today, timezone, selfId }: { d: ProfileData; tab: ProfileTab; tabHref: (t: ProfileTab) => string; today: string; timezone: string; selfId: string }) {
  const p = d.profile;
  const { perms } = d;
  const priv = perms.self || perms.staffAdmin;
  const rev = ["/nhan-su", "/phong-ban"];
  const tabs = PROFILE_TABS.filter(([k]) => (k === "lien-he" || k === "tai-lieu" ? priv : k === "luong" ? perms.payroll : k === "tai-khoan" ? perms.admin : true));
  const active: ProfileTab = tabs.some(([k]) => k === tab) ? tab : "tong-quan";
  const primaryEmail = d.emails.find((e) => e.is_primary);
  const primaryPhone = d.phones.find((x) => x.is_primary);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="staff-profile" data-user={p.id}>
      <header className="flex flex-wrap items-start gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
        <Avatar name={p.name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-muted-foreground" data-testid="profile-code">{p.code}</p>
          <h2 className="text-xl font-semibold leading-tight" data-testid="profile-name">{p.name}</h2>
          <p className="text-sm text-muted-foreground">{p.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badge(EMPLOYMENT_STATUS, p.status)}{badge(WORK_FORM, p.work_form)}{badge(EMPLOYMENT_TYPE, p.type)}
            {!p.active ? <Badge className="bg-red-50 text-red-800 ring-red-300">Tài khoản bị khóa</Badge> : null}
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Các mục hồ sơ">
        {tabs.map(([k, l]) => (
          <Link key={k} href={tabHref(k)} aria-current={active === k ? "page" : undefined} data-testid={`ptab-${k}`}
            className={cn("-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium", active === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</Link>
        ))}
      </nav>

      {active === "tong-quan" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader><CardContent>
            <dl className="grid grid-cols-[8.5rem_1fr] gap-y-2 text-sm">
              <Row k="Mã nhân viên">{p.code}</Row>
              <Row k="Họ tên">{p.name}</Row>
              <Row k="Email công việc">{p.email}</Row>
              <Row k="Chức danh">{p.job_title}</Row>
              <Row k="Trạng thái nhân sự">{badge(EMPLOYMENT_STATUS, p.status)}</Row>
              <Row k="Ngày vào làm">{p.joined_on ? formatDate(p.joined_on) : null}</Row>
              {p.resigned_on ? <Row k="Ngày nghỉ việc">{formatDate(p.resigned_on)}</Row> : null}
              {perms.staffAdmin || perms.self ? <Row k="Vai trò hệ thống"><span className="flex flex-wrap gap-1">{d.roles.map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}</span></Row> : null}
            </dl></CardContent></Card>
          {priv ? (
            <Card><CardHeader><CardTitle>Thông tin cá nhân</CardTitle></CardHeader><CardContent>
              <dl className="grid grid-cols-[8.5rem_1fr] gap-y-2 text-sm" data-testid="personal-info">
                <Row k="Ngày sinh">{d.personal?.date_of_birth ? formatDate(d.personal.date_of_birth) : null}</Row>
                <Row k="Giới tính">{d.personal?.gender ? GENDER[d.personal.gender] : null}</Row>
                <Row k="Địa chỉ">{d.personal?.address}</Row>
                <Row k="CCCD / CMND">{perms.staffAdmin ? d.personal?.id_number : mask(d.personal?.id_number ?? null)}</Row>
                <Row k="Mã số thuế">{d.personal?.tax_code}</Row>
                <Row k="Email chính">{primaryEmail?.email}</Row>
                <Row k="Điện thoại chính">{primaryPhone ? `${primaryPhone.country_code} ${primaryPhone.phone}` : null}</Row>
              </dl>
              {perms.staffAdmin ? (
                <details className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium text-primary">Sửa thông tin cá nhân</summary>
                  <RpcForm rpc="save_staff_personal" fixed={{ p_user: p.id }} submitLabel="Lưu thông tin cá nhân" okMessage="Đã lưu thông tin cá nhân." revalidate={rev} columns={2} className="mt-3" variant="soft"
                    fields={[
                      { name: "p_dob", label: "Ngày sinh", type: "date", defaultValue: d.personal?.date_of_birth ?? null },
                      { name: "p_gender", label: "Giới tính", type: "select", options: Object.entries(GENDER), defaultValue: d.personal?.gender ?? "" },
                      { name: "p_address", label: "Địa chỉ", wide: true, defaultValue: d.personal?.address ?? "" },
                      { name: "p_id_number", label: "CCCD / CMND", defaultValue: d.personal?.id_number ?? "" },
                      { name: "p_tax_code", label: "Mã số thuế", defaultValue: d.personal?.tax_code ?? "" },
                    ]} /></details>
              ) : null}
            </CardContent></Card>
          ) : null}
        </div>
      ) : null}

      {active === "cong-tac" ? (
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Phòng ban & chức vụ hiện tại</CardTitle></CardHeader><CardContent>
            {d.assignments.length === 0 ? <EmptyState title="Chưa thuộc phòng ban nào" description="Thêm nhân viên vào phòng ở trang Phòng ban." /> : (
              <div className={TABLE}><table className="w-full min-w-[480px] text-sm" data-testid="assignments">
                <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Phòng ban</th><th className="px-3.5 py-2.5">Chức vụ</th><th className="px-3.5 py-2.5">Quản lý phòng</th></tr></thead>
                <tbody className="divide-y">{d.assignments.map((a) => (
                  <tr key={a.dept_id} data-dept={a.dept_id}>
                    <td className="px-3.5 py-2.5"><Link href={`/phong-ban/${a.dept_id}?tab=thanh-vien`} className="font-medium text-primary hover:underline">{a.dept}</Link></td>
                    <td className="px-3.5 py-2.5"><span className="flex flex-wrap gap-1">{a.positions.length ? a.positions.map((x) => <Badge key={x.id} className="bg-muted text-foreground/80 ring-border">{x.name}</Badge>) : <span className="text-muted-foreground">Chưa có chức vụ</span>}</span></td>
                    <td className="px-3.5 py-2.5">{a.is_manager ? <span className="inline-flex items-center gap-1 text-amber-700"><Crown className="size-3.5" aria-hidden />Quản lý{a.manager_position ? ` · ${a.manager_position}` : ""}</span> : "—"}</td>
                  </tr>))}</tbody></table></div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Chức vụ trong phòng, người quản lý phòng và vai trò hệ thống là ba khái niệm khác nhau: chức vụ mô tả công việc trong phòng, quản lý phòng là người phụ trách phòng, vai trò hệ thống quyết định quyền trong ứng dụng.</p>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Hồ sơ làm việc</CardTitle></CardHeader><CardContent>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <Row k="Hình thức làm việc">{badge(WORK_FORM, p.work_form)}</Row>
              <Row k="Loại nhân sự / hợp đồng">{badge(EMPLOYMENT_TYPE, p.type)}</Row>
              <Row k="Ngày vào làm">{p.joined_on ? formatDate(p.joined_on) : null}</Row>
              <Row k="Trạng thái nhân sự">{badge(EMPLOYMENT_STATUS, p.status)}</Row>
            </dl>
            {perms.staffAdmin ? (
              <details className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium text-primary">Sửa hồ sơ làm việc</summary>
                <RpcForm rpc="save_staff_profile" fixed={{ p_user: p.id }} submitLabel="Lưu hồ sơ làm việc" okMessage="Đã lưu hồ sơ làm việc." revalidate={rev} columns={2} className="mt-3" variant="soft"
                  fields={[
                    { name: "p_code", label: "Mã nhân viên", required: true, defaultValue: p.code },
                    { name: "p_status", label: "Trạng thái nhân sự", type: "select", required: true, options: opts(EMPLOYMENT_STATUS), defaultValue: p.status },
                    { name: "p_work_form", label: "Hình thức làm việc", type: "select", required: true, options: opts(WORK_FORM), defaultValue: p.work_form },
                    { name: "p_type", label: "Loại nhân sự / hợp đồng", type: "select", required: true, options: opts(EMPLOYMENT_TYPE), defaultValue: p.type },
                    { name: "p_joined_on", label: "Ngày vào làm", type: "date", defaultValue: p.joined_on },
                    { name: "p_resigned_on", label: "Ngày nghỉ việc", type: "date", defaultValue: p.resigned_on, hint: "Chỉ dùng khi trạng thái là Đã nghỉ việc" },
                  ]} /></details>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">Trạng thái nhân sự (hồ sơ) khác trạng thái tài khoản đăng nhập: nghỉ việc không tự khóa tài khoản — khóa ở mục “Tài khoản”.</p>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Lịch sử công tác</CardTitle></CardHeader><CardContent>
            {perms.audit ? (
              d.audit.length ? <ol className="flex flex-col gap-1.5 text-sm" data-testid="audit-list">{d.audit.map((a) => <li key={a.id}><span className="text-muted-foreground">{formatDateTime(a.created_at, timezone)} · {d.actors.get(a.actor_id ?? "") ?? "Hệ thống"}</span> — {a.action}</li>)}</ol> : <p className="text-sm text-muted-foreground">Chưa có thay đổi được ghi nhật ký.</p>
            ) : <p className="text-sm text-muted-foreground">Chỉ hiển thị hồ sơ hiện tại.</p>}
            <p className="mt-3 text-xs text-muted-foreground">Chưa có bảng lịch sử điều chuyển (cần bảng employment_history gồm nhân viên, phòng, chức vụ, từ ngày, đến ngày); hiện lịch sử lấy từ nhật ký hệ thống nếu bạn có quyền xem.</p>
          </CardContent></Card>
        </div>
      ) : null}

      {active === "lien-he" && priv ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Email cá nhân</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
            {d.emails.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có email cá nhân.</p> : (
              <ul className="flex flex-col gap-2" data-testid="email-list">{d.emails.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-email={e.email}>
                  <span className="min-w-0 flex-1 break-all">{e.email}</span>
                  {e.is_primary ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Chính</Badge> : <RpcButton rpc="set_primary_user_email" args={{ p_id: e.id }} label="Đặt làm chính" variant="ghost" revalidate={rev} />}
                  <RpcButton rpc="save_user_email" args={{ p_id: e.id, p_user: p.id, p_primary: e.is_primary }} prompt={{ text: "Email mới", arg: "p_email", required: true }} label="Sửa" variant="ghost" revalidate={rev} />
                  <RpcButton rpc="delete_user_email" args={{ p_id: e.id }} label="Xóa" variant="ghost" confirm="Xóa email này?" revalidate={rev} />
                </li>))}</ul>
            )}
            <RpcForm rpc="save_user_email" fixed={{ p_id: null, p_user: p.id }} submitLabel="Thêm email" revalidate={rev} resetOnSuccess columns={1} variant="soft"
              fields={[{ name: "p_email", label: "Email cá nhân", type: "email", required: true }, { name: "p_primary", label: "Đặt làm email chính", type: "checkbox", placeholder: "Đặt làm email chính" }]} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Số điện thoại</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
            {d.phones.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có số điện thoại.</p> : (
              <ul className="flex flex-col gap-2" data-testid="phone-list">{d.phones.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-phone={`${x.country_code}${x.phone}`}>
                  <span className="min-w-0 flex-1">{x.country_code} {x.phone}</span>
                  {x.is_primary ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Chính</Badge> : <RpcButton rpc="set_primary_user_phone" args={{ p_id: x.id }} label="Đặt làm chính" variant="ghost" revalidate={rev} />}
                  <RpcButton rpc="delete_user_phone" args={{ p_id: x.id }} label="Xóa" variant="ghost" confirm="Xóa số điện thoại này?" revalidate={rev} />
                </li>))}</ul>
            )}
            <RpcForm rpc="save_user_phone" fixed={{ p_id: null, p_user: p.id }} submitLabel="Thêm số điện thoại" revalidate={rev} resetOnSuccess columns={2} variant="soft"
              fields={[{ name: "p_country", label: "Mã quốc gia", defaultValue: "+84", required: true }, { name: "p_phone", label: "Số điện thoại", required: true }, { name: "p_primary", label: "Đặt làm số chính", type: "checkbox", placeholder: "Đặt làm số chính" }]} />
          </CardContent></Card>
        </div>
      ) : null}

      {active === "tai-lieu" && priv ? (
        <Card><CardHeader><CardTitle>Tài liệu hồ sơ ({d.documents.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
          {d.documents.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có tài liệu.</p> : (
            <div className={TABLE}><table className="w-full min-w-[480px] text-sm" data-testid="document-list">
              <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Tên tệp</th><th className="px-3.5 py-2.5">Định dạng</th><th className="px-3.5 py-2.5">Dung lượng</th><th className="px-3.5 py-2.5">Ngày tải</th><th /></tr></thead>
              <tbody className="divide-y">{d.documents.map((x) => (
                <tr key={x.id}>
                  <td className="px-3.5 py-2.5"><span className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" aria-hidden />{x.name}</span></td>
                  <td className="px-3.5 py-2.5 text-muted-foreground">{(x.name.split(".").pop() ?? x.mime).toUpperCase()}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{KB(x.size_bytes)}</td>
                  <td className="px-3.5 py-2.5">{formatDate(x.created_at.slice(0, 10))}</td>
                  <td className="px-3.5 py-2.5"><div className="flex justify-end gap-1.5">
                    <a href={`/nhan-su/tai-lieu/${x.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"><Download className="size-3.5" aria-hidden />Tải về</a>
                    {perms.staffAdmin ? <RpcButton rpc="delete_user_document" args={{ p_id: x.id }} label="Xóa" variant="ghost" confirm={`Xóa tài liệu ${x.name}?`} revalidate={rev} /> : null}
                  </div></td>
                </tr>))}</tbody></table></div>
          )}
          {perms.staffAdmin ? <DocumentUploadForm userId={p.id} /> : null}
        </CardContent></Card>
      ) : null}

      {active === "cong-viec" ? (() => {
        const open = d.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
        const overdue = (t: (typeof d.tasks)[number]) => !!t.scheduled_at && open.includes(t) && (dayIn(t.scheduled_at, timezone) ?? "9999") < today;
        return (
          <Card><CardHeader><CardTitle>Công việc được giao ({d.tasks.length})</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground" data-testid="task-summary">{open.length} việc đang mở · {d.tasks.filter(overdue).length} quá hạn · chỉ hiển thị việc bạn được phép xem.</p>
            {d.tasks.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có công việc nào được giao (hoặc bạn không có quyền xem).</p> : (
              <div className={TABLE}><table className="w-full min-w-[640px] text-sm" data-testid="profile-tasks">
                <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Công việc</th><th className="px-3.5 py-2.5">Loại</th><th className="px-3.5 py-2.5">Ưu tiên</th><th className="px-3.5 py-2.5">Trạng thái</th><th className="px-3.5 py-2.5">Hạn / lịch</th><th className="px-3.5 py-2.5">Nhắc</th><th className="px-3.5 py-2.5">Giao cho</th></tr></thead>
                <tbody className="divide-y">{d.tasks.map((t) => (
                  <tr key={t.id} data-task={t.id}>
                    <td className="px-3.5 py-2.5"><Link href={`/cong-viec?tab=cho&v=tat-ca&the=${t.id}`} className="font-medium text-primary hover:underline">{t.title}</Link></td>
                    <td className="px-3.5 py-2.5 text-muted-foreground">{t.video_id ? "Đầu việc video" : TASK_TYPE[t.task_type] ?? t.task_type}</td>
                    <td className="px-3.5 py-2.5">{badge(TASK_PRIORITY, t.priority)}</td>
                    <td className="px-3.5 py-2.5">{badge(TASK_STATUS, t.status)}</td>
                    <td className="px-3.5 py-2.5">{t.scheduled_at ? <span className={overdue(t) ? "font-medium text-red-700" : undefined}>{formatDateTime(t.scheduled_at, timezone)}{overdue(t) ? " · Quá hạn" : ""}</span> : "—"}</td>
                    <td className="px-3.5 py-2.5 text-muted-foreground">{t.remind_before_minutes != null ? `${t.remind_before_minutes} phút` : "—"}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{t.assignees} người</td>
                  </tr>))}</tbody></table></div>
            )}
            <p className="text-xs text-muted-foreground">Tệp đính kèm công việc chưa có trong hệ thống (cần bảng task_attachments).</p>
          </CardContent></Card>
        );
      })() : null}

      {active === "luong" && perms.payroll ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Hồ sơ lương</CardTitle></CardHeader><CardContent>
              {d.salary ? (
                <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm" data-testid="salary-info">
                  <Row k="Lương cơ bản">{money(d.salary.base_salary)}</Row>
                  <Row k="Mức đóng bảo hiểm">{d.salary.insurance_base === null ? "Theo lương cơ bản" : money(d.salary.insurance_base)}</Row>
                  <Row k="Ngân hàng">{d.salary.bank_name}</Row>
                  <Row k="Số tài khoản">{d.salary.account_tail ? `•••• ${d.salary.account_tail}` : null}</Row>
                  <Row k="Chủ tài khoản">{d.salary.account_name}</Row>
                </dl>
              ) : <p className="text-sm text-muted-foreground">Chưa có hồ sơ lương.</p>}
              <p className="mt-3 text-xs text-muted-foreground">Chỉnh lương và bảo hiểm tại <Link className="text-primary underline" href="/luong">Bảng lương</Link>.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Chấm công tháng {today.slice(5, 7)}/{today.slice(0, 4)}</CardTitle></CardHeader><CardContent>
              {Object.keys(d.attendance).length === 0 ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu chấm công trong tháng.</p> : (
                <ul className="flex flex-wrap gap-2" data-testid="attendance-summary">{Object.entries(d.attendance).map(([k, n]) => <li key={k} className="flex items-center gap-1.5 text-sm">{badge(ATTENDANCE, k)}<span className="tabular-nums">{n}</span></li>)}</ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground"><Link className="text-primary underline" href={`/cham-cong?m=${today.slice(0, 7)}`}>Mở bảng chấm công</Link> để xem chi tiết từng ngày.</p>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Bảng lương theo kỳ</CardTitle></CardHeader><CardContent>
            {d.payLines.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có kỳ lương nào (hoặc kỳ lương chưa được duyệt).</p> : (
              <div className={TABLE}><table className="w-full min-w-[520px] text-sm" data-testid="pay-lines">
                <thead className={THEAD}><tr><th className="px-3.5 py-2.5">Kỳ</th><th className="px-3.5 py-2.5">Ngày công</th><th className="px-3.5 py-2.5">Bảo hiểm</th><th className="px-3.5 py-2.5">Thuế</th><th className="px-3.5 py-2.5">Thực nhận</th><th className="px-3.5 py-2.5">Trạng thái</th></tr></thead>
                <tbody className="divide-y">{d.payLines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3.5 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/luong/${l.period_id}`}>{String(l.month).padStart(2, "0")}/{l.year}</Link></td>
                    <td className="px-3.5 py-2.5 tabular-nums">{l.worked_days}</td><td className="px-3.5 py-2.5 tabular-nums">{money(l.insurance)}</td><td className="px-3.5 py-2.5 tabular-nums">{money(l.tax)}</td>
                    <td className="px-3.5 py-2.5 font-medium tabular-nums">{money(l.net_pay)}</td><td className="px-3.5 py-2.5">{badge(PAYROLL, l.status)}</td>
                  </tr>))}</tbody></table></div>
            )}
          </CardContent></Card>
        </div>
      ) : null}

      {active === "tai-khoan" && perms.admin ? (
        <Card><CardHeader><CardTitle>Tài khoản đăng nhập</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <Row k="Email đăng nhập">{p.email}</Row>
            <Row k="Trạng thái tài khoản">{p.active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Đang hoạt động</Badge> : <Badge className="bg-red-50 text-red-800 ring-red-300">Đã khóa</Badge>}</Row>
            <Row k="Vai trò hệ thống"><span className="flex flex-wrap gap-1">{d.roles.map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}</span></Row>
          </dl>
          <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
            <RoleEditor userId={p.id} roles={d.roles} active={p.active} self={p.id === selfId} />
            <PasswordResetForm userId={p.id} />
          </div>
          <p className="text-xs text-muted-foreground">Mật khẩu và phiên đăng nhập do hệ thống xác thực quản lý; không hiển thị ở đây. Khóa tài khoản chặn đăng nhập và mọi truy cập dữ liệu ngay lập tức.</p>
        </CardContent></Card>
      ) : null}
    </div>
  );
}
