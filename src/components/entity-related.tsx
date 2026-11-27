import Link from "next/link";
import { Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLookups, nameOf, STAGE_OPP, tag, type Entity, type Row } from "@/lib/entities";
import { money } from "@/lib/form-spec";
import { formatDate } from "@/lib/dates";
import { RpcForm } from "@/components/rpc-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PriceBookLineForm, DeleteLineButton } from "@/components/line-forms";

function Section({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}</CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const STAGE_PROJECT: Record<string, string> = { planning: "Lên kế hoạch", in_progress: "Đang thực hiện", acceptance: "Nghiệm thu", completed: "Hoàn thành", on_hold: "Tạm dừng", cancelled: "Đã hủy" };

/** Khối liên quan hiển thị dưới biểu mẫu chi tiết của từng thực thể. */
export async function EntityRelated({ e, row, canWrite }: { e: Entity; row: Row; canWrite: boolean }) {
  const supabase = await createSupabaseServerClient();
  const id = String(row.id);

  if (e.key === "lead") {
    if (row.is_converted) {
      return (
        <Section title="Đã chuyển đổi" description={`Chuyển đổi ngày ${formatDate(String(row.converted_at ?? "").slice(0, 10))}`}>
          <ul className="flex flex-col gap-1.5 text-sm">
            {row.converted_account_id ? <li><Link className="text-primary hover:underline" href={`/tai-khoan/${row.converted_account_id}`}>Tài khoản</Link></li> : null}
            {row.converted_contact_id ? <li><Link className="text-primary hover:underline" href={`/lien-he/${row.converted_contact_id}`}>Liên hệ</Link></li> : null}
            {row.converted_opportunity_id ? <li><Link className="text-primary hover:underline" href={`/co-hoi/${row.converted_opportunity_id}`}>Cơ hội</Link></li> : null}
          </ul>
        </Section>
      );
    }
    if (!canWrite) return null;
    const L = await loadLookups(["accounts"]);
    return (
      <Section title="Chuyển đổi lead" description="Tạo tài khoản + liên hệ (+ cơ hội) từ lead này. Để trống Tài khoản để tạo mới theo tên công ty.">
        <RpcForm
          rpc="convert_lead" fixed={{ p_lead: id }} submitLabel="Chuyển đổi" okMessage="Đã chuyển đổi lead." revalidate={["/lead", "/tai-khoan", "/lien-he", "/co-hoi"]}
          fields={[
            { name: "p_account_id", label: "Gắn vào tài khoản có sẵn", type: "select", as: "uuid", options: L.accounts ?? [] },
            { name: "p_opportunity_name", label: "Tên cơ hội" },
            { name: "p_create_opportunity", label: "Cơ hội", type: "checkbox", placeholder: "Tạo cơ hội mới", defaultValue: true },
          ]}
        />
      </Section>
    );
  }

  if (e.key === "account") {
    const [contacts, opps, projects] = await Promise.all([
      supabase.from("contacts").select("id, first_name, last_name, job_title, phones").eq("account_id", id).is("deleted_at", null).order("last_name"),
      supabase.from("opportunities").select("id, name, stage, expected_revenue").eq("account_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("projects").select("id, code, name, stage").eq("customer_id", id).order("created_at", { ascending: false }),
    ]);
    return (
      <>
        <Section title={`Liên hệ (${contacts.data?.length ?? 0})`}>
          <DataTable rows={(contacts.data ?? []) as Row[]} href={(r) => `/lien-he/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có liên hệ. Thêm ở mục Liên hệ và chọn công ty này.</p>}
            cols={[{ label: "Họ tên", cell: (r) => `${r.first_name ?? ""} ${r.last_name}`.trim() }, { label: "Chức danh", cell: (r) => String(r.job_title ?? "—") }, { label: "Điện thoại", cell: (r) => (r.phones as string[])[0] ?? "—" }]} />
        </Section>
        <Section title={`Cơ hội (${opps.data?.length ?? 0})`}>
          <DataTable rows={(opps.data ?? []) as Row[]} href={(r) => `/co-hoi/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có cơ hội.</p>}
            cols={[{ label: "Cơ hội", cell: (r) => String(r.name) }, { label: "Giai đoạn", cell: (r) => tag(STAGE_OPP, r.stage) }, { label: "Giá trị", cell: (r) => money(r.expected_revenue as number), className: "text-right" }]} />
        </Section>
        {projects.data?.length ? (
          <Section title={`Dự án (${projects.data.length})`}>
            <DataTable rows={projects.data as Row[]} href={(r) => `/du-an/${r.id}`} cols={[{ label: "Mã", cell: (r) => String(r.code) }, { label: "Dự án", cell: (r) => String(r.name) }, { label: "Trạng thái", cell: (r) => STAGE_PROJECT[String(r.stage)] ?? "—" }]} />
          </Section>
        ) : null}
      </>
    );
  }

  if (e.key === "contact") {
    const { data } = await supabase.from("opportunities").select("id, name, stage, expected_revenue").eq("contact_id", id).is("deleted_at", null);
    return (
      <Section title={`Cơ hội liên quan (${data?.length ?? 0})`}>
        <DataTable rows={(data ?? []) as Row[]} href={(r) => `/co-hoi/${r.id}`} empty={<p className="text-sm text-muted-foreground">Chưa có cơ hội.</p>}
          cols={[{ label: "Cơ hội", cell: (r) => String(r.name) }, { label: "Giai đoạn", cell: (r) => tag(STAGE_OPP, r.stage) }, { label: "Giá trị", cell: (r) => money(r.expected_revenue as number), className: "text-right" }]} />
      </Section>
    );
  }

  if (e.key === "product") {
    const [{ data }, L] = await Promise.all([
      supabase.from("price_book_products").select("id, price_book_id, unit_price, fee_percent, tax_percent").eq("product_id", id),
      loadLookups(["price_books"]),
    ]);
    return (
      <Section title="Có trong bảng giá">
        <DataTable rows={(data ?? []) as Row[]} href={(r) => `/bang-gia/${r.price_book_id}`} empty={<p className="text-sm text-muted-foreground">Chưa thuộc bảng giá nào.</p>}
          cols={[{ label: "Bảng giá", cell: (r) => nameOf(L, "price_books", r.price_book_id) }, { label: "Đơn giá", cell: (r) => money(r.unit_price as number), className: "text-right" }, { label: "Thuế", cell: (r) => `${r.tax_percent}%`, className: "text-right" }]} />
      </Section>
    );
  }

  if (e.key === "pricebook") {
    const [{ data }, L] = await Promise.all([
      supabase.from("price_book_products").select("id, product_id, unit_price, fee_percent, tax_percent").eq("price_book_id", id),
      loadLookups(["products"]),
    ]);
    return (
      <Section title={`Sản phẩm trong bảng giá (${data?.length ?? 0})`}>
        <div className="flex flex-col gap-4">
          <DataTable rows={(data ?? []) as Row[]} empty={<p className="text-sm text-muted-foreground">Chưa có sản phẩm trong bảng giá.</p>}
            cols={[
              { label: "Sản phẩm", cell: (r) => nameOf(L, "products", r.product_id) }, { label: "Đơn giá", cell: (r) => money(r.unit_price as number), className: "text-right" },
              { label: "Phí", cell: (r) => `${r.fee_percent}%`, className: "text-right" }, { label: "Thuế", cell: (r) => `${r.tax_percent}%`, className: "text-right" },
              ...(canWrite ? [{ label: "", cell: (r: Row) => <DeleteLineButton table="price_book_products" id={String(r.id)} path="/bang-gia" /> }] : []),
            ]} />
          {canWrite ? <PriceBookLineForm priceBookId={id} products={L.products ?? []} /> : null}
        </div>
      </Section>
    );
  }
  return null;
}
void Trash2;
