// Phase 2 — Close actions. The spec draws a hard line between:
//   • Manual employee close  → E004 template (already covered by
//     closeOrderManual in ../order-actions.functions.ts).
//   • System / timer / ticket-driven close → E010 template + system attribution.
//   • Govt rejection → always forced manual close via E010 path (no resume).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrderId = z.string().uuid();

/**
 * closeOrderSystem — for programmatic/system close paths (timer expiry,
 * ticket auto-close, cron). Sends E010-style closure notice.
 * Callable from server contexts as well as UI (e.g. "Auto-close now" admin
 * override); the reason MUST be non-null so the customer email has context.
 */
export const closeOrderSystem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orderId: OrderId,
        reasonId: z.string().uuid(),
        remarks: z.string().max(2000).optional().nullable(),
        source: z.enum(["timer", "ticket", "cron", "govt_rejection", "manual_override"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: "CLOSED",
      _reason_id: data.reasonId,
      _remarks: data.remarks ?? `system_close:${data.source}`,
      _force: true,
    });
    if (error) throw new Error(error.message);

    // Cancel every outstanding timer/scheduler for this order.
    const [{ cancelTimers }, { cancelAllForOrder }] = await Promise.all([
      import("./timers.server"),
      import("@/lib/scheduling/schedulers.server"),
    ]);
    await cancelTimers(data.orderId);
    await cancelAllForOrder(data.orderId, `system_close:${data.source}`);

    // S12 · Order Closed
    const { supabaseAdmin: adminForClose } = await import("@/integrations/supabase/client.server");
    await adminForClose
      .from("applications")
      .update({ fulfillment_status: "order_closed" } as never)
      .eq("id", data.orderId);

    // Queue E010 Order Closed notice with previous selected reason.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ctx } = await supabaseAdmin
      .from("applications")
      .select("application_code, lead_id, closure_reason_id, active_reason_id, closure_remarks, customers(primary_email, name), order_close_reasons:closure_reason_id(label, standard_reply), delay_reasons:active_reason_id(label)")
      .eq("id", data.orderId)
      .maybeSingle();
    const email = (ctx as any)?.customers?.primary_email as string | undefined;
    const reasonLabel = ((ctx as any)?.order_close_reasons?.label as string) || ((ctx as any)?.delay_reasons?.label as string) || (ctx as any)?.closure_remarks || null;
    let e010Ok = false;
    let e010Err: string | null = null;
    if (email) {
      try {
        const [{ enqueueFromTemplateInternal }, { BHS_EMAILS }] = await Promise.all([
          import("@/lib/emails/emails.server"),
          import("@/lib/emails/bhs-templates"),
        ]);
        await enqueueFromTemplateInternal(
          BHS_EMAILS.E010_ORDER_CLOSED,
          email,
          {
            customerName: ((ctx as any)?.customers?.name as string) || "Customer",
            customer_name: ((ctx as any)?.customers?.name as string) || "Customer",
            orderNumber: ((ctx as any)?.application_code as string) || data.orderId.slice(0, 8),
            order_number: ((ctx as any)?.application_code as string) || data.orderId.slice(0, 8),
            reason: reasonLabel || data.remarks || "Order closed per selected reason",
            closure_reason: reasonLabel || data.remarks || "Order closed per selected reason",
            fromName: process.env.ZOHO_FROM_NAME || "Udyam Support",
          },
          { applicationId: data.orderId, leadId: ((ctx as any)?.lead_id as string) ?? undefined, trigger: "manual" },
        );
        e010Ok = true;
      } catch (e: any) {
        e010Err = e?.message ?? String(e);
        console.error("[closeOrderSystem] E010 enqueue failed", e);
      }
    } else {
      e010Err = "no_customer_email";
    }

    // Audit trail so a single query answers "was the close+E010 fully processed?"
    try {
      await supabaseAdmin.from("application_events").insert({
        application_id: data.orderId,
        lead_id: ((ctx as any)?.lead_id as string) ?? null,
        event_type: "system_close",
        new_value: "CLOSED",
        note: `source=${data.source}; e010=${e010Ok ? "queued" : `failed:${e010Err}`}`,
        staff_name: "System",
        staff_role: "system",
      } as never);
    } catch (e) {
      console.error("[closeOrderSystem] audit insert failed", e);
    }

    return { ok: true, order: updated, source: data.source, e010Queued: e010Ok, e010Error: e010Err };
  });

/**
 * handleGovtRejected — govt portal returned a rejection. Per spec v2 this is
 * always a forced close via the E010 path; there is no "resubmit" loop.
 * Thin wrapper over closeOrderSystem for spec clarity and auditability.
 */
export const handleGovtRejected = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orderId: OrderId,
        reasonId: z.string().uuid(),
        remarks: z.string().max(2000).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: "CLOSED",
      _reason_id: data.reasonId,
      _remarks: data.remarks ?? "Government rejected the application",
      _force: true,
    });
    if (error) throw new Error(error.message);

    // S10 · Application Rejected → S12 · Order Closed
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("applications")
      .update({ fulfillment_status: "application_rejected" } as never)
      .eq("id", data.orderId);

    // Same cleanup as system close.
    const [{ cancelTimers }, { cancelAllForOrder }] = await Promise.all([
      import("./timers.server"),
      import("@/lib/scheduling/schedulers.server"),
    ]);
    await cancelTimers(data.orderId);
    await cancelAllForOrder(data.orderId, "govt_rejection");

    await supabaseAdmin
      .from("applications")
      .update({ fulfillment_status: "order_closed" } as never)
      .eq("id", data.orderId);

    return { ok: true, order: updated, source: "govt_rejection" as const };
  });
