import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function logActivity(
  applicationId: string,
  leadId: string | null,
  userId: string,
  activity_type: string,
  description: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activity_logs").insert({
    lead_id: leadId,
    application_id: applicationId,
    user_id: userId,
    activity_type,
    activity_description: description,
  });
}

async function assertStaff(supabase: any, userId: string) {
  const { data: isStaff } = await supabase.rpc("has_any_staff_role", {
    _user_id: userId,
  });
  if (!isStaff) throw new Error("Forbidden");
}

const disabled = () => {
  throw new Error("Legacy cancellation email flow is disabled. Use Support Ticket or Close / Refund actions.");
};

export const requestCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid().optional() }).passthrough().parse(d))
  .handler(async () => disabled());

export const sendConcernReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async () => disabled());

export const sendRefundDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async () => disabled());

export const acknowledgePostClosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async () => disabled());

export const cancelClosureWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        closure_stage: "none",
        closure_next_at: null,
        closure_reason_code: null,
        closure_reason_text: null,
        cancellation_requested_at: null,
      } as never)
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);
    await logActivity(data.applicationId, null, context.userId, "cancellation_reverted", "Legacy cancellation workflow cleared by staff");
    return { ok: true };
  });

export const _CANCEL_SUPPORT_EMAIL = "help@businesshelpservices.com";

export const resumeCancelledOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        applicationId: z.string().uuid(),
        toStatus: z
          .enum([
            "order_received",
            "details_pending",
            "details_received",
            "under_process",
            "submitted_to_gov",
          ])
          .default("order_received"),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Forbidden — super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, lead_id, fulfillment_status, closure_stage, workflow_status")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr || !app) throw new Error("Application not found");

    await supabaseAdmin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("application_id", app.id)
      .eq("status", "pending");

    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        fulfillment_status: data.toStatus,
        workflow_status: "processing_resumed",
        workflow_delay_reason: null,
        workflow_expected_review_at: null,
        closure_stage: "none",
        closure_next_at: null,
        closure_reason_code: null,
        closure_reason_text: null,
        cancellation_requested_at: null,
      } as never)
      .eq("id", app.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("workflow_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: "resumed",
      title: "Cancelled order resumed by super admin",
      description: data.note ?? null,
      customer_visible: false,
      actor_id: context.userId,
      is_system: false,
      metadata: {
        from_fulfillment_status: (app as any).fulfillment_status ?? null,
        from_closure_stage: (app as any).closure_stage ?? null,
        to_fulfillment_status: data.toStatus,
      },
    } as never);

    await logActivity(
      app.id,
      app.lead_id,
      context.userId,
      "cancellation_resumed",
      `Cancelled order resumed by super admin → ${data.toStatus}${data.note ? ` — ${data.note}` : ""}`,
    );

    return { ok: true };
  });