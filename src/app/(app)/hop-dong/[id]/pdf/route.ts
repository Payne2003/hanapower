import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderContractPdf } from "@/lib/contract-pdf";

export const runtime = "nodejs";

// Hợp đồng dạng PDF. Quyền xem theo RLS (crm.view); không có quyền thì không tìm thấy hợp đồng.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Mã không hợp lệ", { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: ctx } = await supabase.rpc("get_my_context");
  const me = ctx as { org_id?: string } | null;
  if (!me?.org_id) return new NextResponse("Chưa đăng nhập", { status: 401 });

  const { data: c } = await supabase.from("contracts").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) return new NextResponse("Không tìm thấy hợp đồng", { status: 404 });
  const [{ data: opp }, { data: org }, { data: quote }, { data: project }] = await Promise.all([
    supabase.from("opportunities").select("account_id, contact_id").eq("id", c.opportunity_id as string).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email, website, tax_code, bank_info").eq("id", me.org_id).maybeSingle(),
    c.quote_id ? supabase.from("quotes").select("code").eq("id", c.quote_id as string).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("projects").select("id").eq("contract_id", id).is("deleted_at", null).maybeSingle(),
  ]);
  const [{ data: acc }, { data: contact }, { data: rep }, { data: items }, { data: ms }] = await Promise.all([
    opp?.account_id ? supabase.from("accounts").select("name, tax_code, billing_address").eq("id", opp.account_id as string).maybeSingle() : Promise.resolve({ data: null }),
    opp?.contact_id ? supabase.from("contacts").select("salutation, first_name, last_name, job_title").eq("id", opp.contact_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.company_signed_by_id ? supabase.from("profiles").select("full_name, job_title").eq("id", c.company_signed_by_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.quote_id ? supabase.from("quote_items").select("*").eq("quote_id", c.quote_id as string).order("position") : Promise.resolve({ data: [] }),
    project ? supabase.from("project_milestones").select("name, amount, due_date").eq("project_id", project.id as string).order("sort_order") : Promise.resolve({ data: [] }),
  ]);

  const contactName = contact ? `${contact.salutation ?? ""} ${contact.first_name ?? ""} ${contact.last_name ?? ""}`.replace(/\s+/g, " ").trim() : null;
  const pdf = await renderContractPdf({
    org: { name: org?.name ?? "", address: org?.address, phone: org?.phone, email: org?.email, website: org?.website, tax_code: org?.tax_code, bank_info: org?.bank_info },
    contract: {
      code: c.code as string, status: c.status as string, created_at: c.created_at as string, effective_date: c.effective_date as string | null, expiry_date: c.expiry_date as string | null,
      duration_months: c.duration_months as number | null, current_value: Number(c.current_value), customer_signed_date: c.customer_signed_date as string | null,
      company_signed_date: c.company_signed_date as string | null, note: c.note as string | null,
    },
    customer: { name: (acc?.name as string) ?? "—", tax_code: acc?.tax_code as string | null, address: acc?.billing_address as string | null, representative: (c.customer_signed_by as string | null) || contactName, rep_title: (contact?.job_title as string | null) ?? null },
    company_rep: { name: rep?.full_name as string | undefined, title: rep?.job_title as string | undefined },
    quote_code: (quote?.code as string | undefined) ?? null,
    items: (items ?? []).map((i) => ({ description: i.description as string, unit: i.unit as string | null, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_percent: Number(i.tax_percent), amount: Number(i.amount) })),
    payments: (ms ?? []).map((m) => ({ name: m.name as string, amount: Number(m.amount), due_date: m.due_date as string | null })),
  });
  const download = req.nextUrl.searchParams.get("tai") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${String(c.code)}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
