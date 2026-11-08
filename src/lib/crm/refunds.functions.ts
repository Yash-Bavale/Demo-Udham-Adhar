import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { transitionLeadStatus } from "./lead-status.functions";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function assertFinanceOrAdmin(userId: string) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  const ok = roles.some((r) => ["admin", "super_admin", "finance"].includes(r));
  if (!ok) throw new Error("Forbidden: refund actions require admin or finance role.");
}

async function getStaff(userId: string) {
  const admin = await getAdmin();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    staff_name: profile?.display_name || profile?.email || "Staff",
    staff_role: roles?.[0]?.role ?? "staff",
  };
}

/** Approve a pending refund. Sets refund_approved_at/by and transitions lead → refund_approved. */
export const approveRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ leadId: z.string().uuid(), policyNote: z.string().trim().max(2000).optional() }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceOrAdmin(context.userId);
    const admin = await getAdmin();

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, customer_id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!app) throw new Error("No application found for this lead.");

    const { error: upErr } = await admin
      .from("applications")
      .update({
        fulfillment_status: "order_closed",
        workflow_status: "refund_closed",
        closure_stage: "refund_approved",
        refund_approved_at: new Date().toISOString(),
        refund_approved_by: context.userId,
      } as never)
      .eq("id", app.id);
    if (upErr) throw new Error(upErr.message);

    const { staff_name, staff_role } = await getStaff(context.userId);
    await admin.from("application_events").insert({
      application_id: app.id,
      lead_id: data.leadId,
      customer_id: app.customer_id ?? null,
      event_type: "refund_approved",
      note: data.policyNote ?? null,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    // Transition lead.
    await transitionLeadStatus({ data: { leadId: data.leadId, toStatus: "refund_approved" } });
    return { ok: true };
  });

/**
 * Mark refund processed by gateway. Inserts negative child payment, flips
 * original payment to refunded, stamps applications, invokes documents
 * deletion edge function, transitions lead → refunded (auto-chains to
 * closed_refunded).
 */
export const markRefundProcessed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        gatewayRef: z.string().trim().min(2).max(200),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceOrAdmin(context.userId);
    const admin = await getAdmin();

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, customer_id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!app) throw new Error("No application found for this lead.");

    // Find the original successful payment.
    const { data: origPayment } = await admin
      .from("payments")
      .select("id, amount, currency, gateway_name, customer_id")
      .eq("application_id", app.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!origPayment) throw new Error("No successful payment found to refund.");

    // Insert child refund payment row (negative amount).
    const { error: insErr } = await admin.from("payments").insert({
      lead_id: data.leadId,
      application_id: app.id,
      customer_id: origPayment.customer_id ?? null,
      parent_payment_id: origPayment.id,
      amount: -Math.abs(Number(origPayment.amount)),
      currency: origPayment.currency ?? "INR",
      status: "refunded",
      gateway_name: origPayment.gateway_name,
      transaction_id: data.gatewayRef,
      refund_reason: "refund_processed",
      payment_date: new Date().toISOString(),
    } as never);
    if (insErr) throw new Error(insErr.message);

    // Flip original payment.
    await admin
      .from("payments")
      .update({ status: "refunded" } as never)
      .eq("id", origPayment.id);

    // Stamp applications.
    await admin
      .from("applications")
      .update({
        refund_processed_at: new Date().toISOString(),
        refund_gateway_ref: data.gatewayRef,
      } as never)
      .eq("id", app.id);

    // NOTE: customer documents are intentionally NOT deleted on refund/close.
    // Deletion only happens on order completion. Closed/refunded orders must
    // keep their documents so the order can be reopened if needed.

    // Update refund_requests row status to processed
    await admin
      .from("refund_requests")
      .update({
        status: "processed",
        gateway_ref: data.gatewayRef,
        gateway_name: origPayment.gateway_name,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      } as never)
      .eq("application_id", app.id);

    // Invalidate revenue cache so revenue sheets & dashboards reflect minus entry instantly
    try {
      const { invalidateRevenueCache } = await import("@/lib/crm/revenue-admin.functions");
      invalidateRevenueCache();
    } catch (err) {
      console.error("[markRefundProcessed] invalidateRevenueCache failed:", err);
    }

    const { staff_name, staff_role } = await getStaff(context.userId);
    await admin.from("application_events").insert({
      application_id: app.id,
      lead_id: data.leadId,
      customer_id: app.customer_id ?? null,
      event_type: "refund_processed",
      note: `Refund processed via gateway ref ${data.gatewayRef}.`,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    // Transition → refunded (auto-chains to closed_refunded).
    await transitionLeadStatus({ data: { leadId: data.leadId, toStatus: "refunded" } });
    return { ok: true };
  });

/** Reject a pending refund. Transitions lead → closed with documented reason. */
export const rejectRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ leadId: z.string().uuid(), reason: z.string().trim().min(3).max(2000) }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertFinanceOrAdmin(context.userId);
    const admin = await getAdmin();
    const { data: app } = await admin
      .from("applications")
      .select("id, customer_id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { staff_name, staff_role } = await getStaff(context.userId);
    await admin.from("application_events").insert({
      application_id: app?.id ?? null,
      lead_id: data.leadId,
      customer_id: app?.customer_id ?? null,
      event_type: "refund_rejected",
      note: data.reason,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);
    await transitionLeadStatus({ data: { leadId: data.leadId, toStatus: "closed" } });
    return { ok: true };
  });
