import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Nhập dữ liệu từ Excel" };

export default async function ImportPage() {
  const ctx = await requireContext();
  if (!can(ctx, "videos.manage_all")) redirect("/video");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href="/video" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />Video</Link>
      <PageHeader title="Nhập dữ liệu từ bảng báo cáo cũ" description="Đưa các video trong Google Sheet “Bảng báo cáo bộ phận content” vào hệ thống. Mã đã có sẽ được bỏ qua, nên nhập lại nhiều lần vẫn an toàn." />
      <ImportWizard />
    </div>
  );
}
