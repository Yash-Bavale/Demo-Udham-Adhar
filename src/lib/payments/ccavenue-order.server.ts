/**
 * Server-only CCAvenue order builder. Shared by createCcavenueOrder and
 * initiatePayment so neither has to call the other's RPC stub.
 */
export async function buildCcavenueOrderForLead(leadCodeInput: string, returnNonce?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { CCAV_REDIRECT_URL, buildCcavOrderId, buildCcavPayload, encryptRequest, getCcavCreds } =
    await import("@/lib/payments/ccavenue.server");
  const { merchantId, accessCode, workingKey } = getCcavCreds();

  const { data: gateway } = await supabaseAdmin
    .from("payment_gateways")
    .select("is_enabled")
    .eq("name", "ccavenue")
    .maybeSingle();
  if (!gateway?.is_enabled) {
    throw new Error("CCAvenue is currently disabled. Please try another option.");
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, lead_code, website_id, name, email, mobile, total_amount, base_amount, gst_amount, service, state, status, lead_status_v2")
    .eq("lead_code", leadCodeInput)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (lead) await (await import("@/lib/payments/website-gateways.server")).assertGatewayAllowedForWebsite((lead as any).website_id, "ccavenue", "CCAvenue");
  if (!lead) throw new Error("Lead not found");
  if (!lead.lead_code) throw new Error("Lead is missing a lead code");

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, application_code")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pendingLink } = await supabaseAdmin
    .from("payment_links" as any)
    .select("amount")
    .eq("lead_id", lead.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasPendingLink = !!pendingLink && Number((pendingLink as any).amount) > 0;
  const pendingAmount = hasPendingLink ? Number((pendingLink as any).amount) : 0;

  const { data: paidAlready } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  const awaitingConvertedServicePayment =
    hasPendingLink || lead.status === "payment_pending" || lead.lead_status_v2 === "payment_pending";
  if (paidAlready && !awaitingConvertedServicePayment) {
    throw new Error("This application has already been paid.");
  }

  const payAmount = hasPendingLink ? pendingAmount : Number(lead.total_amount);
  const payBase = Math.round((payAmount / 1.18) * 100) / 100;
  const payGst = Math.round((payAmount - payBase) * 100) / 100;

  // Mark lead status as payment_pending if currently new/contacted
  if (
    ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.status ?? "") ||
    ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.lead_status_v2 ?? "")
  ) {
    await supabaseAdmin
      .from("leads")
      .update({ status: "payment_pending", lead_status_v2: "payment_pending" } as any)
      .eq("id", lead.id);
  }

  await supabaseAdmin
    .from("payments")
    .update({ status: "attempted" })
    .eq("lead_id", lead.id)
    .eq("gateway_name", "ccavenue")
    .in("status", ["created"]);

  const orderId = buildCcavOrderId(lead.lead_code);
  const amount = payAmount.toFixed(2);

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("payments")
    .insert({
      lead_id: lead.id,
      application_id: application?.id ?? null,
      gateway_name: "ccavenue",
      transaction_id: orderId,
      razorpay_order_id: orderId,
      amount: payAmount,
      base_amount: payBase,
      gst_amount: payGst,
      currency: "INR",
      status: "created",
      idempotency_key: `ccavenue:${orderId}`,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new Error(insErr?.message ?? "Could not create payment");
  }
  const paymentId = inserted.id;

  const origin = process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL ||
    "https://udyamadhar.in";
  const rq = returnNonce ? `?r=${encodeURIComponent(returnNonce)}` : "";
  const redirectUrl = `${origin}/api/public/webhooks/ccavenue${rq}`;
  const cancelUrl = `${origin}/api/public/webhooks/ccavenue${rq}`;

  const billingName = String(lead.name ?? "Customer").replace(/[^a-zA-Z0-9\s]/g, " ").trim().slice(0, 60) || "Customer";
  const billingTel = String(lead.mobile ?? "").replace(/\D/g, "").slice(-10) || "9999999999";
  const billingEmail = String(lead.email ?? "customer@example.com").trim().toLowerCase();

  // CCAvenue merchant account enforces billing_address / city / zip as
  // mandatory. We do not collect them, so send safe non-empty placeholders —
  // empty values are stripped by buildCcavPayload and trigger 21005/21006/21008
  // "Required parameter missing" => order_status Invalid.
  const billingState = String(lead.state ?? "").trim() || "NA";
  const merchantParams = buildCcavPayload({
    merchant_id: merchantId,
    order_id: orderId,
    currency: "INR",
    amount,
    redirect_url: redirectUrl,
    cancel_url: cancelUrl,
    language: "EN",
    billing_name: billingName,
    billing_email: billingEmail,
    billing_tel: billingTel,
    billing_address: "NA",
    billing_city: billingState,
    billing_zip: "110001",
    billing_country: "India",
    billing_state: billingState,
    merchant_param1: lead.id,
    merchant_param2: application?.id ?? "",
    merchant_param3: lead.lead_code,
    merchant_param4: (lead.service ?? "").slice(0, 60),
    integration_type: "iframe_normal",
  });

  const encRequest = encryptRequest(merchantParams, workingKey);

  return {
    actionUrl: CCAV_REDIRECT_URL,
    fields: {
      encRequest,
      access_code: accessCode,
    } as Record<string, string>,
    paymentId,
    leadCode: lead.lead_code,
    totalAmount: payAmount,
  };
}
