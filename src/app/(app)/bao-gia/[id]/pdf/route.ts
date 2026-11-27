import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderQuotePdf } from "@/lib/quote-pdf";

export const runtime = "nodejs";

// Báo giá dạng PDF. Quyền xem do RLS quyết định (crm.view); không có quyền thì không tìm thấy báo giá.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Mã không hợp lệ", { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const c = ctx as { org_id?: string; full_name?: string } | null;
  if (!c?.org_id) return new NextResponse("Chưa đăng nhập", { status: 401 });

  const { data: q } = await supabase.from("quotes").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!q) return new NextResponse("Không tìm thấy báo giá", { status: 404 });
  const [{ data: items }, { data: opp }, { data: org }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    supabase.from("opportunities").select("name, account_id, owner_id").eq("id", q.opportunity_id as string).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email, website, tax_code, bank_info").eq("id", c.org_id).maybeSingle(),
  ]);
  const [{ data: acc }, { data: owner }] = await Promise.all([
    opp?.account_id ? supabase.from("accounts").select("name, tax_code").eq("id", opp.account_id as string).maybeSingle() : Promise.resolve({ data: null }),
    q.owner_id ? supabase.from("profiles").select("full_name").eq("id", q.owner_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const pdf = await renderQuotePdf({
    org: { name: org?.name ?? "", address: org?.address, phone: org?.phone, email: org?.email, website: org?.website, tax_code: org?.tax_code, bank_info: org?.bank_info },
    quote: {
      code: q.code as string, version: Number(q.version), created_at: q.created_at as string, expiry_date: q.expiry_date as string | null,
      subtotal: Number(q.subtotal), tax_amount: Number(q.tax_amount), total: Number(q.total), note: q.note as string | null,
      recipient_name: q.recipient_name as string | null, billing_address: q.billing_address as string | null,
    },
    customer: { name: (acc?.name as string) ?? "—", tax_code: acc?.tax_code as string | null },
    opportunity: (opp?.name as string) ?? "",
    items: (items ?? []).map((i) => ({ position: Number(i.position), description: i.description as string, unit: i.unit as string | null, quantity: Number(i.quantity), unit_price: Number(i.unit_price), fee_percent: Number(i.fee_percent), tax_percent: Number(i.tax_percent), amount: Number(i.amount) })),
    signer: (owner?.full_name as string) ?? null,
  });
  const download = req.nextUrl.searchParams.get("tai") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${String(q.code)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
