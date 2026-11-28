import type { Metadata } from "next";
import { CatalogPage } from "@/components/pricing/catalog-page";

export const metadata: Metadata = { title: "Đơn vị tính" };
export default function Page() {
  return <CatalogPage kind="unit" />;
}
