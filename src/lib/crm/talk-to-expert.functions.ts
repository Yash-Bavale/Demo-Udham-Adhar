import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";
import { isTalkToExpertLead, isUnconvertedConsultationLead } from "@/lib/crm/consultation";

const STAFF_ROLES = [
  "super_admin", "admin", "manager", "executive",
  "support", "accounts", "finance", "operations",
] as const;

const SelectInput = z.object({
  leadId: z.string().uuid(),
  serviceId: z.string().uuid(),
});
const LeadOnlyInput = z.object({ leadId: z.string().uuid() });

function appOrigin() {
  return process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://udyamadhar.in";
}
function newTrackingToken(leadCode: string) {
  return `LNK-${leadCode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

/**
 * Step 1: Staff picks the customer's actual service after the consultation call.
 * - Updates the lead with new service + pricing.
 * - Voids prior pending links, mints a fresh `payment_links` row.
 * - DOES NOT email the customer. UI then exposes Send / Copy buttons.
 */
export const selectConsultationService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SelectInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, lead_code, name, email, mobile, service, lead_source")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead not found");
    if (!isTalkToExpertLead(lead)) {
      throw new Error("This lead is not a Talk-to-Expert consultation.");
    }
    if (!isUnconvertedConsultationLead(lead)) {
      throw new Error("Lead has already been converted to a service.");
    }

    const { data: svc, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, service_name, base_amount, gst_amount, total_amount, is_active")
      .eq("id", data.serviceId)
      .maybeSingle();
    if (svcErr) throw new Error(svcErr.message);
    if (!svc || !svc.is_active) throw new Error("Service unavailable.");

    const base = Number(svc.base_amount ?? 0);
    const gst = Number(svc.gst_amount ?? 0);
    const total = Number(svc.total_amount ?? base + gst);
    const leadCode = lead.lead_code ?? lead.id;
    const txnid = newTrackingToken(leadCode);
    const paymentUrl = `${appOrigin()}/payment/${encodeURIComponent(leadCode)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Update lead → new service + pricing + status + consultation marker
    // We stamp lead_source so post-conversion detection works regardless of the
    // original capture source (website, ads, etc.).
    const originalSource = (lead as any).lead_source ?? null;
    const { error: updErr } = await supabaseAdmin
      .from("leads")
      .update({
        service: svc.service_name,
        service_id: svc.id,
        base_amount: base,
        gst_amount: gst,
        total_amount: total,
        status: "payment_pending",
        lead_status_v2: "payment_pending",
        lead_source: "talk_to_expert_converted",
      } as never)
      .eq("id", lead.id);
    if (updErr) throw new Error(updErr.message);

    // 2. Mark the existing paid consultation order as awaiting the 2nd payment.
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (app?.id) {
      await supabaseAdmin
        .from("applications")
        .update({
          service_id: svc.id,
          application_status: "awaiting_payment",
          workflow_status: "waiting_for_customer",
          workflow_priority: "high",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", app.id);

      await supabaseAdmin.from("workflow_events").insert({
        application_id: app.id,
        lead_id: lead.id,
        event_type: "consultation_service_selected",
        title: "Consultation service selected",
        description: `Staff selected service: ${svc.service_name}. Awaiting customer payment.`,
        customer_visible: false,
        actor_id: context.userId,
        actor_name: "Staff",
        is_system: false,
        metadata: { service_id: svc.id, service_name: svc.service_name, payment_url: paymentUrl, original_lead_source: originalSource } as never,
      } as never);
    }

    // 3. Activity log
    await supabaseAdmin.from("activity_logs").insert({
      lead_id: lead.id,
      user_id: context.userId,
      activity_type: "service_selected",
      activity_description: `Service selected after consultation: ${svc.service_name}`,
      metadata: { service_id: svc.id, service_name: svc.service_name } as never,
    } as never);

    // 4. Void any existing pending links, mint a fresh one
    await supabaseAdmin
      .from("payment_links" as any)
      .update({ status: "expired" } as any)
      .eq("lead_id", lead.id)
      .eq("status", "pending");

    const { error: linkErr } = await supabaseAdmin
      .from("payment_links" as any)
      .insert({
        lead_id: lead.id,
        txnid,
        payment_url: paymentUrl,
        amount: total,
        status: "pending",
        expires_at: expiresAt,
        created_by: context.userId,
      } as any);
    if (linkErr) throw new Error(linkErr.message);

    const { withCheckoutToken } = await import("@/lib/security/customer-access.server");
    const securePaymentUrl = (await withCheckoutToken(paymentUrl, lead.id, context.userId)) ?? paymentUrl;
    return { ok: true as const, paymentUrl: securePaymentUrl, txnid, amount: total };
  });

/**
 * Step 2: Staff hits "Send Payment Link" — emails the customer the link
 * using the `consultation_service_converted` template. Idempotent.
 */
export const sendConsultationPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadOnlyInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, lead_code, name, email, service, total_amount")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead not found");
    if (!lead.email) throw new Error("Customer has no email on file.");

    const { data: link } = await supabaseAdmin
      .from("payment_links" as any)
      .select("payment_url, amount, status, expires_at")
      .eq("lead_id", lead.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!link) throw new Error("No active payment link. Please select the service again.");

    const leadCode = lead.lead_code ?? lead.id;
    const total = Number((link as any).amount ?? lead.total_amount ?? 0);
    const paymentUrl = (link as any).payment_url as string;

    const { data: appRow } = await supabaseAdmin
      .from("applications")
      .select("id, application_code")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const orderNumber = (appRow as any)?.application_code
      ?? (await resolveApplicationCode(lead.id, { applicationId: (appRow as any)?.id ?? null }));
    if (!orderNumber) throw new Error("Order number not ready yet — please retry in a moment.");

    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
    await enqueueFromTemplateInternal("payment_link", lead.email, {
      customer_name: lead.name ?? "Customer",
      name: lead.name ?? "Customer",
      service_name: lead.service ?? "your consultation",
      service: lead.service ?? "your consultation",
      order_number: orderNumber,
      lead_code: leadCode,
      payment_url: paymentUrl,
      total_amount: total.toFixed(2),
    }, {
      toName: lead.name ?? undefined,
      leadId: lead.id,
    });

    await supabaseAdmin.from("activity_logs").insert({
      lead_id: lead.id,
      user_id: context.userId,
      activity_type: "payment_link_sent",
      activity_description: `Payment link emailed to ${lead.email}`,
      metadata: { payment_url: paymentUrl } as never,
    } as never);

    return { ok: true as const };
  });

