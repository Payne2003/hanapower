import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireContext, can } from "@/lib/auth";
import { KIND_BY_SLUG, KIND_LABEL } from "@/lib/crm-import";
import { PageHeader } from "@/components/ui/page-header";
import { CrmImportWizard } from "../wizard";

export const metadata: Metadata = { title: "Nhập từ Excel" };
const TITLE: Record<string, string> = { "tai-khoan": "Tài khoản", "lien-he": "Liên hệ", lead: "Lead", "san-pham": "Sản phẩm / dịch vụ" };

export default async function CrmImportPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: slug } = await params;
  const kind = KIND_BY_SLUG[slug];
  if (!kind) notFound();
  const ctx = await requireContext();
  if (!can(ctx, "crm.manage")) redirect(`/${slug}`);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href={`/${slug}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />{TITLE[slug]}</Link>
      <PageHeader title={`Nhập ${KIND_LABEL[kind]} từ Excel`} description="Đọc tệp, kiểm tra và loại trùng trước khi ghi. Nhập lại cùng một tệp nhiều lần vẫn an toàn — bản ghi đã có sẽ được bỏ qua." />
      <CrmImportWizard slug={slug} label={KIND_LABEL[kind]} />
    </div>
  );
}
