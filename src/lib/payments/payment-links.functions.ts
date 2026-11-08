import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

const STAFF_ROLES = ["super_admin", "admin", "manager", "executive", "support", "accounts", "finance", "operations"] as const;

function appOrigin() {
  return process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://udyamadhar.in";
}

function newTrackingToken(leadCode: string) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `LNK-${leadCode}-${ts}-${rnd}`.toUpperCase();
}

const LeadIdInput = z.object({ leadId: z.string().uuid() });

/**
 * Create (or reuse) a self-checkout payment link for a lead.
 * The URL always points to `/payment/$leadCode` which initiates a fresh PayU
 * order when the customer opens it. The `payment_links` row is just a record
 * of who shared the link, when, and whether the lead eventually paid.
 */
export const createPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadIdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, lead_code, name, mobile, email, service, total_amount, base_amount, gst_amount, status, lead_status_v2")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead?.lead_code) throw new Error("Lead not found");

    // If already paid and no balance/pending status, don't issue a link.
    const { data: paidRows } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("lead_id", lead.id)
      .eq("status", "paid");
    const paidSum = (paidRows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const totalAmt = Number(lead.total_amount ?? 0);
    const isPending = lead.status === "payment_pending" || lead.lead_status_v2 === "payment_pending";
    if (paidRows && paidRows.length > 0 && totalAmt <= paidSum && !isPending) {
      throw new Error("This lead has already paid in full. No new link needed.");
    }

    // Reuse the most recent pending, non-expired link instead of minting a new one.
    const nowIso = new Date().toISOString();
    const { data: existing } = await supabaseAdmin
      .from("payment_links" as any)
      .select("id, txnid, payment_url, amount, status, created_at, expires_at")
      .eq("lead_id", lead.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { withCheckoutToken } = await import("@/lib/security/customer-access.server");
    if (existing && (!(existing as any).expires_at || (existing as any).expires_at > nowIso)) {
      return {
        ...(existing as any),
        payment_url: await withCheckoutToken((existing as any).payment_url, lead.id, context.userId),
        amount: Number((existing as any).amount),
        leadCode: lead.lead_code,
        isReused: true,
      };
    }

    const txnid = newTrackingToken(lead.lead_code);
    const paymentUrl = `${appOrigin()}/payment/${encodeURIComponent(lead.lead_code)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("payment_links" as any)
      .insert({
        lead_id: lead.id,
        txnid,
        payment_url: paymentUrl,
        amount: Number(lead.total_amount ?? 0),
        status: "pending",
        expires_at: expiresAt,
        created_by: context.userId,
      } as any)
      .select("id, txnid, payment_url, amount, status, created_at, expires_at")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Could not create payment link");

    // Update lead status to payment_pending if currently new/contacted
    if (
      ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.status ?? "") ||
      ["new_lead", "contacted", "follow_up_required", "lead_created"].includes(lead.lead_status_v2 ?? "")
    ) {
      await supabaseAdmin
        .from("leads")
        .update({ status: "payment_pending", lead_status_v2: "payment_pending" } as any)
        .eq("id", lead.id);
    }

    return {
      ...(inserted as any),
      payment_url: await withCheckoutToken((inserted as any).payment_url, lead.id, context.userId),
      amount: Number((inserted as any).amount),
      leadCode: lead.lead_code,
      isReused: false,
    };
  });

/** Poll a lead's most recent link status (UI auto-refreshes every 15s). */
export const getPaymentLinkStatusForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadIdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link } = await supabaseAdmin
      .from("payment_links" as any)
      .select("id, txnid, payment_url, amount, status, created_at, expires_at, opened_at, paid_at, payment_id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) return { link: null, paid: false };

    // Source of truth is the link row itself. The PayU finalize pipeline flips
    // payment_links.status to 'paid' + stamps paid_at + payment_id when the
    // matching payment settles. Inferring "paid" from unrelated payments (e.g.
    // an earlier ₹99 consultation charge, or a top-up sibling) caused false
    // "Payment Received" banners on Talk-to-Expert / service-change flows.
    const linkRow: any = link;
    let isPaid = linkRow.status === "paid";

    // 1. If the link is not paid yet, only a payment that actually settled
    //    FOR THIS LINK may mark it paid: it must be created after the link was
    //    issued and match the link amount. Matching any older paid payment
    //    (the original order fee) marked unpaid top-ups as paid — a real
    //    financial mis-statement, so never relax this.
    if (!isPaid) {
      const linkAmount = Number(linkRow.amount ?? 0);
      const { data: paidPayment } = await supabaseAdmin
        .from("payments")
        .select("id, amount, created_at")
        .eq("lead_id", data.leadId)
        .eq("status", "paid")
        .gte("created_at", linkRow.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const amountMatches =
        !!paidPayment && linkAmount > 0 &&
        Math.abs(Number(paidPayment.amount ?? 0) - linkAmount) < 0.01;

      if (paidPayment && amountMatches) {
        await supabaseAdmin
          .from("payment_links" as any)
          .update({ status: "paid", paid_at: new Date().toISOString(), payment_id: paidPayment.id } as any)
          .eq("lead_id", data.leadId)
          .eq("status", "pending");

        try {
          const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
          await finalizePaidPayment(paidPayment.id, { source: "reconcile" });
        } catch { /* ignore */ }

        isPaid = true;
        linkRow.status = "paid";
        linkRow.paid_at = paidPayment.created_at;
        linkRow.payment_id = paidPayment.id;
      }
    }

    // 2. If still not paid, query payment gateway API for any attempted payment rows for this lead.
    if (!isPaid) {
      const { data: attemptedPayments } = await supabaseAdmin
        .from("payments")
        .select("id, gateway_name, transaction_id, razorpay_order_id")
        .eq("lead_id", data.leadId)
        .in("status", ["created", "attempted"])
        .order("created_at", { ascending: false })
        .limit(5);

      for (const p of attemptedPayments ?? []) {
        const txnid = p.transaction_id || p.razorpay_order_id;
        if (!txnid) continue;
        const gw = String(p.gateway_name ?? "payu").toLowerCase();

        if (gw === "payu") {
          try {
            const { verifyPayUPayment } = await import("@/lib/payments/payu.server");
            const verified = await verifyPayUPayment(txnid);
            const status = String(verified?.status ?? "").trim().toLowerCase();
            const unmapped = String(verified?.unmappedstatus ?? "").trim().toLowerCase();
            if (status === "success" || unmapped === "captured") {
              const mihpayid = verified?.mihpayid ? String(verified.mihpayid) : null;
              await supabaseAdmin.from("payments").update({
                status: "paid",
                payment_date: new Date().toISOString(),
                razorpay_payment_id: mihpayid,
                payu_mihpayid: mihpayid,
                raw_response: { verified_payment: verified, source: "link-status-auto-check" } as any,
              } as any).eq("id", p.id);

              const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
              await finalizePaidPayment(p.id, { source: "reconcile", txnid, mihpayid });

              isPaid = true;
              linkRow.status = "paid";
              linkRow.paid_at = new Date().toISOString();
              linkRow.payment_id = p.id;
              break;
            }
          } catch (e) {
            console.error("[getPaymentLinkStatus] PayU verify failed for txnid", txnid, e);
          }
        } else if (gw === "ccavenue") {
          try {
            const { callOrderStatusApi } = await import("@/lib/payments/ccavenue.server");
            const reconciled = await callOrderStatusApi(txnid);
            if (reconciled.status === "paid") {
              await supabaseAdmin.from("payments").update({
                status: "paid",
                payment_date: new Date().toISOString(),
                raw_response: { reconciled: reconciled.raw, source: "link-status-auto-check" } as any,
              } as any).eq("id", p.id);

              const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
              await finalizePaidPayment(p.id, { source: "reconcile", txnid, mihpayid: reconciled.trackingId || null });

              isPaid = true;
              linkRow.status = "paid";
              linkRow.paid_at = new Date().toISOString();
              linkRow.payment_id = p.id;
              break;
            }
          } catch (e) {
            console.error("[getPaymentLinkStatus] CCAvenue verify failed for orderId", txnid, e);
          }
        }
      }
    }

    let paidAmount: number | null = null;
    if (isPaid && linkRow.payment_id) {
      const { data: p } = await supabaseAdmin
        .from("payments")
        .select("amount")
        .eq("id", linkRow.payment_id)
        .maybeSingle();
      paidAmount = p?.amount != null ? Number(p.amount) : Number(linkRow.amount);
    } else if (isPaid) {
      paidAmount = Number(linkRow.amount);
    }

    if (!isPaid) {
      const { withCheckoutToken } = await import("@/lib/security/customer-access.server");
      linkRow.payment_url = await withCheckoutToken(linkRow.payment_url, data.leadId, context.userId);
    }
    return {
      link: { ...linkRow, amount: Number(linkRow.amount) },
      paid: isPaid,
      paidAt: linkRow.paid_at ?? null,
      paidAmount,
    };
  });


/** Force a brand-new link, voiding any pending ones for the same lead. */
export const regeneratePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadIdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("payment_links" as any)
      .update({ status: "expired" } as any)
      .eq("lead_id", data.leadId)
      .eq("status", "pending");

    // Reuse the same create-link path now that no pending row exists.
    return createPaymentLink({ data });
  });

/** Send a professional HTML payment link email directly to the lead. */
export const sendPaymentLinkEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadIdInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueEmailInternal } = await import("@/lib/emails/emails.server");

    // 1. Create or fetch existing payment link
    const linkRes = await createPaymentLink({ data: { leadId: data.leadId } });
    const paymentUrl = (linkRes as any).payment_url;

    // 2. Fetch lead details
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, lead_code, name, email, service, total_amount")
      .eq("id", data.leadId)
      .single();

    if (!lead || !lead.email) {
      throw new Error("Lead email not found. Please add a valid email first.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const executiveName = profile?.display_name || profile?.email || "Executive";

    const customerName = lead.name || "Customer";
    const serviceName = lead.service || "Requested Service";
    const amount = Number(lead.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const leadCode = lead.lead_code || lead.id.slice(0, 8);

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Complete Your Payment – Order No. ${leadCode}</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">

      <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Complete Your Payment</span>
      </td></tr>

      <tr><td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear ${customerName},</p>
        <p style="margin:0 0 12px 0;">Greetings from Business Help Services.</p>
        <p style="margin:0 0 12px 0;">Please find below the secure payment link to complete the payment for your requested service. Kindly complete the payment at the earliest to enable us to proceed further.</p>
      </td></tr>

      <tr><td style="padding:26px 30px 8px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Payment Summary</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:14px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">${leadCode}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">${serviceName}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Amount Payable</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">&#8377;${amount}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; vertical-align:top;">Payment Status</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; vertical-align:top;">Pending</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:24px 30px 4px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#12315C; border-radius:5px;">
            <a href="${paymentUrl}" style="display:inline-block; padding:14px 36px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; font-weight:700; color:#ffffff; text-decoration:none; letter-spacing:0.3px;">Pay Now</a>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12.5px; line-height:1.6; color:#5B6270; text-align:center;">If the button above does not work, copy and paste this link into your browser:<br/><a href="${paymentUrl}" style="color:#12315C; text-decoration:underline;">${paymentUrl}</a></td></tr>

      <tr><td style="padding:26px 30px 8px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Important Information</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:10px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>This payment link is generated specifically for your order and is intended for your use only.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Please do not share this payment link with anyone else.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Upon successful payment, you will receive a confirmation email along with the Tax Invoice for your records.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Further processing of your requested service will commence only after successful payment confirmation.</td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:24px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 0 0;">If you have any questions or require assistance, kindly reply to this email or contact our Customer Care Team during business hours.</p>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>

      <tr><td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; color:#12315C;">IMPORTANT LINKS</td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12.5px; color:#5B6270; line-height:2;"><a href="https://udyamadhar.in/terms-conditions" style="color:#12315C; text-decoration:none; font-weight:600;">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/refund-cancellation-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Refund &amp; Cancellation Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/privacy-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/disclaimer" style="color:#12315C; text-decoration:none; font-weight:600;">Disclaimer</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/service-delivery-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Service Delivery Policy</a></td></tr>

      <tr><td style="padding:24px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 6px 0;">Regards,<br/>${executiveName}<br/>Customer Care Team</p>
        <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
        <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
      </td></tr>
      <tr><td style="padding:22px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
          <tr><td style="padding:14px 16px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
            <p style="margin:8px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an automatically generated system email containing a secure payment link for your order. This email does not confirm that payment has been received. A separate confirmation email along with the Tax Invoice will be sent once your payment is successfully received and processed. Business Help Services maintains electronic records of payment link generation, customer communications, and transaction activities for operational, compliance, audit, and record-keeping purposes.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

    await enqueueEmailInternal({
      toEmail: lead.email,
      toName: lead.name ?? null,
      subject: `Complete Your Payment – Order No. ${leadCode}`,
      bodyHtml: htmlBody,
      leadId: lead.id,
      allowWithoutTemplate: true,
      requireImmediateSuccess: true,
    });

    // Also record event log
    await supabaseAdmin.from("application_events").insert({
      lead_id: lead.id,
      event_type: "payment_link_emailed",
      new_value: `Payment link emailed to ${lead.email} (${paymentUrl})`,
      created_by: context.userId,
    } as any);

    return { ok: true, message: `Payment link email sent to ${lead.email}` };
  });
