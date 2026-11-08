import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LEAD_STATUSES_V2,
  LEAD_TRANSITIONS_V2,
  LEAD_STATUS_EMAIL,
  LEAD_AUTO_CHAIN,
  type LeadStatusV2,
} from "./lead-transitions";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function getStaff(supabase: Awaited<ReturnType<typeof getAdmin>>, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const staff_name = profile?.display_name || profile?.email || "Staff";
  const staff_role = roles?.[0]?.role ?? "staff";
  return { staff_name, staff_role };
}

async function queueEmailForStatus(opts: {
  status: LeadStatusV2;
  leadId: string;
  toEmail: string;
  toName: string | null;
  applicationId?: string | null;
  variables?: Record<string, unknown>;
  createdBy: string;
}) {
  const templateCode = LEAD_STATUS_EMAIL[opts.status];
  if (!templateCode || !opts.toEmail) return;
  const admin = await getAdmin();
  const { data: tpl } = await admin
    .from("email_templates")
    .select("code, subject, body_html, body_text, variables")
    .eq("code", templateCode)
    .maybeSingle();
  const subject = tpl?.subject ?? `[${templateCode}] Update on your order`;
  const body_html = tpl?.body_html ?? `<p>Hi {{name}}, this is an automated notice regarding your order. (template: ${templateCode})</p>`;
  const body_text = tpl?.body_text ?? null;
  await admin.from("email_queue").insert({
    template_code: templateCode,
    to_email: opts.toEmail,
    to_name: opts.toName,
    subject,
    body_html,
    body_text,
    variables: { ...(opts.variables ?? {}), lead_id: opts.leadId, status: opts.status },
    lead_id: opts.leadId,
    application_id: opts.applicationId ?? null,
    created_by: opts.createdBy,
  } as never);
}

const TransitionInput = z.object({
  leadId: z.string().uuid(),
  toStatus: z.enum(LEAD_STATUSES_V2 as [string, ...string[]]),
  reason: z.string().trim().min(1).max(2000).optional(),
});

/**
 * Transition a lead's status. Enforces the allowed-transitions map on the
 * server, logs to application_events, queues the mapped email, and runs the
 * auto-chain (refunded → closed_refunded). `uninterested` requires a reason
 * and auto-chains to refund_requested per spec.
 */
export const transitionLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TransitionInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { leadId } = data;
    const toStatus = data.toStatus as LeadStatusV2;

    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, lead_code, name, email, mobile, customer_id, lead_status_v2, status")
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) throw new Error("Lead not found");

    const fromStatus = (lead.lead_status_v2 ?? "new_lead") as LeadStatusV2;
    if (fromStatus === toStatus) return { ok: true, noop: true };

    const allowed = LEAD_TRANSITIONS_V2[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new Error(`Transition not allowed: ${fromStatus} → ${toStatus}`);
    }

    if (toStatus === "uninterested" && !data.reason) {
      throw new Error("Reason is required when marking a lead as uninterested.");
    }

    // Gate: under_process → closed requires fulfillment_status='completed'.
    if (fromStatus === "under_process" && toStatus === "closed") {
      const { data: app } = await admin
        .from("applications")
        .select("id, fulfillment_status")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!app || app.fulfillment_status !== "completed") {
        throw new Error("Cannot close: linked order is not yet completed.");
      }
    }

    // Latest application for event linkage.
    const { data: latestApp } = await admin
      .from("applications")
      .select("id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { staff_name, staff_role } = await getStaff(admin, context.userId);

    // Update lead.
    const { error: updErr } = await admin
      .from("leads")
      .update({ lead_status_v2: toStatus } as never)
      .eq("id", leadId);
    if (updErr) throw new Error(updErr.message);

    // Mirror to legacy `status` column so leads list/dashboards reflect the change.
    // Silently ignore if the target enum value isn't allowed on the legacy column.
    try {
      await admin.from("leads").update({ status: toStatus } as never).eq("id", leadId);
    } catch { /* legacy enum mismatch — safe to ignore */ }

    // Log event.
    await admin.from("application_events").insert({
      application_id: latestApp?.id ?? null,
      lead_id: leadId,
      customer_id: lead.customer_id ?? null,
      event_type: "lead_status_change",
      old_value: fromStatus,
      new_value: toStatus,
      note: data.reason ?? null,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    // Also mirror to activity_logs so it appears in the lead timeline UI.
    const pretty = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    await admin.from("activity_logs").insert({
      lead_id: leadId,
      application_id: latestApp?.id ?? null,
      activity_type: "lead_status_change",
      activity_description: `Lead status: ${pretty(fromStatus)} → ${pretty(toStatus)}${data.reason ? ` — ${data.reason}` : ""}`,
      user_id: context.userId,
    } as never);

    // Email side effect.
    if (lead.email) {
      await queueEmailForStatus({
        status: toStatus,
        leadId,
        toEmail: lead.email,
        toName: lead.name,
        applicationId: latestApp?.id ?? null,
        variables: { lead_code: lead.lead_code, name: lead.name, reason: data.reason },
        createdBy: context.userId,
      });
    }

    // Auto-chain: uninterested → refund_requested.
    if (toStatus === "uninterested") {
      await admin.from("leads").update({ lead_status_v2: "refund_requested" } as never).eq("id", leadId);
      // Stamp refund_requested_at on latest application.
      if (latestApp?.id) {
        await admin
          .from("applications")
          .update({
            refund_requested_at: new Date().toISOString(),
            refund_reason: data.reason ?? null,
          } as never)
          .eq("id", latestApp.id);
      }
      await admin.from("application_events").insert({
        application_id: latestApp?.id ?? null,
        lead_id: leadId,
        customer_id: lead.customer_id ?? null,
        event_type: "lead_status_change",
        old_value: "uninterested",
        new_value: "refund_requested",
        note: "Auto-transition after uninterested.",
        created_by: context.userId,
        staff_name,
        staff_role: "system",
      } as never);
    }

    // Generic auto-chain (e.g. refunded → closed_refunded).
    const chain = LEAD_AUTO_CHAIN[toStatus];
    if (chain) {
      await admin.from("leads").update({ lead_status_v2: chain } as never).eq("id", leadId);
      await admin.from("application_events").insert({
        application_id: latestApp?.id ?? null,
        lead_id: leadId,
        customer_id: lead.customer_id ?? null,
        event_type: "lead_status_change",
        old_value: toStatus,
        new_value: chain,
        note: "Auto-chain.",
        created_by: context.userId,
        staff_name,
        staff_role: "system",
      } as never);
    }

    return { ok: true, from: fromStatus, to: toStatus };
  });

/** Add a manual internal note → application_events. */
export const addManualNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ leadId: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: lead } = await admin
      .from("leads")
      .select("id, customer_id")
      .eq("id", data.leadId)
      .single();
    if (!lead) throw new Error("Lead not found");
    const { data: latestApp } = await admin
      .from("applications")
      .select("id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { staff_name, staff_role } = await getStaff(admin, context.userId);
    const { error } = await admin.from("application_events").insert({
      application_id: latestApp?.id ?? null,
      lead_id: data.leadId,
      customer_id: lead.customer_id ?? null,
      event_type: "note_added",
      note: data.note,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Read the application_events timeline for a lead. */
export const listLeadEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: events, error } = await admin
      .from("application_events")
      .select("id, event_type, old_value, new_value, note, staff_name, staff_role, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { events: events ?? [] };
  });
