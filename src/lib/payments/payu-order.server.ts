/**
 * Server-only PayU order builder. Shared by createPayUOrder and
 * initiatePayment so neither has to call the other's RPC stub.
 */
export async function buildPayUOrder(leadCodeInput: string, returnNonce?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { PAYU_BASE_URL, buildTxnId, computeRequestHash, getPayUCreds } = await import(
    "@/lib/payments/payu.server"
  );
  const { key, salt } = getPayUCreds();

  const { data: gateway } = await supabaseAdmin
    .from("payment_gateways")
    .select("is_enabled, priority")
    .eq("name", "payu")
    .maybeSingle();
  if (!gateway?.is_enabled) {
    throw new Error("PayU is currently disabled. Please try later.");
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, lead_code, website_id, name, email, mobile, total_amount, base_amount, gst_amount, service, status, lead_status_v2")
    .eq("lead_code", leadCodeInput)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (!lead) throw new Error("Lead not found");
  await (await import("@/lib/payments/website-gateways.server")).assertGatewayAllowedForWebsite((lead as any).website_id, "payu", "PayU");

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, application_code")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead.lead_code) throw new Error("Lead is missing a lead code");
  const leadCode: string = lead.lead_code;

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
    .eq("gateway_name", "payu")
    .in("status", ["created"]);

  const txnid = buildTxnId(leadCode);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("payments")
    .insert({
      lead_id: lead.id,
      application_id: application?.id ?? null,
      gateway_name: "payu",
      transaction_id: txnid,
      razorpay_order_id: txnid,
      amount: payAmount,
      base_amount: payBase,
      gst_amount: payGst,
      currency: "INR",
      status: "created",
      idempotency_key: `payu:${txnid}`,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new Error(insErr?.message ?? "Could not create payment");
  }
  const paymentId = inserted.id;

  const amount = payAmount.toFixed(2);
  const productinfo = String(lead.service ?? "Service").replace(/[^a-zA-Z0-9\s]/g, " ").trim().slice(0, 100) || "Service";
  const firstname = String(lead.name ?? "Customer").replace(/[^a-zA-Z0-9\s]/g, " ").trim().slice(0, 60) || "Customer";
  const phone = String(lead.mobile ?? "").replace(/\D/g, "").slice(-10) || "9999999999";
  const email = String(lead.email ?? "customer@example.com").trim().toLowerCase();

  const origin = process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL ||
    "https://udyamadhar.in";
  const rq = returnNonce ? `?r=${encodeURIComponent(returnNonce)}` : "";
  const surl = `${origin}/api/public/webhooks/payu${rq}`;
  const furl = `${origin}/api/public/webhooks/payu${rq}`;

  const hash = computeRequestHash({
    key, salt, txnid, amount, productinfo, firstname, email,
    udf1: lead.id, udf2: application?.id ?? "", udf3: leadCode,
  });

  return {
    actionUrl: PAYU_BASE_URL,
    fields: {
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash,
      udf1: lead.id,
      udf2: application?.id ?? "",
      udf3: leadCode,
      service_provider: "payu_paisa",
    } as Record<string, string>,
    paymentId,
    leadCode,
    totalAmount: payAmount,
  };
}
