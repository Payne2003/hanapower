import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; loi?: string }> }) {
  const { next, loi } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary font-bold text-primary-foreground" aria-hidden>HM</div>
          <div>
            <h1 className="text-lg font-semibold">Đăng nhập</h1>
            <p className="text-sm text-muted-foreground">Quản lý sản xuất video nội bộ</p>
          </div>
        </div>
        {loi === "khong-hoat-dong" ? (
          <Alert tone="warning" className="mb-4">Tài khoản đã bị khóa hoặc chưa có hồ sơ nhân sự. Liên hệ quản trị hệ thống.</Alert>
        ) : null}
        <LoginForm next={next} />
        <p className="mt-4 text-xs text-muted-foreground">Tài khoản do quản trị hệ thống cấp. Quên mật khẩu: liên hệ quản trị hệ thống.</p>
      </div>
    </main>
  );
}
