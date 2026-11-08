import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export const getLeadFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) =>
      ["admin", "super_admin", "finance", "accounts"].includes(r.role as string),
    );
    if (!ok) return { payments: [], invoices: [], settlements: [] };

    const [paymentsRes, invoicesRes, settlementsRes] = await Promise.all([
      (await getAdmin())
        .from("payments")
        .select("id, amount, base_amount, gst_amount, status, gateway_name, transaction_id, razorpay_payment_id, payment_date, created_at, raw_response, webhook_response")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: false }),
      (await getAdmin())
        .from("invoices")
        .select("id, invoice_number, total_amount, base_amount, gst_amount, cgst_amount, sgst_amount, igst_amount, place_of_supply, pdf_path, issued_at, payment_id")
        .eq("lead_id", data.leadId)
        .order("issued_at", { ascending: false }),
      (await getAdmin())
        .from("payment_settlements")
        .select("id, payment_id, settled_amount, fee, net, created_at, settlement_id")
        .in("payment_id",
          ((await (await getAdmin()).from("payments").select("id").eq("lead_id", data.leadId)).data ?? [])
            .map((r: any) => r.id),
        ),
    ]);

    return {
      payments: paymentsRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      settlements: settlementsRes.data ?? [],
    };
  });
