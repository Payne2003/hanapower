import type { Metadata } from "next";
import { requireContext, can } from "@/lib/auth";
import { getChannels } from "@/lib/queries";
import { ChannelForm } from "@/components/channel-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "@/components/password-form";
import { ROLE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const canChannels = can(ctx, "channels.manage");
  const channels = canChannels ? await getChannels() : [];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Cài đặt" description="Tài khoản, kênh phát hành và bảo mật." />
      <Card>
        <CardHeader><CardTitle>Tài khoản</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[7.5rem_1fr] gap-y-2.5 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-muted-foreground">Họ tên</dt><dd>{ctx.full_name}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{ctx.email}</dd>
            <dt className="text-muted-foreground">Vai trò</dt><dd>{ctx.roles.map((r) => ROLE_LABEL[r]).join(", ")}</dd>
            <dt className="text-muted-foreground">Doanh nghiệp</dt><dd>{ctx.org_name}</dd>
            <dt className="text-muted-foreground">Múi giờ</dt><dd>{ctx.timezone}</dd>
          </dl>
        </CardContent>
      </Card>
      {canChannels ? (
        <Card>
          <CardHeader><CardTitle>Kênh phát hành</CardTitle><CardDescription>Kênh dùng khi tạo video và ghi nhận đăng.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {channels.map((c) => <ChannelForm key={c.id} channel={c} />)}
            <div className="border-t pt-3"><ChannelForm /></div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Đổi mật khẩu</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
    </div>
  );
}
