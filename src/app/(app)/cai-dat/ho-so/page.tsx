import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Crown, KeyRound, Pencil } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { getProfile } from "@/lib/hr-profile";
import { getRequests } from "@/lib/hr-docs";
import { avatarSrc } from "@/lib/avatar";
import { badge, EMPLOYMENT_STATUS, EMPLOYMENT_TYPE, GENDER, WORK_FORM } from "@/lib/status-maps";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import { money } from "@/lib/form-spec";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/disclosure";
import { AvatarUploader } from "@/components/self/avatar-uploader";
import { MyAddressForm, MyContactForms } from "@/components/self/contact-forms";
import { DocRequests } from "@/components/hr/doc-requests";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Hồ sơ của tôi" };

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{children ?? "—"}</dd></>);

export default async function MyProfilePage() {
  const ctx = await requireContext();
  const d = await getProfile(ctx, ctx.user_id);
  if (!d) return <EmptyState title="Không tìm thấy hồ sơ" description="Tài khoản của bạn chưa có hồ sơ nhân sự. Liên hệ quản trị viên." />;
  const requests = ctx.roles.includes("collaborator") ? [] : await getRequests(ctx.user_id);
  const p = d.profile;
  const open = requests.filter((r) => r.status === "pending" || r.status === "rejected").length;
  const primaryEmail = d.emails.find((e) => e.is_primary);
  const primaryPhone = d.phones.find((x) => x.is_primary);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-testid="my-profile">
      <Link href="/cai-dat" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Cài đặt</Link>
      <PageHeader title="Hồ sơ của tôi" description="Xem hồ sơ nhân sự của bạn, cập nhật ảnh đại diện, thông tin liên hệ và nộp tài liệu HR yêu cầu." />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <AvatarUploader name={p.name} src={avatarSrc(p.id, p.avatar)} />
          <div className="border-t pt-4">
            <p className="font-mono text-xs text-muted-foreground" data-testid="my-code">{p.code}</p>
            <h2 className="text-xl font-semibold" data-testid="my-name">{p.name}</h2>
            <p className="text-sm text-muted-foreground">{p.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{badge(EMPLOYMENT_STATUS, p.status)}{badge(WORK_FORM, p.work_form)}{badge(EMPLOYMENT_TYPE, p.type)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Thông tin công việc</CardTitle><CardDescription>Do doanh nghiệp quản lý — liên hệ HR nếu cần chỉnh sửa.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2.5 text-sm" data-testid="work-info">
              <Row k="Mã nhân viên">{p.code}</Row>
              <Row k="Email đăng nhập">{p.email}</Row>
              <Row k="Phòng ban · chức vụ">
                {d.assignments.length === 0 ? "Chưa thuộc phòng ban" : (
                  <ul className="flex flex-col gap-1.5">{d.assignments.map((a) => (
                    <li key={a.dept_id} className="flex flex-wrap items-center gap-1.5">{a.dept}{a.is_manager ? <Crown className="size-3.5 text-amber-600" aria-label="Quản lý phòng" /> : null}
                      {a.positions.length ? a.positions.map((x) => <Badge key={x.id} className="bg-muted text-foreground/80 ring-border">{x.name}</Badge>) : <span className="text-xs text-muted-foreground">chưa có chức vụ</span>}</li>))}</ul>
                )}
              </Row>
              <Row k="Vai trò hệ thống"><span className="flex flex-wrap gap-1">{d.roles.map((r) => <Badge key={r} className="bg-primary-soft text-primary ring-primary/30">{ROLE_LABEL[r]}</Badge>)}</span></Row>
              <Row k="Hợp đồng">{badge(EMPLOYMENT_TYPE, p.type)}{p.joined_on ? <span className="ml-2 text-xs text-muted-foreground">từ {formatDate(p.joined_on)}</span> : null}</Row>
              <Row k="Lương cơ bản">{d.salary ? <span data-testid="my-salary">{money(d.salary.base_salary)}</span> : null}</Row>
              {d.salary ? <Row k="Mức đóng BH">{d.salary.insurance_base === null ? "Theo lương cơ bản" : money(d.salary.insurance_base)}</Row> : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Thông tin cá nhân</CardTitle><CardDescription>Bạn tự sửa được địa chỉ, email cá nhân và số điện thoại.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2.5 text-sm" data-testid="personal-info">
              <Row k="Địa chỉ">{d.personal?.address}</Row>
              <Row k="Email chính">{primaryEmail?.email}</Row>
              <Row k="Điện thoại chính">{primaryPhone ? `${primaryPhone.country_code} ${primaryPhone.phone}` : null}</Row>
              <Row k="Ngày sinh">{d.personal?.date_of_birth ? formatDate(d.personal.date_of_birth) : null}</Row>
              <Row k="Giới tính">{d.personal?.gender ? GENDER[d.personal.gender] : null}</Row>
            </dl>
            <Disclosure summary="Chỉnh sửa thông tin" icon={<Pencil className="size-4" aria-hidden />} defaultOpen={false}>
              <div className="flex flex-col gap-5" data-testid="edit-info">
                <MyAddressForm address={d.personal?.address ?? ""} />
                <MyContactForms emails={d.emails} phones={d.phones} />
              </div>
            </Disclosure>
          </CardContent>
        </Card>
      </div>

      <Card id="tai-lieu" className="scroll-mt-20">
        <CardHeader><CardTitle>Tài liệu cần nộp{open ? ` (${open} cần xử lý)` : ""}</CardTitle><CardDescription>HR giao yêu cầu; bạn nộp tệp, theo dõi trạng thái duyệt và nộp lại khi được yêu cầu bổ sung.</CardDescription></CardHeader>
        <CardContent><DocRequests items={requests} mode="self" today={ctx.today} timezone={ctx.timezone} revalidate={["/cai-dat/ho-so"]} /></CardContent>
      </Card>

      <p className="flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="size-4" aria-hidden />Đổi mật khẩu ở mục <Link href="/cai-dat#mat-khau" className="text-primary underline">Cài đặt → Đổi mật khẩu</Link>.</p>
    </div>
  );
}
