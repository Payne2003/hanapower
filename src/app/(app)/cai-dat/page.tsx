import type { Metadata } from "next";
import { requireContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "@/components/password-form";
import { ROLE_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Cài đặt</h1>
      <Card>
        <CardHeader><CardTitle>Tài khoản</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Họ tên</dt><dd>{ctx.full_name}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{ctx.email}</dd>
            <dt className="text-muted-foreground">Vai trò</dt><dd>{ctx.roles.map((r) => ROLE_LABEL[r]).join(", ")}</dd>
            <dt className="text-muted-foreground">Doanh nghiệp</dt><dd>{ctx.org_name}</dd>
            <dt className="text-muted-foreground">Múi giờ</dt><dd>{ctx.timezone}</dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Đổi mật khẩu</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
    </div>
  );
}
