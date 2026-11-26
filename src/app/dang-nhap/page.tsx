import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Alert } from "@/components/ui/alert";
import { redirect } from "next/navigation";
import { isSystemEmpty } from "../khoi-tao/actions";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; loi?: string }> }) {
  const { next, loi } = await searchParams;
  if (await isSystemEmpty()) redirect("/khoi-tao");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#145c3a,#0a3523)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" width={44} height={44} className="size-11 rounded-xl ring-1 ring-white/20" />
          <span className="text-lg font-semibold">HANA Studio</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Từ ý tưởng đến video đã đăng — trên một bảng chung.</h2>
          <p className="mt-4 text-white/75">Content chuẩn bị tài nguyên, Editor nhận và dựng, Leader duyệt và đăng. Mọi bước được theo dõi, thông báo và báo cáo tự động.</p>
          <ul className="mt-8 grid gap-3 text-sm text-white/85">
            {["Bàn giao Content → Editor có xác nhận", "Duyệt bản dựng, yêu cầu sửa có ghi chú", "Báo cáo tháng và xuất Excel một chạm"].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-[#f5c542] text-[11px] font-bold text-[#0a3523]">✓</span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">© HANA MEDIA</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/5" aria-hidden />
      </section>
      <section className="grid place-items-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="" width={48} height={48} className="size-12" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">HANA Studio</h1>
              <p className="text-sm text-muted-foreground">Quản lý sản xuất video · HANA MEDIA</p>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-pop)]">
            <h2 className="mb-1 text-lg font-semibold">Đăng nhập</h2>
            <p className="mb-5 text-sm text-muted-foreground">Dùng email công việc do quản trị hệ thống cấp.</p>
            {loi === "khong-hoat-dong" ? (
              <Alert tone="warning" className="mb-4">Tài khoản đã bị khóa hoặc chưa có hồ sơ nhân sự. Liên hệ quản trị hệ thống.</Alert>
            ) : null}
            <LoginForm next={next} />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Quên mật khẩu? Liên hệ quản trị hệ thống để được đặt lại.</p>
        </div>
      </section>
    </main>
  );
}
