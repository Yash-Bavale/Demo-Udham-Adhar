// Post-paid workflow, shared between the PayU webhook, admin reconcile, and
// the periodic PayU reconciliation cron. Given a payments.id that is (or is
// about to be flipped to) `paid`, this:
//   1. creates the application if missing
//   2. flips the lead + payment_links to payment_successful/paid
//   3. transitions the application to payment_received
//   4. generates the invoice PDF
//   5. queues the E001 order-confirmation email with the invoice attached
//
// Fully idempotent: safe to call multiple times for the same payment.

import { generateInvoiceInternal, loadInvoiceAttachmentByPayment, markInvoiceEmailedByPayment } from "@/lib/crm/invoices.functions";

const APP_ORIGIN =
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_SITE_URL ||
  "https://udyamadhar.in";

type FinalizeOpts = {
  source: "webhook" | "reconcile" | "cron";
  txnid?: string | null;
  mihpayid?: string | null;
};

export async function finalizePaidPayment(paymentId: string, opts: FinalizeOpts) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, lead_id, application_id, status, transaction_id, razorpay_payment_id, amount, created_at, parent_payment_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) throw new Error(`Payment ${paymentId} not found`);

  // Is this the order's FIRST settled payment, or a top-up (service-change
  // delta / balance) on an order that was already paid for earlier?
  // A top-up must never reset the order stage, re-arm the form timers, or
  // re-send the order-confirmation email.
  const { data: earlierPaid } = await supabaseAdmin
    .from("payments")
    .select("id, created_at")
    .eq("lead_id", payment.lead_id)
    .eq("status", "paid")
    .neq("id", payment.id)
    .lte("created_at", (payment as any).created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const isTopUp = !!earlierPaid;
  if (isTopUp && !(payment as any).parent_payment_id) {
    await supabaseAdmin
      .from("payments")
      .update({ parent_payment_id: earlierPaid!.id } as any)
      .eq("id", payment.id);
  }


  // 1) Application — orders exist only from a successful payment onwards.
  let applicationId = payment.application_id as string | null;
  if (!applicationId) {
    // Reuse an existing (non-deleted) order for this lead, if any, so retries
    // and multi-gateway attempts never duplicate the order.
    const { data: existingApp } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("lead_id", payment.lead_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingApp) {
      applicationId = existingApp.id;
    } else {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, service_id, service, customer_id, assigned_to, website_id")
        .eq("id", payment.lead_id)
        .maybeSingle();

      let targetServiceId = lead?.service_id ?? null;
      if (!targetServiceId && lead?.service) {
        const { data: svc } = await supabaseAdmin
          .from("services")
          .select("id")
          .ilike("service_name", lead.service.trim())
          .maybeSingle();
        if (svc?.id) {
          targetServiceId = svc.id;
          await supabaseAdmin.from("leads").update({ service_id: svc.id } as any).eq("id", payment.lead_id);
        }
      }

      const { data: createdApp, error: appErr } = await supabaseAdmin
        .from("applications")
        .insert({
          lead_id: payment.lead_id,
          customer_id: lead?.customer_id ?? null,
          service_id: targetServiceId,
          // Orders have their own round-robin queue. Do not inherit the lead
          // owner here, otherwise the application trigger cannot pick the next
          // employee and consecutive orders follow the lead rotation instead.
          assigned_to: null,
          website_id: (lead as any)?.website_id ?? null,
          application_status: "payment_received" as any,
          fulfillment_status: "order_received" as any,
        } as any)
        .select("id")
        .single();
      if (appErr?.code === "23505") {
        // A second payment callback may reach this insert before the first one
        // has linked its application to the payment. The database uniqueness
        // rule makes one callback win; reuse that order instead of creating a
        // second order and consuming another round-robin turn.
        const { data: concurrentApp, error: concurrentAppErr } = await supabaseAdmin
          .from("applications")
          .select("id")
          .eq("lead_id", payment.lead_id)
          .eq("is_deleted", false)
          .maybeSingle();
        if (concurrentAppErr) console.error("[finalize] concurrent app lookup failed", concurrentAppErr);
        applicationId = concurrentApp?.id ?? null;
      } else if (appErr) {
        console.error("[finalize] app create failed", appErr);
      }
      if (createdApp) {
        applicationId = createdApp.id;
        // Auto-assign order (and sync to lead) if unassigned
        try {
          const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
          await autoAssignLeadOrOrder({
            leadId: payment.lead_id,
            applicationId: createdApp.id,
            serviceId: targetServiceId,
          });
        } catch (assignErr) {
          console.error("[finalize] Auto-assignment failed:", assignErr);
        }
      }
    }
    if (applicationId) {
      await supabaseAdmin.from("payments").update({ application_id: applicationId } as any).eq("id", payment.id);
    }
  }


  // 2) payment_links — settle ONLY the link this payment actually pays for
  // (issued before the payment, same amount). Marking every pending link paid
  // is what made unpaid top-ups look settled.
  const payAmount = Number((payment as any).amount ?? 0);
  const { data: pendingLinks } = await supabaseAdmin
    .from("payment_links" as any)
    .select("id, amount, created_at")
    .eq("lead_id", payment.lead_id)
    .eq("status", "pending")
    .lte("created_at", (payment as any).created_at)
    .order("created_at", { ascending: false });
  const matchLink = (pendingLinks ?? []).find(
    (l: any) => payAmount > 0 && Math.abs(Number(l.amount ?? 0) - payAmount) < 0.01,
  );
  if (matchLink) {
    await supabaseAdmin
      .from("payment_links" as any)
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_id: payment.id } as any)
      .eq("id", (matchLink as any).id);
  }

  // Lead is only "payment successful" when nothing is still outstanding.
  const { count: stillPending } = await supabaseAdmin
    .from("payment_links" as any)
    .select("id", { count: "exact", head: true })
    .eq("lead_id", payment.lead_id)
    .eq("status", "pending");
  if (!stillPending) {
    // NOTE: `leads` has no payment_successful_at column — including it here made
    // the whole update fail silently, which is why paid leads kept showing
    // "payment pending" in the admin list.
    const { error: leadErr } = await supabaseAdmin.from("leads")
      .update({
        status: "payment_successful",
        lead_status_v2: "payment_successful",
      } as any)
      .eq("id", payment.lead_id);
    if (leadErr) console.error("[finalize] lead status update failed", leadErr);
  }

  // 3) Move application forward — first payment only. A top-up must never drag
  // an in-progress order back to "payment received".
  if (applicationId && !isTopUp) {
    try {
      const { transitionStatusSystem } = await import("@/lib/applications/transitions.server");
      const tr = await transitionStatusSystem({
        applicationId,
        toStatus: "payment_received",
        reason: `Payment finalized (${opts.source})`,
        metadata: { txnid: opts.txnid ?? payment.transaction_id, mihpayid: opts.mihpayid ?? payment.razorpay_payment_id, source: opts.source },
      });
      if (!tr.ok) console.error("[finalize] transition failed", tr.reason);
    } catch (e) {
      console.error("[finalize] transition threw", e);
    }
  }


  // 4) Invoice
  let invoiceAttachment: Awaited<ReturnType<typeof loadInvoiceAttachmentByPayment>> = null;
  let invoiceRow: any = null;
  try {
    await generateInvoiceInternal(payment.id);
    invoiceAttachment = await loadInvoiceAttachmentByPayment(payment.id);
    // Retry once if attachment load was delayed due to storage async upload latency
    if (!invoiceAttachment) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      invoiceAttachment = await loadInvoiceAttachmentByPayment(payment.id);
    }
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number, issued_at, sac_code, place_of_supply, cgst_amount, sgst_amount, igst_amount, base_amount, gst_amount, total_amount, last_emailed_at")
      .eq("payment_id", payment.id)
      .is("cancelled_at", null)
      .maybeSingle();
    invoiceRow = inv;
  } catch (e) {
    console.error("[finalize] invoice generation failed", e);
  }

  // 5) Confirmation email — send ONCE per payment. First payment gets E001,
  // a top-up gets E013. The duplicate guard must match the template this
  // payment is about to send: checking the whole lead for E001 would see the
  // FIRST payment's confirmation and wrongly suppress the top-up receipt.
  const templateKey = isTopUp ? "topup_payment_received" : "order_confirmation";
  const guardCodes = isTopUp ? ["E013", "topup_payment_received"] : ["E001", "order_confirmation"];
  const { data: existingEmailQueue } = await supabaseAdmin
    .from("email_queue")
    .select("id")
    .eq("lead_id", payment.lead_id)
    .in("template_code", guardCodes)
    .maybeSingle();

  const alreadyEmailed = !!invoiceRow?.last_emailed_at || !!existingEmailQueue;
  if (alreadyEmailed) {
    console.info("[finalize] E001 already queued or sent for payment, skipping", payment.id);
    return { ok: true, applicationId };
  }

  try {
    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select("lead_code, name, email, mobile, service, base_amount, gst_amount, total_amount")
      .eq("id", payment.lead_id)
      .maybeSingle();
    if (leadRow?.email && leadRow.lead_code) {
      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      const { amountInWordsINR } = await import("@/lib/invoices/amount-in-words");
      const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
      const orderNumber = await resolveApplicationCode(payment.lead_id, { applicationId });
      if (orderNumber) {
        const onboardingUrl = `${APP_ORIGIN}/onboarding/${encodeURIComponent(leadRow.lead_code)}`;
        const invoiceUrl = `${APP_ORIGIN}/api/public/invoice/${encodeURIComponent(leadRow.lead_code)}`;
        const total = Number(invoiceRow?.total_amount ?? leadRow.total_amount ?? 0);
        const issued = invoiceRow?.issued_at ? new Date(invoiceRow.issued_at) : new Date();
        const now = new Date();
        const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";
        const commonVars = {
          name: leadRow.name ?? "",
          customer_name: leadRow.name ?? "",
          customer_email: leadRow.email,
          customer_mobile: leadRow.mobile ?? "",
          lead_code: leadRow.lead_code,
          leadCode: leadRow.lead_code,
          order_number: orderNumber,
          service: leadRow.service ?? "",
          service_name: leadRow.service ?? "",
          base_amount: Number(invoiceRow?.base_amount ?? leadRow.base_amount ?? 0).toFixed(2),
          gst_amount: Number(invoiceRow?.gst_amount ?? leadRow.gst_amount ?? 0).toFixed(2),
          total_amount: total.toFixed(2),
          amount: total.toFixed(2),
          amount_in_words: amountInWordsINR(total),
          invoice_number: invoiceRow?.invoice_number ?? "",
          invoice_date: issued.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          sac_code: invoiceRow?.sac_code ?? "998311",
          place_of_supply: invoiceRow?.place_of_supply ?? "Maharashtra",
          cgst_amount: Number(invoiceRow?.cgst_amount ?? 0).toFixed(2),
          sgst_amount: Number(invoiceRow?.sgst_amount ?? 0).toFixed(2),
          igst_amount: Number(invoiceRow?.igst_amount ?? 0).toFixed(2),
          form_link: onboardingUrl,
          onboarding_url: onboardingUrl,
          invoice_url: "",
          invoice_download_url: "",
          transaction_id: opts.mihpayid || opts.txnid || payment.transaction_id || payment.id,
          payment_reference: opts.mihpayid || opts.txnid || payment.transaction_id || payment.id,
          payment_datetime: fmt(now),
          payment_date: fmt(now),
          service_fee: Number(invoiceRow?.base_amount ?? leadRow.base_amount ?? 0).toFixed(2),
          support_email: "help@businesshelpservices.com",
        };
        // First payment → E001 order confirmation. Top-up → E013 supplementary
        // payment receipt (no second "order confirmed" mail for one order).
        try {
          await enqueueFromTemplateInternal(
            templateKey,
            leadRow.email,
            commonVars,
            {
              toName: leadRow.name ?? undefined,
              leadId: payment.lead_id,
              applicationId: applicationId ?? undefined,
              attachments: invoiceAttachment ? [invoiceAttachment] : undefined,
            },
          );
          await markInvoiceEmailedByPayment(payment.id, {
            recipient: leadRow.email,
            template: templateKey,
            attachmentFilename: invoiceAttachment?.filename ?? null,
            success: true,
            actorLabel: `payu-${opts.source}`,
          });
        } catch (e) {
          await markInvoiceEmailedByPayment(payment.id, {
            recipient: leadRow.email,
            template: templateKey,
            attachmentFilename: invoiceAttachment?.filename ?? null,
            success: false,
            error: e instanceof Error ? e.message : String(e),
            actorLabel: `payu-${opts.source}`,
          });
        }
      }
    }
  } catch (e) {
    console.error("[finalize] email pipeline failed", e);
  }

  // Note: Form pending timers (4h nudge -> 8h auto-close) are armed only when staff
  // clicks B001 (Send Form Link / Form Not Submitted), not automatically on payment completion.


  return { ok: true, applicationId };
}
