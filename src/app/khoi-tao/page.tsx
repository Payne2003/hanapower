import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSystemEmpty } from "./actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Khởi tạo hệ thống" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isSystemEmpty())) redirect("/dang-nhap");
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-[var(--shadow-pop)]">
        <h1 className="text-lg font-semibold">Khởi tạo HANA Studio</h1>
        <p className="mb-4 text-sm text-muted-foreground">Tạo doanh nghiệp và tài khoản quản trị đầu tiên. Trang này chỉ dùng một lần.</p>
        <SetupForm />
      </div>
    </main>
  );
}
