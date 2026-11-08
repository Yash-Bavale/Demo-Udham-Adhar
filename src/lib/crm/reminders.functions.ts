// Staff actions that queue customer reminder emails (Final_CRM Part D + Part J #1).
// Wired into Dashboard "Send reminder" button + Lead Detail "Send Reminder".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

const ALLOWED = ["super_admin", "admin", "manager", "executive", "operations", "support"] as const;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const Input = z
  .object({
    leadId: z.string().uuid().optional(),
    applicationId: z.string().uuid().optional(),
  })
  .refine((v) => v.leadId || v.applicationId, {
    message: "leadId or applicationId required",
  });

/**
 * Queue a manual reminder email to the customer and log an activity row.
 */
export const queueDocumentReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...ALLOWED]);
    const admin = await getAdmin();

    // Resolve lead via leadId or applicationId.
    let leadId = data.leadId ?? null;
    let applicationId = data.applicationId ?? null;
    if (!leadId && applicationId) {
      const { data: app } = await admin
        .from("applications")
        .select("id, lead_id, application_code")
        .eq("id", applicationId)
        .maybeSingle();
      if (!app?.lead_id) throw new Error("Application or lead not found");
      leadId = app.lead_id;
    }

    const { data: lead } = await admin
      .from("leads")
      .select("id, name, email, mobile, service, lead_code")
      .eq("id", leadId!)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (!lead.email) throw new Error("Customer has no email on file");

    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const appCode = await resolveApplicationCode(lead.id, { applicationId });
    if (!appCode) throw new Error("Order number not ready yet — please retry in a moment.");

    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
    try {
      await enqueueFromTemplateInternal(
        "bhs_e005_manual_reminder",
        lead.email,
        {
          customer_name: lead.name ?? "Customer",
          service_name: lead.service ?? "your service",
          order_number: appCode,
          message: "Please upload the pending documents to continue.",
        },
        { toName: lead.name ?? undefined, leadId: lead.id, applicationId: applicationId ?? undefined, trigger: "manual" },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Template missing (Phase 9 not yet run)?  Surface a clean message so the
      // UI toast can guide the operator.
      throw new Error(
        msg.includes("not found")
          ? "Manual reminder template is missing."
          : msg,
      );
    }

    await admin.from("activity_logs").insert({
      lead_id: lead.id,
      application_id: applicationId,
      user_id: context.userId,
      activity_type: "reminder_sent",
      activity_description: `Document reminder email queued to ${lead.email}`,
    });

    return { ok: true, queuedTo: lead.email };
  });
