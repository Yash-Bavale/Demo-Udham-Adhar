import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


const OrderInput = z.object({
  leadId: z.string().uuid(),
});

/**
 * Creates a Razorpay order for an existing lead.
 * Returns { configured: false } when keys aren't set yet, so the UI can
 * gracefully show a "we'll contact you" message instead of crashing.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    const { data: lead, error: leadErr } = await (await getAdmin())
      .from("leads")
      .select("id, lead_code, total_amount, email, name, mobile")
      .eq("id", data.leadId)
      .single();

    if (leadErr || !lead) throw new Error("Lead not found");

    if (!keyId || !keySecret) {
      return { configured: false as const };
    }

    // Razorpay Orders API
    const amountPaise = Math.round(Number(lead.total_amount) * 100);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: lead.lead_code,
        notes: { lead_id: lead.id, lead_code: lead.lead_code },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Razorpay order creation failed: ${txt}`);
    }

    const order = (await resp.json()) as { id: string; amount: number; currency: string };

    await (await getAdmin()).from("payments").insert({
      lead_id: lead.id,
      razorpay_order_id: order.id,
      amount: Number(lead.total_amount),
      currency: "INR",
      status: "created",
    });

    return {
      configured: true as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      prefill: { name: lead.name, email: lead.email, contact: lead.mobile },
    };
  });
