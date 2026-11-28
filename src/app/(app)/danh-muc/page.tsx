import type { Metadata } from "next";
import { CatalogPage } from "@/components/pricing/catalog-page";

export const metadata: Metadata = { title: "Danh mục sản phẩm" };
export default function Page() {
  return <CatalogPage kind="category" />;
}
