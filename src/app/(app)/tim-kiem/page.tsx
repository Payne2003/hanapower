import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Tìm kiếm" };

type Hit = { id: string; label: string; sub?: string | null };
const GROUPS: [string, string, (id: string) => string | null][] = [
  ["leads", "Lead", (id) => `/lead/${id}`], ["accounts", "Tài khoản", (id) => `/tai-khoan/${id}`], ["contacts", "Liên hệ", (id) => `/lien-he/${id}`],
  ["opportunities", "Cơ hội", (id) => `/co-hoi/${id}`], ["quotes", "Báo giá", (id) => `/bao-gia/${id}`], ["contracts", "Hợp đồng", (id) => `/hop-dong/${id}`],
  ["products", "Sản phẩm", (id) => `/san-pham/${id}`], ["projects", "Dự án", (id) => `/du-an/${id}`], ["videos", "Video", (id) => `/video/${id}`], ["people", "Nhân viên", () => null],
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [, sp] = await Promise.all([requireContext(), searchParams]);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const supabase = await createSupabaseServerClient();
  const { data, error } = q.length >= 2 ? await supabase.rpc("search_all", { p_q: q }) : { data: null, error: null };
  const res = (data ?? {}) as Record<string, Hit[]>;
  const total = GROUPS.reduce((s, [k]) => s + (res[k]?.length ?? 0), 0);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Tìm kiếm" description="Tìm trong lead, khách hàng, liên hệ, cơ hội, báo giá, hợp đồng, sản phẩm, dự án, video và nhân viên theo quyền của bạn." />
      <form action="/tim-kiem" method="get" role="search" className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Tên, mã, số điện thoại, email, MST…" aria-label="Từ khóa" autoFocus className="flex-1" />
        <Button type="submit">Tìm</Button>
      </form>
      {error ? <p className="text-sm text-destructive">Không tìm kiếm được: {error.message}</p> : null}
      {q.length < 2 ? <p className="text-sm text-muted-foreground">Nhập ít nhất 2 ký tự.</p> : total === 0 ? <EmptyState icon={<SearchX />} title={`Không thấy kết quả cho “${q}”`} description="Thử từ khóa ngắn hơn hoặc kiểm tra chính tả." /> : (
        <div className="flex flex-col gap-4" data-testid="search-results">
          {GROUPS.filter(([k]) => res[k]?.length).map(([k, label, href]) => (
            <section key={k} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
              <h2 className="mb-2 text-sm font-semibold">{label} <span className="text-muted-foreground">({res[k]!.length})</span></h2>
              <ul className="divide-y text-sm">
                {res[k]!.map((h) => {
                  const to = href(h.id);
                  const body = <><span className="font-medium">{h.label}</span>{h.sub ? <span className="ml-2 text-xs text-muted-foreground">{h.sub}</span> : null}</>;
                  return <li key={h.id} className="py-2">{to ? <Link href={to} className="block hover:text-primary hover:underline">{body}</Link> : body}</li>;
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