/**
 * Staff "Change Service" — voids the active pending link and reverts the lead's
 * service label so the select step reappears. The original consultation payment
 * is unaffected.
 */
export const resetConsultationSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadOnlyInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF_ROLES] as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, lead_source")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");

    await supabaseAdmin
      .from("payment_links" as any)
      .update({ status: "expired" } as any)
      .eq("lead_id", lead.id)
      .eq("status", "pending");

    // Restore the consultation service label so the select step renders again.
    await supabaseAdmin
      .from("leads")
      .update({
        service: "Talk To Expert – Suitable Service Selection",
        service_id: null,
        status: "new_lead",
        lead_status_v2: "new_lead",
      } as never)
      .eq("id", lead.id);

    await supabaseAdmin.from("activity_logs").insert({
      lead_id: lead.id,
      user_id: context.userId,
      activity_type: "service_selection_reset",
      activity_description: "Staff reverted consultation selection to pick a different service.",
    } as never);

    return { ok: true as const };
  });

/**
 * @deprecated Kept for backwards compatibility. New UI uses
 * `selectConsultationService` + `sendConsultationPaymentLink` separately.
 */
export const convertConsultationLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SelectInput.parse(i))
  .handler(async ({ data }) => {
    await selectConsultationService({ data });
    await sendConsultationPaymentLink({ data: { leadId: data.leadId } });
    return { ok: true as const };
  });
