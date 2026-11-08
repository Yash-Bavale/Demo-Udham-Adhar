/**
 * Server-only Cashfree order builder. Follows the exact same pattern as
 * payu-order.server.ts and ccavenue-order.server.ts.
 *
 * Cashfree uses a REST API + redirect model (not HTML form POST).
 * We create the order via API, then redirect the user to Cashfree's
 * hosted checkout page using the payment_session_id.
 */
export async function buildCashfreeOrder(leadCodeInput: string, returnNonce?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    buildCashfreeOrderId,
    createCashfreeOrder,
  } = await import("@/lib/payments/cashfree.server");

  // 1) Verify gateway is enabled (check case-insensitively)
  const { data: gateway } = await supabaseAdmin
    .from("payment_gateways")
    .select("is_enabled")
    .ilike("name", "%cashfree%")
    .maybeSingle();
  if (gateway && gateway.is_enabled === false) {
    throw new Error("Cashfree is currently disabled. Please enable it in Admin Settings.");
  }

  // 2) Look up the lead
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id, lead_code, website_id, name, email, mobile, total_amount, base_amount, gst_amount, service, status, lead_status_v2",
    )
    .eq("lead_code", leadCodeInput)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (!lead) throw new Error("Lead not found");
  if (!lead.lead_code) throw new Error("Lead is missing a lead code");
  const leadCode: string = lead.lead_code;
  await (await import("@/lib/payments/website-gateways.server")).assertGatewayAllowedForWebsite((lead as any).website_id, "cashfree", "Cashfree");

  // 2b) Pick the merchant account strictly from the lead's stored website.
  // Fails closed (no global fallback) before any payment row is written.
  const { credsForWebsite } = await import("@/lib/payments/cashfree-accounts.server");
  const creds = await credsForWebsite((lead as any).website_id);

  // 3) Look up existing application (if any)
  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, application_code")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4) Check for pending payment link (service change / top-up)
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

  // 5) Duplicate payment guard
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

  // 6) Compute amount
  const payAmount = hasPendingLink ? pendingAmount : Number(lead.total_amount);
  const payBase = Math.round((payAmount / 1.18) * 100) / 100;
  const payGst = Math.round((payAmount - payBase) * 100) / 100;

  // 7) Mark lead status as payment_pending if currently new/contacted
  if (
    ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.status ?? "") ||
    ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.lead_status_v2 ?? "")
  ) {
    await supabaseAdmin
      .from("leads")
      .update({ status: "payment_pending", lead_status_v2: "payment_pending" } as any)
      .eq("id", lead.id);
  }

  // 8) Expire any previous "created" Cashfree payments for this lead
  await supabaseAdmin
    .from("payments")
    .update({ status: "attempted" })
    .eq("lead_id", lead.id)
    .eq("gateway_name", "cashfree")
    .in("status", ["created"]);

  // 9) Create payment row
  const cfOrderId = buildCashfreeOrderId(leadCode);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("payments")
    .insert({
      lead_id: lead.id,
      application_id: application?.id ?? null,
      gateway_name: "cashfree",
      transaction_id: cfOrderId,
      razorpay_order_id: cfOrderId, // reuse column for gateway order ID
      amount: payAmount,
      base_amount: payBase,
      gst_amount: payGst,
      currency: "INR",
      status: "created",
      idempotency_key: `cashfree:${cfOrderId}`,
      payment_account_id: creds.accountId,
    } as any)
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new Error(insErr?.message ?? "Could not create payment");
  }
  const paymentId = inserted.id;

  // 10) Build Cashfree order via REST API
  const origin =
    process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://udyamadhar.in";
  const returnUrl = `${origin}/api/public/webhooks/cashfree?order_id={order_id}${returnNonce ? `&r=${encodeURIComponent(returnNonce)}` : ""}`;
  const notifyUrl = `${origin}/api/public/webhooks/cashfree`;

  const phone = String(lead.mobile ?? "").replace(/\D/g, "").slice(-10) || "9999999999";
  const email = String(lead.email ?? "customer@example.com").trim().toLowerCase();
  const name = String(lead.name ?? "Customer").replace(/[^a-zA-Z0-9\s]/g, " ").trim().slice(0, 60) || "Customer";

  const cfOrder = await createCashfreeOrder({
    orderId: cfOrderId,
    orderAmount: payAmount,
    customerId: lead.id,
    customerEmail: email,
    customerPhone: phone,
    customerName: name,
    returnUrl,
    notifyUrl,
  }, creds);

  // 11) Store Cashfree cf_order_id in the payment row for later lookup
  await supabaseAdmin
    .from("payments")
    .update({ razorpay_payment_id: cfOrder.cf_order_id } as any)
    .eq("id", paymentId);

  // 12) Build the checkout redirect URL
  // Cashfree hosted checkout URL format:
  // Production: https://payments.cashfree.com/pgbillpay/checkout/post/{payment_session_id}
  // Sandbox: https://sandbox.cashfree.com/pgbillpay/checkout/post/{payment_session_id}
  // Mode is resolved from the SAME credential source as the API call
  // (env vars or DB config) so the checkout host can never disagree.
  const isProd = creds.isProd;

  return {
    actionUrl: cfOrder.payment_link || "",
    fields: {} as Record<string, string>,
    paymentId,
    leadCode,
    totalAmount: payAmount,
    paymentSessionId: cfOrder.payment_session_id,
    isProd,
  };
}
